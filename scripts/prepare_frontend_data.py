"""
prepare_frontend_data.py — 前端数据预处理脚本
将 82MB 的 uav_trajectories.csv 预处理为紧凑的 JSON 文件，
大幅减少前端加载时间。

输入: data/processed/uav_trajectories.csv  (82MB, 766K行, 5093条轨迹)
输出: frontend/public/data/uav_trajectories.json (~5-8MB, 确定性采样20%)

优化策略:
  1. 服务端完成 CSV 解析和分组（不再由浏览器做）
  2. 只保留前端需要的字段: path + timestamps
  3. 坐标精度裁剪: lon/lat→6位, alt→整数, timestamp→3位
  4. 时间戳归一化: 相对于全局最小值（避免浮点精度丢失）
"""

import csv
import json
import hashlib
import logging
import argparse
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("FrontendDataPrep")

# 采样比例
SAMPLE_RATIO = 1.0  # 100% data usage
# 高度放大倍数（与前端 MapContainer.tsx 一致）
ALT_SCALE = 3


def deterministic_sample(flight_id: str, ratio: float) -> bool:
    """基于 flight_id 的确定性采样，保证每次运行结果一致"""
    h = hashlib.md5(f"sample_{flight_id}".encode()).hexdigest()
    return (int(h[:8], 16) / 0xFFFFFFFF) < ratio


def main(city: str):
    base = Path(__file__).resolve().parent.parent
    input_csv = base / "data" / "processed" / "trajectories" / f"{city}_uav_trajectories.csv"
    output_json = base / "frontend" / "public" / "data" / "processed" / "trajectories" / f"{city}_uav_trajectories.json"

    if not input_csv.exists():
        logger.error(f"❌ 输入文件不存在: {input_csv}")
        return

    # 第一遍：读取并按 flight_id 分组
    logger.info(f"读取 CSV: {input_csv}")
    groups: dict[str, dict] = {}
    group_counts = {}
    sampled = []
    
    global_min_ts = float('inf')
    global_max_ts = float('-inf')
    row_count = 0
    current_fid = None

    with open(input_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            fid = row.get('flight_id', '')
            ts_str = row.get('timestamp', '')
            if not fid or not ts_str:
                continue

            # Check if fid changed
            if current_fid is not None and fid != current_fid:
                # Flush current_fid data
                if current_fid in groups:
                    data = groups[current_fid]
                    if deterministic_sample(current_fid, SAMPLE_RATIO):
                        # Add to sampled, normalize timestamps later since global_min_ts isn't fully known here
                        sampled.append({
                            'id': current_fid,
                            'path': data['path'],
                            'timestamps': data['timestamps'] # RAW
                        })
                    del groups[current_fid]
                    del group_counts[current_fid]
                    
            current_fid = fid
            
            ts = float(ts_str)
            lon = float(row['lon'])
            lat = float(row['lat'])
            alt = float(row.get('alt_rel', '50'))

            if fid not in groups:
                groups[fid] = {'path': [], 'timestamps': []}
                group_counts[fid] = 0

            # 降采样：每 5 个点取 1 个 (从 1Hz 降至 0.2Hz)，即每 5 秒一个点，大幅减小 JSON 体积
            if group_counts[fid] % 5 == 0:
                groups[fid]['path'].append([
                    round(lon, 6),
                    round(lat, 6),
                    int(alt * ALT_SCALE)  # 高度放大并取整，节省字节
                ])
                groups[fid]['timestamps'].append(ts)
            
            group_counts[fid] += 1

            if ts < global_min_ts:
                global_min_ts = ts
            if ts > global_max_ts:
                global_max_ts = ts

            row_count += 1
            if row_count % 500000 == 0:
                logger.info(f"  已读取 {row_count} 行...")
                
        # Flush the final group
        if current_fid is not None and current_fid in groups:
            data = groups[current_fid]
            if deterministic_sample(current_fid, SAMPLE_RATIO):
                sampled.append({
                    'id': current_fid,
                    'path': data['path'],
                    'timestamps': data['timestamps']
                })

    logger.info(f"CSV 读取并流式采样完成: {row_count} 行")
    logger.info(f"时间范围: {global_min_ts} ~ {global_max_ts} ({global_max_ts - global_min_ts:.0f}秒)")

    # Normalize timestamps globally now that we know the absolute minimum
    for flight in sampled:
        flight['timestamps'] = [round(t - global_min_ts, 3) for t in flight['timestamps']]

    logger.info(f"确定性采样 {SAMPLE_RATIO*100:.0f}%: {len(sampled)} / {len(groups)} 条轨迹")

    # 输出 JSON
    output_data = {
        'timeRange': {
            'min': 0,
            'max': round(global_max_ts - global_min_ts, 3)
        },
        'totalFlights': len(groups),
        'sampledFlights': len(sampled),
        'trajectories': sampled
    }

    output_json.parent.mkdir(parents=True, exist_ok=True)
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, separators=(',', ':'))  # 紧凑格式

    size_mb = output_json.stat().st_size / (1024 * 1024)
    logger.info(f"✅ 输出完成: {output_json}")
    logger.info(f"   文件大小: {size_mb:.2f} MB (原始 CSV: {input_csv.stat().st_size / (1024*1024):.2f} MB)")
    logger.info(f"   压缩比: {size_mb / (input_csv.stat().st_size / (1024*1024)) * 100:.1f}%")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="前端数据预处理")
    parser.add_argument("--city", type=str, default="shenzhen", help="目标城市")
    args = parser.parse_args()

    logger.info(f"=========== 开始前端数据预处理 ({args.city}) ===========")
    main(args.city)
    logger.info("=========== 预处理完成 ===========")
