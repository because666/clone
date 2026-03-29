"""
server.py — 飞行轨迹算法 Flask API 服务

启动:
  python trajectory_lab/scripts/server.py
"""
import sys
import os
import json
import random
import logging
import time
import uuid
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

try:
    from flask import Flask, request, jsonify, send_from_directory, Response
    from flask_cors import CORS
    from flask_compress import Compress
    import jwt
    import datetime
    from functools import wraps
except ImportError:
    print("缺少依赖，请运行: pip install flask flask-cors flask-compress pyjwt")
    sys.exit(1)

from trajectory_lab.models.user import db, User, AuditLog, Task, FlightLog

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
# 【安全加固 SEC-1】密钥优先从环境变量读取，避免硬编码泄露
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'AetherWeave-SuperSecretKey-2026')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///aetherweave.db' # 默认开发环境使用 SQLite
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app)  # 允许前端跨域访问
Compress(app)  # 启用 GZIP 压缩

db.init_app(app)

# 初始化数据库结构及默认管理员
with app.app_context():
    db.create_all()
    if not User.query.filter_by(username='admin').first():
        admin_user = User(username='admin', role='ADMIN')
        admin_user.set_password('admin123')
        db.session.add(admin_user)
        db.session.commit()


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


# ── 权限控制 (JWT) ───────────
def role_required(*allowed_roles):
    def decorator(f):
        @wraps(f)
        def verify_token(*args, **kwargs):
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            if not token:
                token = request.args.get('token', '') # 支持 EventSource 等无法设置Header的场景
            if not token:
                return jsonify({"error": "缺少鉴权 Token"}), 401
            try:
                payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
                if payload['role'] not in allowed_roles:
                    return jsonify({"error": "无权访问此接"}), 403
                request.user = payload
            except jwt.ExpiredSignatureError:
                return jsonify({"error": "Token 已过期"}), 401
            except jwt.InvalidTokenError:
                return jsonify({"error": "无效的 Token"}), 401
            return f(*args, **kwargs)
        return verify_token
    return decorator


def log_audit(action, resource=None, details=None):
    """记录操作日志"""
    try:
        user_id = getattr(request, 'user', {}).get('sub')
        ip = request.remote_addr
        log_entry = AuditLog(
            user_id=user_id,
            action=action,
            resource=resource,
            details=json.dumps(details) if details else None,
            ip_address=ip
        )
        db.session.add(log_entry)
        db.session.commit()
    except Exception as e:
        logger.error(f"审计日志记录失败: {e}")


# ═══════════════════════════════════════════════════════════════════════
# Auth 模块
# ═══════════════════════════════════════════════════════════════════════
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"error": "参数缺失"}), 400

    user = User.query.filter_by(username=data['username']).first()
    if not user or not user.check_password(data['password']):
        return jsonify({"error": "账号或密码错误"}), 401
    
    if not user.is_active:
        return jsonify({"error": "账号已禁用"}), 403

    # 生成 token
    payload = {
        'sub': user.id,
        'username': user.username,
        'role': user.role,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=1)
    }
    token = jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')
    
    # 手动触发登录日志（此处 request 中尚无 user 属性）
    request.user = payload
    log_audit("LOGIN", resource="users", details={"username": user.username})

    return jsonify({
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role
        }
    })

@app.route('/api/users/me', methods=['GET'])
@role_required('ADMIN', 'DISPATCHER', 'VIEWER')
def get_me():
    user = User.query.get(request.user['sub'])
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "created_at": user.created_at.isoformat()
    })

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

    # 写文件（保留静态 JSON 兜底）
    OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_BASE / f"{city}_uav_trajectories.json"
    data = build_output(results, city)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    # 双写策略：同步写入数据库持久化
    batch_id = str(uuid.uuid4())
    # 先清空该城市旧数据，保证幂等
    FlightLog.query.filter_by(city=city).delete()
    cycle_dur = data.get("cycleDuration", 0)
    algo_name = data.get("_meta", {}).get("algo", "unknown")
    for traj_item in data["trajectories"]:
        if traj_item["id"].endswith("_ghost"):
            continue  # ghost 镜像不入库，查询时动态计算
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
        "batch_id": batch_id,
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
    save     = bool(body.get("save", False))
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

    # 写文件 (如果设置了 save 标志)
    if save:
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
# Task Management (航线任务调度管理)
# ═══════════════════════════════════════════════════════════════════════

@app.route("/api/tasks", methods=["POST"])
@role_required('ADMIN', 'DISPATCHER', 'VIEWER')
def create_task():
    body = request.get_json(force=True, silent=True) or {}
    city = body.get("city", "shenzhen")
    start_lat = float(body.get("from_lat", 0))
    start_lon = float(body.get("from_lon", 0))
    start_poi_id = body.get("from_id", "")
    end_lat = float(body.get("to_lat", 0))
    end_lon = float(body.get("to_lon", 0))
    end_poi_id = body.get("to_id", "")

    if start_lat == 0 and start_lon == 0:
        return jsonify({"error": "Missing start coordinates"}), 400
    if end_lat == 0 and end_lon == 0:
        return jsonify({"error": "Missing end coordinates"}), 400

    try:
        city_pois = get_city_pois(city, 0)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404

    nfz = city_pois.nfz_index
    if nfz.point_in_any(start_lat, start_lon, 0):
        return jsonify({"error": f"起点 ({start_lat},{start_lon}) 在禁飞区内"}), 400
    if nfz.point_in_any(end_lat, end_lon, 0):
        return jsonify({"error": f"终点 ({end_lat},{end_lon}) 在禁飞区内"}), 400

    fid = f"task_{int(time.time())}"
    # 调用核心算法生成轨迹
    result = plan(
        start_lat, start_lon, end_lat, end_lon,
        nfz_index=nfz, city=city, flight_id=fid,
        from_poi_id=start_poi_id, to_poi_id=end_poi_id,
    )

    traj_dict = {
        "id": result.flight_id,
        "path": result.path,
        "timestamps": result.timestamps,
    }

    user_id = request.user['sub']

    new_task = Task(
        city=city,
        flight_id=fid,
        start_lat=start_lat,
        start_lon=start_lon,
        end_lat=end_lat,
        end_lon=end_lon,
        start_poi_id=start_poi_id,
        end_poi_id=end_poi_id,
        status='PENDING',
        trajectory_data=json.dumps(traj_dict),
        creator_id=user_id
    )

    db.session.add(new_task)
    db.session.commit()
    
    log_audit("CREATE_TASK", resource="tasks", details={"task_id": new_task.id, "flight_id": fid})

    return jsonify({"ok": True, "task_id": new_task.id, "status": new_task.status, "message": "Mission created and pending approval"})

@app.route("/api/tasks", methods=["GET"])
@role_required('ADMIN', 'DISPATCHER', 'VIEWER')
def list_tasks():
    status_filter = request.args.get('status')
    query = Task.query
    if status_filter:
        query = query.filter_by(status=status_filter)
    
    tasks = query.order_by(Task.created_at.desc()).all()
    
    result = []
    # 批量获取用户信息
    user_ids = {t.creator_id for t in tasks if t.creator_id}
    users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}

    for t in tasks:
        creator = users.get(t.creator_id)
        result.append({
            "id": t.id,
            "city": t.city,
            "flight_id": t.flight_id,
            "start_lat": t.start_lat,
            "start_lon": t.start_lon,
            "end_lat": t.end_lat,
            "end_lon": t.end_lon,
            "start_poi_id": t.start_poi_id,
            "end_poi_id": t.end_poi_id,
            "status": t.status,
            "trajectory_data": json.loads(t.trajectory_data) if t.trajectory_data else None,
            "creator_username": creator.username if creator else 'Unknown',
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat()
        })

    return jsonify({"ok": True, "tasks": result})


@app.route("/api/tasks/stream", methods=["GET"])
@role_required('ADMIN', 'DISPATCHER', 'VIEWER')
def tasks_stream():
    """Server-Sent Events 实时任务变更推送"""
    def generate():
        last_updated = None
        while True:
            try:
                # 注意：SQLite + SQLAlchemy 在多线程长连接下可能发生 Session 隔离，
                # 每秒重建连接不优雅，但为了保证 SSE 单测展示的绝对实时性，我们通过独立的 DB Session 直接查最近一次的更新时间
                with app.app_context():
                    latest_task = Task.query.order_by(Task.updated_at.desc()).first()
                    current_time = latest_task.updated_at.isoformat() if latest_task else "none"

                if last_updated is None:
                    last_updated = current_time # 刚连上不触发刷新
                elif current_time != last_updated:
                    last_updated = current_time
                    yield f"data: update\n\n"
            
            except Exception as e:
                logger.error(f"SSE流出错了: {e}")
                
            time.sleep(1.0)
            
    return Response(generate(), mimetype="text/event-stream", headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    })


@app.route("/api/tasks/<task_id>/status", methods=["PUT"])
@role_required('ADMIN', 'DISPATCHER')
def update_task_status(task_id):
    body = request.get_json(force=True, silent=True) or {}
    new_status = body.get("status")
    if not new_status in ['PENDING', 'APPROVED', 'EXECUTING', 'COMPLETED', 'REJECTED']:
        return jsonify({"error": "Invalid status"}), 400

    task = Task.query.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    task.status = new_status
    db.session.commit()

    log_audit("UPDATE_TASK_STATUS", resource="tasks", details={"task_id": task.id, "new_status": new_status})

    return jsonify({"ok": True, "task_id": task.id, "status": task.status})


# ═══════════════════════════════════════════════════════════════════════
# Trajectory Data (飞行轨迹持久化查询)
# ═══════════════════════════════════════════════════════════════════════

@app.route("/api/trajectories", methods=["GET"])
def get_trajectories():
    """从数据库获取城市的持久化飞行轨迹，返回前端期望的标准格式"""
    city = request.args.get("city", "shenzhen")

    logs = FlightLog.query.filter_by(city=city).order_by(FlightLog.created_at).all()

    if not logs:
        # 数据库无数据时，回退读取静态 JSON 文件作为兜底
        json_path = OUTPUT_BASE / f"{city}_uav_trajectories.json"
        if json_path.exists():
            with open(json_path, "r", encoding="utf-8") as f:
                return jsonify(json.load(f))
        return jsonify({"error": f"No trajectory data found for {city}"}), 404

    # 【性能优化 P0-6】合并为单次遍历，避免对每条记录做两次 json.loads()
    trajectories = []
    total_dur = 0.0
    valid_count = 0

    for log in logs:
        timestamps = json.loads(log.timestamps_data)
        path = json.loads(log.path_data)

        # 计算 cycleDuration（原来在第一次循环中做的）
        if len(timestamps) >= 2:
            total_dur += timestamps[-1] - timestamps[0]
            valid_count += 1

        traj = {
            "id": log.flight_id,
            "path": path,
            "timestamps": timestamps,
            "start_offset": log.start_offset or 0.0,
        }
        trajectories.append(traj)

    avg_dur = total_dur / valid_count if valid_count > 0 else 0.0
    cycle_duration = max((valid_count * avg_dur) / 500, avg_dur * 1.5) if valid_count > 0 else 3600.0

    # 动态补充 ghost 镜像实现无缝循环（不从数据库读，实时计算）
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


@app.route("/api/trajectories", methods=["DELETE"])
@role_required('ADMIN')
def delete_trajectories():
    """清空指定城市的所有持久化轨迹数据"""
    city = request.args.get("city")
    if not city:
        return jsonify({"error": "Missing city parameter"}), 400
    deleted = FlightLog.query.filter_by(city=city).delete()
    db.session.commit()
    log_audit("DELETE_TRAJECTORIES", resource="flight_logs", details={"city": city, "deleted": deleted})
    return jsonify({"ok": True, "deleted": deleted})


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
    app.run(host=args.host, port=args.port, debug=True)
