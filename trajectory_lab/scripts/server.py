"""
server.py — 飞行轨迹算法 Flask API 服务

启动:
  python trajectory_lab/scripts/server.py
"""
import sys
import json
import random
import logging
import time
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

try:
    from flask import Flask, request, jsonify, send_from_directory
    from flask_cors import CORS
    from flask_compress import Compress
except ImportError:
    print("缺少依赖，请运行: pip install flask flask-cors flask-compress")
    sys.exit(1)

from trajectory_lab.core.poi_loader import load_city_pois
from trajectory_lab.core.planner import plan
from trajectory_lab.core.geo_utils import haversine_m
from trajectory_lab.scripts.batch_generate import build_output

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("TrajServer")

app = Flask(__name__)
CORS(app)  # 允许前端跨域访问
Compress(app)  # 启用 GZIP 压缩

# 静态文件路径配置
FRONTEND_DIST = ROOT / "frontend" / "dist"
DATA_DIR = ROOT / "data"

OUTPUT_BASE = ROOT / "frontend" / "public" / "data" / "processed" / "trajectories"

# ── 城市 POI 缓存（按需加载，避免每次请求都重新读 GeoJSON）───────────
_POI_CACHE: dict = {}


def get_city_pois(city: str, buffer_m: float = 0.0):
    """从缓存获取城市 POI，不存在则加载"""
    key = f"{city}_{buffer_m}"
    if key not in _POI_CACHE:
        logger.info(f"加载城市 POI: {city} (buffer={buffer_m}m)")
        _POI_CACHE[key] = load_city_pois(city, buffer_m=buffer_m)
    return _POI_CACHE[key]


# ═══════════════════════════════════════════════════════════════════════
# GET /api/status
# ═══════════════════════════════════════════════════════════════════════
@app.route("/api/status")
def status():
    return jsonify({
        "ok": True,
        "time": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "cached_cities": list(_POI_CACHE.keys()),
    })


# ═══════════════════════════════════════════════════════════════════════
# GET /api/pois?city=shenzhen&max=500
# ═══════════════════════════════════════════════════════════════════════
@app.route("/api/pois")
def get_pois():
    city = request.args.get("city", "shenzhen")
    buffer_m = float(request.args.get("buffer", 0))
    max_n = int(request.args.get("max", 2000))
    try:
        city_pois = get_city_pois(city, buffer_m)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404

    clean = city_pois.demand_clean[:max_n]
    return jsonify({
        "city": city,
        "total_demand": len(city_pois.demand_all),
        "clean_demand": len(city_pois.demand_clean),
        "blocked_demand": len(city_pois.demand_blocked),
        "pois": [
            {
                "poi_id": p.poi_id,
                "name": p.name,
                "category": p.category,
                "lat": p.lat,
                "lon": p.lon,
            }
            for p in clean
        ],
    })


# ═══════════════════════════════════════════════════════════════════════
# POST /api/batch
# ═══════════════════════════════════════════════════════════════════════
@app.route("/api/batch", methods=["POST"])
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
        city_pois = get_city_pois(city, buffer_m)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404

    clean = city_pois.demand_clean
    if len(clean) < 2:
        return jsonify({"error": "净化后 demand POI 不足 2 个"}), 400

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

    # 写文件
    OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_BASE / f"{city}_uav_trajectories.json"
    data = build_output(results, city)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    elapsed = time.time() - t0
    total_violations = sum(r.nfz_violations for r in results)
    logger.info(f"[batch] 完成: {len(results)} 条, 违规段: {total_violations}, 耗时: {elapsed:.2f}s")

    return jsonify({
        "ok": True,
        "city": city,
        "generated": len(results),
        "total_violations": total_violations,
        "elapsed_s": round(elapsed, 2),
        "output": str(out_path),
    })


# ═══════════════════════════════════════════════════════════════════════
# POST /api/single
# ═══════════════════════════════════════════════════════════════════════
@app.route("/api/single", methods=["POST"])
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
    buffer_m = float(body.get("buffer", 0))

    if from_lat == 0 and from_lon == 0:
        return jsonify({"error": "缺少起点坐标 from_lat/from_lon"}), 400
    if to_lat == 0 and to_lon == 0:
        return jsonify({"error": "缺少终点坐标 to_lat/to_lon"}), 400

    t0 = time.time()
    logger.info(f"[single] city={city} A=({from_lat:.4f},{from_lon:.4f}) B=({to_lat:.4f},{to_lon:.4f})")

    try:
        city_pois = get_city_pois(city, buffer_m)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404

    nfz = city_pois.nfz_index

    # 校验起降点
    if nfz.point_in_any(from_lat, from_lon, buffer_m):
        return jsonify({"error": f"起点 ({from_lat},{from_lon}) 在禁飞区内"}), 400
    if nfz.point_in_any(to_lat, to_lon, buffer_m):
        return jsonify({"error": f"终点 ({to_lat},{to_lon}) 在禁飞区内"}), 400

    fid = f"single_{int(time.time())}"
    result = plan(
        from_lat, from_lon, to_lat, to_lon,
        nfz_index=nfz,
        city=city,
        flight_id=fid,
        from_poi_id=from_id,
        to_poi_id=to_id,
    )

    # 写文件
    OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_BASE / f"{city}_uav_trajectories.json"

    if append and out_path.exists():
        with open(out_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
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

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    elapsed = time.time() - t0
    logger.info(f"[single] 完成: {fid}, 违规段: {result.nfz_violations}, 耗时: {elapsed:.3f}s")

    return jsonify({
        "ok": True,
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
        }
    })


# ═══════════════════════════════════════════════════════════════════════
# 静态文件服务 (用于生产环境)
# ═══════════════════════════════════════════════════════════════════════

@app.route("/")
def serve_index():
    """服务前端主页"""
    return send_from_directory(str(FRONTEND_DIST), "index.html")


@app.route("/<path:path>")
def serve_static(path):
    """服务前端静态资源和数据文件"""
    # 1. 优先检查 frontend/dist (assets, favicon 等)
    if (FRONTEND_DIST / path).exists():
        return send_from_directory(str(FRONTEND_DIST), path)

    # 2. 检查 data 目录 (processed GeoJSON 等)
    if path.startswith("data/") and (ROOT / path).exists():
        return send_from_directory(str(ROOT), path)

    # 3. 如果都不匹配且不是 API 请求，返回 index.html (支持 SPA 路由)
    if not path.startswith("api/"):
        return send_from_directory(str(FRONTEND_DIST), "index.html")

    return jsonify({"error": "Not Found"}), 404


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5001)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    logger.info(f"轨迹算法服务启动于 http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=False)
