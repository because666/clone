"""
api/mobile.py — C 端移动端轻量鉴权蓝图

为移动端 H5 用户提供：
- 快速免注册体验入口（生成 VIEWER 临时 Token）
- 仅查看自己创建的任务列表
"""
import datetime
import logging

import jwt
from flask import Blueprint, request, jsonify, current_app

from backend.models.user import db, User, Task
from backend.middleware.auth import role_required

logger = logging.getLogger("TrajServer")

mobile_bp = Blueprint('mobile', __name__, url_prefix='/api/mobile')


@mobile_bp.route('/quick-login', methods=['POST'])
def quick_login():
    """
    C 端快速登录（演示模式）

    无需注册，直接颁发 VIEWER 权限 Token。
    适用于答辩演示、评委扫码体验等场景。
    """
    body = request.get_json(force=True, silent=True) or {}
    nickname = body.get('nickname', '访客用户')

    # 查找或创建 C 端演示账号
    demo_username = f"mobile_{nickname}"
    user = User.query.filter_by(username=demo_username).first()

    if not user:
        user = User(username=demo_username, role='VIEWER')
        user.set_password('mobile_demo_2026')
        db.session.add(user)
        db.session.commit()
        logger.info(f"[Mobile] 新建 C 端演示用户: {demo_username}")

    exp_days = current_app.config.get('JWT_EXPIRATION_DAYS', 1)
    payload = {
        'sub': user.id,
        'username': user.username,
        'role': user.role,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=exp_days)
    }
    token = jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')

    return jsonify({
        "code": 0,
        "data": {
            "token": token,
            "user": {
                "id": user.id,
                "username": user.username,
                "role": user.role,
                "nickname": nickname,
            }
        },
        "message": "快速登录成功"
    })


@mobile_bp.route('/my-orders', methods=['GET'])
@role_required('ADMIN', 'DISPATCHER', 'VIEWER')
def my_orders():
    """仅返回当前用户创建的任务/订单"""
    user_id = request.user['sub']

    tasks = Task.query.filter_by(creator_id=user_id)\
        .order_by(Task.created_at.desc())\
        .limit(50)\
        .all()

    result = []
    for t in tasks:
        result.append({
            "id": t.id,
            "city": t.city,
            "flight_id": t.flight_id,
            "start_lat": t.start_lat,
            "start_lon": t.start_lon,
            "end_lat": t.end_lat,
            "end_lon": t.end_lon,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat(),
        })

    return jsonify({
        "code": 0,
        "data": {"orders": result},
        "message": "success"
    })
