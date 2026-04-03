"""
api/tasks.py — 航线任务调度蓝图

处理任务创建、列表查询、状态更新与 SSE 实时推送。
"""
import json
import time
import logging

from flask import Blueprint, request, jsonify, Response, current_app

from backend.models.user import db, User, Task
from backend.core.planner import plan
from backend.middleware.auth import role_required, log_audit

logger = logging.getLogger("TrajServer")

tasks_bp = Blueprint('tasks', __name__, url_prefix='/api')

# 城市 POI 缓存引用（由 server.py 注入）
_get_city_pois = None


def init_tasks_bp(get_city_pois_fn):
    """初始化蓝图依赖"""
    global _get_city_pois
    _get_city_pois = get_city_pois_fn


@tasks_bp.route("/tasks", methods=["POST"])
@role_required('ADMIN', 'DISPATCHER', 'VIEWER')
def create_task():
    body = request.get_json(force=True, silent=True) or {}
    city = body.get("city", "shenzhen")
    # 统一参数命名：from_lat/from_lon
    start_lat = float(body.get("from_lat", 0))
    start_lon = float(body.get("from_lon", 0))
    start_poi_id = body.get("from_id", "")
    end_lat = float(body.get("to_lat", 0))
    end_lon = float(body.get("to_lon", 0))
    end_poi_id = body.get("to_id", "")

    if start_lat == 0 and start_lon == 0:
        return jsonify({"code": 40001, "data": None, "message": "缺少起点坐标"}), 400
    if end_lat == 0 and end_lon == 0:
        return jsonify({"code": 40001, "data": None, "message": "缺少终点坐标"}), 400

    try:
        city_pois = _get_city_pois(city, 0)
    except FileNotFoundError as e:
        return jsonify({"code": 40400, "data": None, "message": str(e)}), 404

    nfz = city_pois.nfz_index
    if nfz.point_in_any(start_lat, start_lon, 0):
        return jsonify({"code": 40001, "data": None, "message": f"起点 ({start_lat},{start_lon}) 在禁飞区内"}), 400
    if nfz.point_in_any(end_lat, end_lon, 0):
        return jsonify({"code": 40001, "data": None, "message": f"终点 ({end_lat},{end_lon}) 在禁飞区内"}), 400

    fid = f"task_{int(time.time())}"
    result = plan(
        start_lat, start_lon, end_lat, end_lon,
        nfz_index=nfz, city=city, flight_id=fid,
        from_poi_id=start_poi_id, to_poi_id=end_poi_id,
    )

    traj_dict = {
        "id": result.flight_id,
        "path": result.path,
        "timestamps": result.timestamps,
        "explored_nodes": result.explored_nodes,
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

    return jsonify({
        "code": 0,
        "data": {"task_id": new_task.id, "status": new_task.status},
        "message": "航线任务已创建，待审批"
    })


@tasks_bp.route("/tasks", methods=["GET"])
@role_required('ADMIN', 'DISPATCHER', 'VIEWER')
def list_tasks():
    status_filter = request.args.get('status')
    query = Task.query
    if status_filter:
        query = query.filter_by(status=status_filter)

    tasks = query.order_by(Task.created_at.desc()).all()

    user_ids = {t.creator_id for t in tasks if t.creator_id}
    users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}

    task_strs = []
    for t in tasks:
        creator = users.get(t.creator_id)
        creator_name = creator.username if creator else 'Unknown'
        base_dict = {
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
            "creator_username": creator_name,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat()
        }
        # 直接切割组装字符串，跳过 json.loads() 对 CPU 的锁死
        base_json = json.dumps(base_dict)
        traj_str = t.trajectory_data if t.trajectory_data else "null"
        final_task_json = base_json[:-1] + f', "trajectory_data": {traj_str}}}'
        task_strs.append(final_task_json)

    final_json_str = f'{{"code": 0, "data": {{"tasks": [{",".join(task_strs)}]}}, "message": "success"}}'
    return Response(final_json_str, mimetype='application/json')


@tasks_bp.route("/tasks/stream", methods=["GET"])
@role_required('ADMIN', 'DISPATCHER', 'VIEWER')
def tasks_stream():
    """Server-Sent Events 实时任务变更推送"""
    # 获取真实的 app 对象，避免在生成器运行时丢失请求上下文
    app = current_app._get_current_object()
    
    def generate():
        last_updated = None
        while True:
            try:
                with app.app_context():
                    latest_task = Task.query.order_by(Task.updated_at.desc()).first()
                    current_time = latest_task.updated_at.isoformat() if latest_task else "none"

                if last_updated is None:
                    last_updated = current_time
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


@tasks_bp.route("/tasks/<task_id>/status", methods=["PUT"])
@role_required('ADMIN', 'DISPATCHER')
def update_task_status(task_id):
    body = request.get_json(force=True, silent=True) or {}
    new_status = body.get("status")
    # 简化的状态流转：PENDING → EXECUTING（批准即执行）, EXECUTING → COMPLETED（系统自动）, PENDING → REJECTED
    if new_status not in ['EXECUTING', 'COMPLETED', 'REJECTED']:
        return jsonify({"code": 40001, "data": None, "message": "无效的状态值，允许: EXECUTING, COMPLETED, REJECTED"}), 400

    task = Task.query.get(task_id)
    if not task:
        return jsonify({"code": 40400, "data": None, "message": "任务不存在"}), 404

    # 状态流转合法性校验
    valid_transitions = {
        'PENDING': ['EXECUTING', 'REJECTED'],
        'EXECUTING': ['COMPLETED'],
    }
    allowed = valid_transitions.get(task.status, [])
    if new_status not in allowed:
        return jsonify({"code": 40001, "data": None, "message": f"不允许从 {task.status} 转到 {new_status}"}), 400

    task.status = new_status
    db.session.commit()

    log_audit("UPDATE_TASK_STATUS", resource="tasks", details={"task_id": task.id, "new_status": new_status})

    return jsonify({"code": 0, "data": {"task_id": task.id, "status": task.status}, "message": "success"})
