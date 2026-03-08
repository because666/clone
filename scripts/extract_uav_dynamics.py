"""
extract_uav_dynamics.py — 从合成UAV数据集提取飞行动力学特征

数据来源: riotu-lab/Synthetic-UAV-Flight-Trajectories (data/raw/trajectories/uav_trajectories_raw.csv)
用途: 提取无人机真实飞行动力学参数，用于校准物流轨迹生成算法

输出: data/processed/uav_dynamics_profile.json
"""

import csv
import json
import math
import logging
import random
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("DynamicsExtractor")

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_CSV = BASE_DIR / "data" / "raw" / "trajectories" / "uav_trajectories_raw.csv"
OUTPUT_JSON = BASE_DIR / "data" / "processed" / "uav_dynamics_profile.json"

# 切分阈值: 时间间隔 > 此值视为新飞行段
TRAJ_GAP_S = 1.0
# 最少点数（过短的段丢弃）
MIN_POINTS = 20
# 有方向性过滤: 位移效率 = 总位移 / 路径总长 >= 此值才纳入动力学分析
MIN_DISPLACEMENT_RATIO = 0.25
# 微扰动采样：从有效段中最多采样多少条用于扰动模板
MAX_PERTURBATION_SAMPLES = 200
# 每条扰动模板的采样点数（归一化后）
PERTURBATION_TEMPLATE_POINTS = 100


def load_raw_trajectories():
    """读取原始CSV，切分为独立飞行段"""
    logger.info(f"读取原始数据: {RAW_CSV}")
    
    all_rows = []
    with open(RAW_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                all_rows.append((
                    float(row['timestamp']),
                    float(row['tx']),
                    float(row['ty']),
                    float(row['tz']),
                ))
            except (ValueError, KeyError):
                continue
    
    logger.info(f"  原始行数: {len(all_rows)}")
    
    # 按时间间隔切分
    segments = []
    current = [all_rows[0]]
    for i in range(1, len(all_rows)):
        dt = all_rows[i][0] - all_rows[i - 1][0]
        if dt > TRAJ_GAP_S or dt < 0:
            if len(current) >= MIN_POINTS:
                segments.append(current)
            current = []
        current.append(all_rows[i])
    if len(current) >= MIN_POINTS:
        segments.append(current)
    
    logger.info(f"  切分为 {len(segments)} 个飞行段")
    return segments


def compute_segment_stats(seg):
    """计算单段的运动学统计量"""
    n = len(seg)
    
    # 速度（有限差分）
    speeds_h = []  # 水平速度
    speeds_v = []  # 垂直速度
    accels = []    # 水平加速度
    
    prev_vh = None
    for i in range(n - 1):
        t0, x0, y0, z0 = seg[i]
        t1, x1, y1, z1 = seg[i + 1]
        dt = t1 - t0
        if dt <= 0 or dt > TRAJ_GAP_S:
            prev_vh = None
            continue
        
        vx = (x1 - x0) / dt
        vy = (y1 - y0) / dt
        vz = (z1 - z0) / dt
        vh = math.sqrt(vx**2 + vy**2)
        
        speeds_h.append(vh)
        speeds_v.append(vz)
        
        if prev_vh is not None:
            accels.append((vh - prev_vh) / dt)
        prev_vh = vh
    
    if not speeds_h:
        return None
    
    # 位移效率：总位移 / 路径总长
    t0, x0, y0, z0 = seg[0]
    tn, xn, yn, zn = seg[-1]
    total_displacement = math.sqrt((xn - x0)**2 + (yn - y0)**2)
    
    path_length = 0.0
    for i in range(n - 1):
        dx = seg[i+1][1] - seg[i][1]
        dy = seg[i+1][2] - seg[i][2]
        path_length += math.sqrt(dx**2 + dy**2)
    
    displacement_ratio = total_displacement / max(path_length, 0.01)
    
    return {
        'speeds_h': speeds_h,
        'speeds_v': speeds_v,
        'accels': accels,
        'displacement_ratio': displacement_ratio,
        'duration': seg[-1][0] - seg[0][0],
        'path_length': path_length,
    }


def extract_perturbation_template(seg):
    """
    提取微扰动模板：
    将飞行段在"起终点连线"方向上投影，计算法向偏差序列（横向抖动），
    归一化到 PERTURBATION_TEMPLATE_POINTS 个点
    """
    n = len(seg)
    if n < 5:
        return None
    
    x0, y0 = seg[0][1], seg[0][2]
    xn, yn = seg[-1][1], seg[-1][2]
    dx = xn - x0
    dy = yn - y0
    length = math.sqrt(dx**2 + dy**2)
    
    if length < 1.0:
        return None
    
    # 单位切线向量和法线向量
    tx_unit = dx / length
    ty_unit = dy / length
    nx_unit = -ty_unit
    ny_unit = tx_unit
    
    # 计算每个点的法向偏差
    deviations = []
    for pt in seg:
        px = pt[1] - x0
        py = pt[2] - y0
        # 法向偏差
        dev = px * nx_unit + py * ny_unit
        deviations.append(dev)
    
    # 归一化到 PERTURBATION_TEMPLATE_POINTS 个点（线性插值）
    template = []
    for i in range(PERTURBATION_TEMPLATE_POINTS):
        t = i / (PERTURBATION_TEMPLATE_POINTS - 1)
        idx_f = t * (n - 1)
        idx_lo = int(idx_f)
        idx_hi = min(idx_lo + 1, n - 1)
        frac = idx_f - idx_lo
        val = deviations[idx_lo] * (1 - frac) + deviations[idx_hi] * frac
        template.append(round(val, 4))
    
    return template


def percentile(data, p):
    """简单百分位计算（不依赖numpy）"""
    sorted_data = sorted(data)
    idx = (len(sorted_data) - 1) * p / 100
    lo = int(idx)
    hi = min(lo + 1, len(sorted_data) - 1)
    return sorted_data[lo] + (sorted_data[hi] - sorted_data[lo]) * (idx - lo)


def main():
    logger.info("=" * 60)
    logger.info("UAV动力学特征提取")
    logger.info("=" * 60)
    
    if not RAW_CSV.exists():
        logger.error(f"原始数据不存在: {RAW_CSV}")
        return
    
    segments = load_raw_trajectories()
    
    # 计算各段统计量
    all_speeds_h = []
    all_speeds_v = []
    all_accels = []
    valid_segments = []
    
    for seg in segments:
        stats = compute_segment_stats(seg)
        if stats is None:
            continue
        
        # 过滤：保留有方向性的飞行段
        if stats['displacement_ratio'] < MIN_DISPLACEMENT_RATIO:
            continue
        
        all_speeds_h.extend(stats['speeds_h'])
        all_speeds_v.extend(stats['speeds_v'])
        all_accels.extend(stats['accels'])
        valid_segments.append(seg)
    
    logger.info(f"\n有方向性飞行段: {len(valid_segments)} / {len(segments)}")
    logger.info(f"有效速度样本数: {len(all_speeds_h)}")
    
    if not all_speeds_h:
        logger.error("无有效数据，请检查输入文件")
        return
    
    # 速度统计
    mean_speed_h = sum(all_speeds_h) / len(all_speeds_h)
    var_speed_h = sum((v - mean_speed_h)**2 for v in all_speeds_h) / len(all_speeds_h)
    std_speed_h = math.sqrt(var_speed_h)
    
    mean_speed_v = sum(all_speeds_v) / len(all_speeds_v)
    abs_speeds_v = [abs(v) for v in all_speeds_v]
    mean_abs_speed_v = sum(abs_speeds_v) / len(abs_speeds_v)
    
    # 加速度分布
    pos_accels = [a for a in all_accels if a > 0]  # 加速（起飞/爬升）
    neg_accels = [a for a in all_accels if a < 0]  # 减速（降落/制动）
    
    mean_takeoff_accel = sum(pos_accels) / len(pos_accels) if pos_accels else 1.2
    mean_landing_decel = sum(neg_accels) / len(neg_accels) if neg_accels else -0.9
    
    logger.info(f"\n动力学统计:")
    logger.info(f"  水平巡航速度: 均值={mean_speed_h:.2f} m/s, 标准差={std_speed_h:.2f} m/s")
    logger.info(f"  垂直速度绝对均值: {mean_abs_speed_v:.2f} m/s")
    logger.info(f"  平均加速度(起飞): {mean_takeoff_accel:.3f} m/s²")
    logger.info(f"  平均减速度(降落): {mean_landing_decel:.3f} m/s²")
    logger.info(f"  P10/P50/P90速度: {percentile(all_speeds_h,10):.2f}/{percentile(all_speeds_h,50):.2f}/{percentile(all_speeds_h,90):.2f} m/s")
    
    # 提取微扰动模板（从有效段中随机采样）
    random.seed(42)
    sample_segs = random.sample(valid_segments, min(MAX_PERTURBATION_SAMPLES, len(valid_segments)))
    perturbation_samples = []
    for seg in sample_segs:
        tmpl = extract_perturbation_template(seg)
        if tmpl is not None:
            perturbation_samples.append(tmpl)
    
    logger.info(f"\n微扰动模板: {len(perturbation_samples)} 条")
    
    # 组装输出
    profile = {
        "source": "riotu-lab/Synthetic-UAV-Flight-Trajectories",
        "description": "UAV飞行动力学特征库，用于物流轨迹生成的速度/加速度校准和微扰动叠加",
        "valid_segments_count": len(valid_segments),
        "cruise_speed_ms": {
            "mean": round(mean_speed_h, 3),
            "std": round(std_speed_h, 3),
            "p10": round(percentile(all_speeds_h, 10), 3),
            "p50": round(percentile(all_speeds_h, 50), 3),
            "p90": round(percentile(all_speeds_h, 90), 3),
            "max": round(max(all_speeds_h), 3),
        },
        "vertical_speed_ms": {
            "mean_abs": round(mean_abs_speed_v, 3),
            "climb_rate": round(max(0.5, mean_abs_speed_v * 0.8), 3),
            "descent_rate": round(max(0.3, mean_abs_speed_v * 0.6), 3),
        },
        "acceleration_ms2": {
            "takeoff_mean": round(mean_takeoff_accel, 3),
            "landing_mean": round(mean_landing_decel, 3),
        },
        "perturbation_templates": perturbation_samples,
        "perturbation_template_points": PERTURBATION_TEMPLATE_POINTS,
    }
    
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)
    
    size_kb = OUTPUT_JSON.stat().st_size / 1024
    logger.info(f"\n✅ 动力学特征已保存: {OUTPUT_JSON} ({size_kb:.1f} KB)")
    logger.info(f"   扰动模板数量: {len(perturbation_samples)}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
