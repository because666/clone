"""
batch_generate.py — 批量随机生成飞行轨迹 (多进程加速)

用法:
    python trajectory_lab/scripts/batch_generate.py --city shenzhen --n 2000

功能:
  1. 加载城市 POI，过滤被禁飞区覆盖的 demand
  2. 随机配对 N 对 (起, 降) demand POI
  3. 调用 planner 生成轨迹
  4. 输出到前端可读路径
"""
import sys
import json
import random
import logging
import argparse
import time
import multiprocessing as mp
from pathlib import Path

# 脚本移动到 scripts/ 后，ROOT 需要向上三级才能到达项目根目录
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from trajectory_lab.core.poi_loader import load_city_pois, report_blocked
from trajectory_lab.core.planner import plan

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("BatchGenerate")

OUTPUT_BASE = ROOT / "frontend" / "public" / "data" / "processed" / "trajectories"

def worker_plan(task_data):
    # 多进程 worker 函数
    a_lat, a_lon, b_lat, b_lon, city, fid, a_id, b_id, nfz_index = task_data
    return plan(
        a_lat, a_lon, b_lat, b_lon,
        nfz_index=nfz_index,
        city=city,
        flight_id=fid,
        from_poi_id=a_id,
        to_poi_id=b_id,
    )

def build_output(trajectories_results, city: str, target_concurrency: int = 500, cycle_duration: float = 0) -> dict:
    trajs = []
    
    # 1. 计算平均飞行时长
    total_duration = 0.0
    valid_count = 0
    for r in trajectories_results:
        if r and len(r.path) >= 2 and len(r.timestamps) >= 2:
            duration = r.timestamps[-1] - r.timestamps[0]
            total_duration += duration
            valid_count += 1
            
    avg_duration = total_duration / valid_count if valid_count > 0 else 0.0
    
    # 2. 如果未指定固定大周期，利用 Little's Law 计算周期长度 T_cycle = (N * W) / L
    if cycle_duration <= 0:
         if valid_count > 0:
             cycle_duration = (valid_count * avg_duration) / target_concurrency
         else:
             cycle_duration = 3600 # Fallback 1小时
    
    # 确保周期至少比单趟飞行时间长一点
    cycle_duration = max(cycle_duration, avg_duration * 1.5)

    global_max_ts = cycle_duration

    for r in trajectories_results:
        if not r or len(r.path) < 2:
            continue
            
        # 3. 为每条轨迹分配随机起飞延迟 offset
        offset = random.uniform(0, cycle_duration)
        
        # 将原有的相对时间戳加上偏移量
        shifted_timestamps = [round(t + offset, 3) for t in r.timestamps]
        
        trajs.append({
            "id": r.flight_id,
            "path": r.path,
            "timestamps": shifted_timestamps,
            "start_offset": round(offset, 3)
        })
        
        # 4. === 解决 TripsLayer 无限循环的首尾断层 ===
        # 如果这条航班在周期结束时刻仍然在飞，我们需要克隆一个它的“前世”镜像
        # 即把它的时间戳提早一个完整的轮回 (-cycle_duration)。
        # 这样当 Deck.gl 进度条从末尾突变归零时，零秒前就有渲染好的拖尾接盘。
        if shifted_timestamps[-1] > cycle_duration:
            ghost_timestamps = [round(t - cycle_duration, 3) for t in shifted_timestamps]
            trajs.append({
                "id": f"{r.flight_id}_ghost",
                "path": r.path,
                "timestamps": ghost_timestamps,
                "start_offset": round(offset - cycle_duration, 3)
            })
        
    return {
        "timeRange": {"min": 0, "max": round(global_max_ts, 3)},
        "cycleDuration": round(cycle_duration, 3),
        "totalFlights": len(trajs),
        "sampledFlights": len(trajs),
        "trajectories": trajs,
        "_meta": {
            "city": city,
            "algo": trajectories_results[0].algo if trajectories_results else "unknown",
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        },
    }

def main():
    parser = argparse.ArgumentParser(description="批量生成无人机飞行轨迹")
    parser.add_argument("--city", default="shenzhen", help="目标城市（默认 shenzhen）")
    parser.add_argument("--n", type=int, default=1000, help="生成轨迹条数（默认 1000）")
    parser.add_argument("--min-dist", type=float, default=400.0, help="最短飞行距离（米，默认 400）")
    parser.add_argument("--max-dist", type=float, default=8000.0, help="最长飞行距离（米，默认 8000）")
    parser.add_argument("--seed", type=int, default=42, help="随机种子（默认 42）")
    parser.add_argument("--buffer", type=float, default=0.0, help="demand 净化额外缓冲米（默认 0）")
    args = parser.parse_args()

    t0 = time.time()
    logger.info(f"═══ 批量生成 [{args.city}] 目标 {args.n} 条轨迹 ═══")

    city_pois = load_city_pois(args.city, buffer_m=args.buffer)
    print(report_blocked(city_pois))

    clean = city_pois.demand_clean
    if len(clean) < 2:
        logger.error("净化后可用 demand POI 不足 2 个，无法生成轨迹")
        sys.exit(1)

    rng = random.Random(args.seed)
    
    # 构建任务数据
    from trajectory_lab.core.geo_utils import haversine_m
    tasks = []
    attempts = 0
    max_attempts = args.n * 20
    
    while len(tasks) < args.n and attempts < max_attempts:
        attempts += 1
        a, b = rng.sample(clean, 2)
        dist = haversine_m(a.lat, a.lon, b.lat, b.lon)
        if dist < args.min_dist or dist > args.max_dist:
            continue

        fid = f"{args.city}_{len(tasks):04d}"
        tasks.append((a.lat, a.lon, b.lat, b.lon, args.city, fid, a.poi_id, b.poi_id, city_pois.nfz_index))

    # 使用多进程池执行
    num_cores = max(1, mp.cpu_count() - 1)
    logger.info(f"分配任务至 {num_cores} 个子进程并发计算...")
    
    with mp.Pool(num_cores) as pool:
        results = pool.map(worker_plan, tasks)

    total_violations = sum(r.nfz_violations for r in results if r)
    logger.info(f"生成完成: {len(results)}/{args.n} 条")
    logger.info(f"违规段总数: {total_violations}")

    OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_BASE / f"{args.city}_uav_trajectories.json"
    data = build_output(results, args.city)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    elapsed = time.time() - t0
    logger.info(f"✅ 输出: {out_path}  ({size_kb:.1f} KB, 耗时 {elapsed:.1f}s)")

if __name__ == "__main__":
    # Windows 需要这个保护
    mp.freeze_support()
    main()
