"""
api/auth.py — 认证蓝图

处理用户登录、个人信息查询等认证相关 API。
"""
import datetime
import logging

import jwt
from flask import Blueprint, request, jsonify, current_app

from trajectory_lab.models.user import User
from trajectory_lab.middleware.auth import role_required, log_audit

logger = logging.getLogger("TrajServer")

auth_bp = Blueprint('auth', __name__, url_prefix='/api')


@auth_bp.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"code": 40001, "data": None, "message": "参数缺失"}), 400

    user = User.query.filter_by(username=data['username']).first()
    if not user or not user.check_password(data['password']):
        return jsonify({"code": 40100, "data": None, "message": "账号或密码错误"}), 401

    if not user.is_active:
        return jsonify({"code": 40300, "data": None, "message": "账号已禁用"}), 403

    exp_days = current_app.config.get('JWT_EXPIRATION_DAYS', 1)
    payload = {
        'sub': user.id,
        'username': user.username,
        'role': user.role,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=exp_days)
    }
    token = jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')

    # 手动触发登录审计日志
    request.user = payload
    log_audit("LOGIN", resource="users", details={"username": user.username})

    return jsonify({
        "code": 0,
        "data": {
            "token": token,
            "user": {
                "id": user.id,
                "username": user.username,
                "role": user.role
            }
        },
        "message": "登录成功"
    })


@auth_bp.route('/users/me', methods=['GET'])
@role_required('ADMIN', 'DISPATCHER', 'VIEWER')
def get_me():
    user = User.query.get(request.user['sub'])
    if not user:
        return jsonify({"code": 40400, "data": None, "message": "用户不存在"}), 404
    return jsonify({
        "code": 0,
        "data": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "created_at": user.created_at.isoformat()
        },
        "message": "success"
    })
