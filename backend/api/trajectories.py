"""
api/trajectories.py — 轨迹管理蓝图

处理轨迹的批量生成、单条生成、查询和删除。
"""
import json
import orjson
import time
import uuid
import random
import logging

from flask import Blueprint, request, jsonify

from backend.config import OUTPUT_BASE
from backend.models.user import db, FlightLog
from backend.core.planner import plan
from backend.core.geo_utils import haversine_m
from backend.scripts.batch_generate import build_output
from backend.middleware.auth import role_required, log_audit
from backend.api.analytics import _load_city_trajectories, _load_city_energy

logger = logging.getLogger("TrajServer")

trajectories_bp = Blueprint('trajectories', __name__, url_prefix='/api')

# 城市 POI 缓存引用（由 server.py 注入）
_get_city_pois = None


def init_trajectories_bp(get_city_pois_fn):
    """初始化蓝图依赖（注入 POI 加载函数）"""
    global _get_city_pois
    _get_city_pois = get_city_pois_fn


@trajectories_bp.route("/batch", methods=["POST"])
def batch_generate():
    body = request.get_json(force=True, silent=True) or {}
    city     = body.get("city", "shenzhen")
    n        = int(body.get("n", 1000))
    min_dist = float(body.get("min_dist", 400))
    max_dist = float(body.get("max_dist", 8000))
    seed     = int(body.get("seed", 42))
    buffer_m = float(body.get("buffer", 0))

    t0 = time.time()
    logger.info(f"[batch] city={city} n={n} seed={seed}")

    try:
        city_pois = _get_city_pois(city, buffer_m)
    except FileNotFoundError as e:
        return jsonify({"code": 40400, "data": None, "message": str(e)}), 404

    clean = city_pois.demand_clean
    if len(clean) < 2:
        return jsonify({"code": 40001, "data": None, "message": "净化后 demand POI 不足 2 个"}), 400

    rng = random.Random(seed)
    results = []
    attempts = 0
    max_attempts = n * 20

    while len(results) < n and attempts < max_attempts:
        attempts += 1
        a, b = rng.sample(clean, 2)
        dist = haversine_m(a.lat, a.lon, b.lat, b.lon)
        if dist < min_dist or dist > max_dist:
            continue
        fid = f"{city}_{len(results):04d}"
        result = plan(
            a.lat, a.lon, b.lat, b.lon,
            nfz_index=city_pois.nfz_index,
            city=city,
            flight_id=fid,
            from_poi_id=a.poi_id,
            to_poi_id=b.poi_id,
        )
        results.append(result)

    # 写文件（保留静态 JSON 兜底）
    OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_BASE / f"{city}_uav_trajectories.json"
    data = build_output(results, city)
    out_path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")

    # 双写策略：同步写入数据库持久化
    batch_id = str(uuid.uuid4())
    FlightLog.query.filter_by(city=city).delete()
    cycle_dur = data.get("cycleDuration", 0)
    algo_name = data.get("_meta", {}).get("algo", "unknown")
    for traj_item in data["trajectories"]:
        if traj_item["id"].endswith("_ghost"):
            continue
        flight_log = FlightLog(
            city=city,
            flight_id=traj_item["id"],
            path_data=json.dumps(traj_item["path"]),
            timestamps_data=json.dumps(traj_item["timestamps"]),
            start_offset=traj_item.get("start_offset", 0.0),
            algo=algo_name,
            batch_id=batch_id,
        )
        db.session.add(flight_log)
    db.session.commit()
    logger.info(f"[batch] 已写入数据库, batch_id={batch_id}")

    # 【性能优化 P1-8】数据更新后清除 analytics 的 lru_cache，确保分析页获取最新数据
    _load_city_trajectories.cache_clear()
    _load_city_energy.cache_clear()

    elapsed = time.time() - t0
    total_violations = sum(r.nfz_violations for r in results)
    logger.info(f"[batch] 完成: {len(results)} 条, 违规段: {total_violations}, 耗时: {elapsed:.2f}s")

    return jsonify({
        "code": 0,
        "data": {
            "city": city,
            "generated": len(results),
            "total_violations": total_violations,
            "elapsed_s": round(elapsed, 2),
            "batch_id": batch_id,
        },
        "message": "批量生成完成"
    })


@trajectories_bp.route("/single", methods=["POST"])
def single_generate():
    body = request.get_json(force=True, silent=True) or {}
    city     = body.get("city", "shenzhen")
    from_lat = float(body.get("from_lat", 0))
    from_lon = float(body.get("from_lon", 0))
    from_id  = body.get("from_id", "")
    to_lat   = float(body.get("to_lat", 0))
    to_lon   = float(body.get("to_lon", 0))
    to_id    = body.get("to_id", "")
    append   = bool(body.get("append", False))
    save     = bool(body.get("save", False))
    buffer_m = float(body.get("buffer", 0))

    if from_lat == 0 and from_lon == 0:
        return jsonify({"code": 40001, "data": None, "message": "缺少起点坐标 from_lat/from_lon"}), 400
    if to_lat == 0 and to_lon == 0:
        return jsonify({"code": 40001, "data": None, "message": "缺少终点坐标 to_lat/to_lon"}), 400

    t0 = time.time()
    logger.info(f"[single] city={city} A=({from_lat:.4f},{from_lon:.4f}) B=({to_lat:.4f},{to_lon:.4f})")

    try:
        city_pois = _get_city_pois(city, buffer_m)
    except FileNotFoundError as e:
        return jsonify({"code": 40400, "data": None, "message": str(e)}), 404

    nfz = city_pois.nfz_index

    if nfz.point_in_any(from_lat, from_lon, buffer_m):
        return jsonify({"code": 40001, "data": None, "message": f"起点 ({from_lat},{from_lon}) 在禁飞区内"}), 400
    if nfz.point_in_any(to_lat, to_lon, buffer_m):
        return jsonify({"code": 40001, "data": None, "message": f"终点 ({to_lat},{to_lon}) 在禁飞区内"}), 400

    fid = f"single_{int(time.time())}"
    result = plan(
        from_lat, from_lon, to_lat, to_lon,
        nfz_index=nfz,
        city=city,
        flight_id=fid,
        from_poi_id=from_id,
        to_poi_id=to_id,
    )

    if save:
        OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
        out_path = OUTPUT_BASE / f"{city}_uav_trajectories.json"

        if append and out_path.exists():
            existing = json.loads(out_path.read_text(encoding="utf-8"))
            existing["trajectories"].append({
                "id": result.flight_id,
                "path": result.path,
                "timestamps": result.timestamps,
            })
            existing["totalFlights"] = len(existing["trajectories"])
            existing["sampledFlights"] = len(existing["trajectories"])
            if existing["trajectories"]:
                all_max = max(
                    t["timestamps"][-1] for t in existing["trajectories"]
                    if t.get("timestamps")
                )
                existing["timeRange"]["max"] = round(all_max, 3)
            data = existing
        else:
            data = build_output([result], city)

        out_path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")

    elapsed = time.time() - t0
    logger.info(f"[single] 完成: {fid}, 违规段: {result.nfz_violations}, 耗时: {elapsed:.3f}s")

    return jsonify({
        "code": 0,
        "data": {
            "flight_id": result.flight_id,
            "dist_m": round(result.dist_m, 1),
            "duration_s": round(result.duration_s, 1),
            "path_points": len(result.path),
            "nfz_violations": result.nfz_violations,
            "elapsed_s": round(elapsed, 3),
            "trajectory": {
                "id": result.flight_id,
                "path": result.path,
                "timestamps": result.timestamps,
                "explored_nodes": result.explored_nodes,
                "nodes_expanded": result.nodes_expanded,
            }
        },
        "message": "单条生成完成"
    })


@trajectories_bp.route("/trajectories", methods=["GET"])
def get_trajectories():
    """从数据库获取城市的持久化飞行轨迹"""
    city = request.args.get("city", "shenzhen")

    logs = FlightLog.query.filter_by(city=city).order_by(FlightLog.created_at).all()

    if not logs:
        json_path = OUTPUT_BASE / f"{city}_uav_trajectories.json"
        if json_path.exists():
            return jsonify(json.loads(json_path.read_text(encoding="utf-8")))
        return jsonify({"code": 40400, "data": None, "message": f"未找到城市 {city} 的轨迹数据"}), 404

    trajectories = []
    total_dur = 0.0
    valid_count = 0

    # 【性能优化 P0-3】使用 orjson 替代标准 json，解析速度提升 5-10x
    parsed_logs = [
        (log.flight_id, orjson.loads(log.path_data), orjson.loads(log.timestamps_data), log.start_offset or 0.0)
        for log in logs if log.path_data and log.timestamps_data
    ]

    for fid, path, timestamps, offset in parsed_logs:
        if len(timestamps) >= 2:
            total_dur += timestamps[-1] - timestamps[0]
            valid_count += 1

        traj = {
            "id": fid,
            "path": path,
            "timestamps": timestamps,
            "start_offset": offset,
        }
        trajectories.append(traj)

    avg_dur = total_dur / valid_count if valid_count > 0 else 0.0
    cycle_duration = max((valid_count * avg_dur) / 500, avg_dur * 1.5) if valid_count > 0 else 3600.0

    # Ghost 镜像（无缝循环）
    ghost_trajs = []
    for traj in trajectories:
        timestamps = traj["timestamps"]
        if timestamps and timestamps[-1] > cycle_duration:
            ghost_ts = [round(t - cycle_duration, 3) for t in timestamps]
            ghost_trajs.append({
                "id": f"{traj['id']}_ghost",
                "path": traj["path"],
                "timestamps": ghost_ts,
                "start_offset": round((traj["start_offset"]) - cycle_duration, 3),
            })
    trajectories.extend(ghost_trajs)

    all_max_ts = max(
        (t["timestamps"][-1] for t in trajectories if t["timestamps"]),
        default=0
    )

    return jsonify({
        "timeRange": {"min": 0, "max": round(max(all_max_ts, cycle_duration), 3)},
        "cycleDuration": round(cycle_duration, 3),
        "totalFlights": len(trajectories),
        "sampledFlights": len(trajectories),
        "trajectories": trajectories,
    })


@trajectories_bp.route("/trajectories", methods=["DELETE"])
@role_required('ADMIN')
def delete_trajectories():
    """清空指定城市的所有持久化轨迹数据"""
    city = request.args.get("city")
    if not city:
        return jsonify({"code": 40001, "data": None, "message": "缺少 city 参数"}), 400
    deleted = FlightLog.query.filter_by(city=city).delete()
    db.session.commit()
    log_audit("DELETE_TRAJECTORIES", resource="flight_logs", details={"city": city, "deleted": deleted})
    return jsonify({"code": 0, "data": {"deleted": deleted}, "message": "轨迹数据已清除"})
