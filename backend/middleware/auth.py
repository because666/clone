"""
middleware/auth.py — JWT 鉴权与审计日志中间件

从 server.py 中提取的通用安全基础设施，供所有 Blueprint 共享。
"""
import json
import logging
from functools import wraps

import jwt
from flask import request, jsonify, current_app

from backend.models.user import db, AuditLog

logger = logging.getLogger("TrajServer")


def role_required(*allowed_roles):
    """JWT 角色验证装饰器，支持多角色白名单"""
    def decorator(f):
        @wraps(f)
        def verify_token(*args, **kwargs):
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            if not token:
                token = request.args.get('token', '')  # 支持 EventSource 等无法设置 Header 的场景
            if not token:
                return jsonify({"code": 40100, "data": None, "message": "缺少鉴权 Token"}), 401
            try:
                payload = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
                if payload['role'] not in allowed_roles:
                    return jsonify({"code": 40300, "data": None, "message": "无权访问此接口"}), 403
                request.user = payload
            except jwt.ExpiredSignatureError:
                return jsonify({"code": 40101, "data": None, "message": "Token 已过期"}), 401
            except jwt.InvalidTokenError:
                return jsonify({"code": 40102, "data": None, "message": "无效的 Token"}), 401
            return f(*args, **kwargs)
        return verify_token
    return decorator


def log_audit(action, resource=None, details=None):
    """记录操作审计日志"""
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
