"""
test_algo.py — 自动化评估并量化轨迹生成算法各项指标

用法:
    python backend/tests/test_algo.py --city shenzhen --n 100

指标包含：
  - 禁飞区侵入率 (Violation Rate)
  - 平均绕行率 (Detour Ratio = 实际长度 / 直线距离)
  - 单条平均耗时 (ms)
"""
import sys
import time
import random
import logging
import argparse
from pathlib import Path

# 将项目根目录加入 path
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.core.poi_loader import load_city_pois
from backend.core.planner import plan
from backend.core.geo_utils import haversine_m

logging.basicConfig(level=logging.INFO, format="%(message)s")

def main():
    parser = argparse.ArgumentParser(description="自动评估轨迹生成算法指标")
    parser.add_argument("--city", default="shenzhen", help="目标城市")
    parser.add_argument("--n", type=int, default=100, help="测试轨迹数")
    parser.add_argument("--seed", type=int, default=42, help="随机种子")
    args = parser.parse_args()

    print(f"=======================================")
    print(f" 🚀 算法评估测试启动 | {args.city} | {args.n}条")
    print(f"=======================================")

    t0 = time.time()
    city_pois = load_city_pois(args.city, buffer_m=0.0)
    clean = city_pois.demand_clean
    if len(clean) < 2:
        print(" 可用 POI 不足，无法测试。")
        return

    rng = random.Random(args.seed)
    
    total_time = 0.0
    violations_count = 0
    detour_ratios = []

    success_generated = 0
    attempts = 0
    max_attempts = args.n * 10

    while success_generated < args.n and attempts < max_attempts:
        attempts += 1
        a, b = rng.sample(clean, 2)
        dist_straight = haversine_m(a.lat, a.lon, b.lat, b.lon)
        if dist_straight < 400 or dist_straight > 8000:
            continue

        start_t = time.time()
        result = plan(
            a.lat, a.lon, b.lat, b.lon,
            nfz_index=city_pois.nfz_index,
            city=args.city,
            flight_id=f"test_{success_generated}"
        )
        end_t = time.time()

        total_time += (end_t - start_t)
        
        if getattr(result, "nfz_violations", 0) > 0:
            violations_count += 1
            
        # 实际飞行距离
        actual_dist = 0.0
        path = result.path
        for i in range(len(path) - 1):
            lon1, lat1, _ = path[i]
            lon2, lat2, _ = path[i+1]
            actual_dist += haversine_m(lat1, lon1, lat2, lon2)

        detour_ratios.append(actual_dist / dist_straight)
        success_generated += 1

    print("\n----------------- 测试报告 -----------------")
    print(f" 有效完成条数: {success_generated}/{args.n}")
    
    if success_generated == 0:
        return

    avg_time_ms = (total_time / success_generated) * 1000
    violation_rate = (violations_count / success_generated) * 100
    avg_detour = sum(detour_ratios) / success_generated

    print(f" [性能] 平均单次耗时: {avg_time_ms:.2f} ms")
    
    # 指标阈值标红/标绿 (利用简单 terminal 颜色)
    if violation_rate > 0:
        print(f" [合规] 禁飞区侵入率: \033[91m{violation_rate:.2f}%\033[0m (违规 {violations_count} 条)")
    else:
        print(f" [合规] 禁飞区侵入率: \033[92m{violation_rate:.2f}%\033[0m")
        
    print(f" [效率] 平均绕行率:   {avg_detour:.3f} (实际距离 / 直线距离)")
    print(f" 当前算法版本: {result.algo}")
    print("=======================================\n")

if __name__ == "__main__":
    main()
