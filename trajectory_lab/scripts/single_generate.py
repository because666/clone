"""
single_generate.py — 指定两点生成单条飞行轨迹

用法:
    python trajectory_lab/scripts/single_generate.py --city shenzhen --from <poi_id> --to <poi_id>
"""
import sys
import json
import logging
import argparse
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from trajectory_lab.core.poi_loader import load_city_pois
from trajectory_lab.core.planner import plan
from trajectory_lab.scripts.batch_generate import build_output

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("SingleGenerate")

OUTPUT_BASE = ROOT / "frontend" / "public" / "data" / "processed" / "trajectories"


def find_poi_by_id(city_pois, poi_id: str):
    """在全量 demand（含被阻断的）中按 ID 查找 POI"""
    for poi in city_pois.demand_all:
        if poi.poi_id == poi_id:
            return poi
    return None


def main():
    parser = argparse.ArgumentParser(description="指定两点生成单条飞行轨迹")
    parser.add_argument("--city", default="shenzhen", help="目标城市（默认 shenzhen）")
    parser.add_argument("--from", dest="from_poi", default="", help="起点 poi_id")
    parser.add_argument("--to", dest="to_poi", default="", help="终点 poi_id")
    parser.add_argument("--from-latlon", default="", help="起点经纬度 lat,lon（可替代 poi_id）")
    parser.add_argument("--to-latlon", default="", help="终点经纬度 lat,lon（可替代 poi_id）")
    parser.add_argument("--buffer", type=float, default=0.0, help="起降点净化额外缓冲米（默认 0）")
    parser.add_argument("--append", action="store_true", help="追加到现有 JSON 而非覆盖")
    parser.add_argument("--flight-id", default="", help="自定义 flight_id（默认自动生成）")
    args = parser.parse_args()

    t0 = time.time()
    logger.info(f"═══ 单条生成 [{args.city}] ═══")

    # ── 加载 POI ──────────────────────────────────────────────────────
    city_pois = load_city_pois(args.city, buffer_m=args.buffer)
    nfz = city_pois.nfz_index

    # ── 解析起点 ──────────────────────────────────────────────────────
    a_lat = a_lon = None
    from_id = ""
    if args.from_poi:
        poi_a = find_poi_by_id(city_pois, args.from_poi)
        if poi_a is None:
            logger.error(f"找不到 poi_id={args.from_poi}")
            sys.exit(1)
        a_lat, a_lon = poi_a.lat, poi_a.lon
        from_id = poi_a.poi_id
        # 检查是否在禁飞区内
        if nfz.point_in_any(a_lat, a_lon, args.buffer):
            logger.error(f"起点 {args.from_poi} 在禁飞区内，拒绝生成！")
            sys.exit(1)
    elif args.from_latlon:
        parts = args.from_latlon.split(",")
        a_lat, a_lon = float(parts[0]), float(parts[1])
        from_id = f"latlon_{a_lat:.5f}_{a_lon:.5f}"
        if nfz.point_in_any(a_lat, a_lon, args.buffer):
            logger.error(f"起点 ({a_lat}, {a_lon}) 在禁飞区内，拒绝生成！")
            sys.exit(1)
    else:
        logger.error("请指定 --from 或 --from-latlon")
        sys.exit(1)

    # ── 解析终点 ──────────────────────────────────────────────────────
    b_lat = b_lon = None
    to_id = ""
    if args.to_poi:
        poi_b = find_poi_by_id(city_pois, args.to_poi)
        if poi_b is None:
            logger.error(f"找不到 poi_id={args.to_poi}")
            sys.exit(1)
        b_lat, b_lon = poi_b.lat, poi_b.lon
        to_id = poi_b.poi_id
        if nfz.point_in_any(b_lat, b_lon, args.buffer):
            logger.error(f"终点 {args.to_poi} 在禁飞区内，拒绝生成！")
            sys.exit(1)
    elif args.to_latlon:
        parts = args.to_latlon.split(",")
        b_lat, b_lon = float(parts[0]), float(parts[1])
        to_id = f"latlon_{b_lat:.5f}_{b_lon:.5f}"
        if nfz.point_in_any(b_lat, b_lon, args.buffer):
            logger.error(f"终点 ({b_lat}, {b_lon}) 在禁飞区内，拒绝生成！")
            sys.exit(1)
    else:
        logger.error("请指定 --to 或 --to-latlon")
        sys.exit(1)

    # ── 规划轨迹 ──────────────────────────────────────────────────────
    fid = args.flight_id or f"single_{int(time.time())}"
    result = plan(
        a_lat, a_lon, b_lat, b_lon,
        nfz_index=nfz,
        city=args.city,
        flight_id=fid,
        from_poi_id=from_id,
        to_poi_id=to_id,
    )

    logger.info(f"轨迹生成完成:  {fid}")
    logger.info(f"  起点: ({a_lat:.5f}, {a_lon:.5f})  终点: ({b_lat:.5f}, {b_lon:.5f})")
    logger.info(f"  距离: {result.dist_m:.0f} m   时长: {result.duration_s:.0f} s   路径点: {len(result.path)}")
    logger.info(f"  禁飞区违规段: {result.nfz_violations}（直线版预期非零，后续算法修正）")

    # ── 输出 JSON ─────────────────────────────────────────────────────
    OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_BASE / f"{args.city}_uav_trajectories.json"

    if args.append and out_path.exists():
        # 追加模式：读旧文件，添加新轨迹
        with open(out_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
        existing["trajectories"].append({
            "id": result.flight_id,
            "path": result.path,
            "timestamps": result.timestamps,
        })
        existing["totalFlights"] = len(existing["trajectories"])
        existing["sampledFlights"] = len(existing["trajectories"])
        # 重新计算 timeRange
        all_max = max(
            t["timestamps"][-1] for t in existing["trajectories"]
            if t.get("timestamps")
        )
        existing["timeRange"]["max"] = round(all_max, 3)
        data = existing
    else:
        data = build_output([result], args.city)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    elapsed = time.time() - t0
    logger.info(f"✅ 输出: {out_path}  (耗时 {elapsed:.2f}s)")
    logger.info("前端刷新后可在地图上查看轨迹。")


if __name__ == "__main__":
    main()
