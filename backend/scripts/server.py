"""
server.py — AetherWeave 后端服务入口

【架构优化 P2】从 770 行上帝文件重构为精简的应用工厂 + Blueprint 注册器。
所有业务逻辑已按职责拆分至：
  - api/auth.py          认证（登录、用户信息）
  - api/trajectories.py  轨迹管理（批量/单条生成、查询、删除）
  - api/tasks.py         任务调度（CRUD、SSE 推送、状态流转）
  - api/analysis.py      分析（系统状态、POI 查询、ROI 沙盘）
  - middleware/auth.py   JWT 鉴权与审计日志
  - config.py            集中化配置管理

启动:
  python backend/scripts/server.py
"""
import sys
import time
import logging
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

try:
    from flask import Flask, send_from_directory, jsonify
    from flask_cors import CORS
except ImportError:
    print("缺少依赖，请运行: pip install flask flask-cors pyjwt")
    sys.exit(1)

from backend.config import Config, FRONTEND_DIST, DATA_DIR
from backend.models.user import db, User
from backend.core.poi_loader import load_city_pois
from backend.version import get_build_info

# 导入蓝图
from backend.api.auth import auth_bp
from backend.api.trajectories import trajectories_bp, init_trajectories_bp
from backend.api.tasks import tasks_bp, init_tasks_bp
from backend.api.analysis import analysis_bp, init_analysis_bp
from backend.api.analytics import analytics_bp as analytics_data_bp, init_analytics_bp
from backend.api.ai import ai_bp
from backend.api.mobile import mobile_bp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("TrajServer")


# ── 城市 POI 缓存（按需加载，避免每次请求都重新读 GeoJSON）──
_POI_CACHE: dict = {}


def get_city_pois(city: str, buffer_m: float = 0.0):
    """从缓存获取城市 POI，不存在则加载"""
    key = f"{city}_{buffer_m}"
    if key not in _POI_CACHE:
        logger.info(f"加载城市 POI: {city} (buffer={buffer_m}m)")
        _POI_CACHE[key] = load_city_pois(city, buffer_m=buffer_m)
    return _POI_CACHE[key]


def create_app() -> Flask:
    """Flask 应用工厂"""
    app = Flask(__name__)
    app.config.from_object(Config)

    # 扩展初始化
    CORS(app)
    db.init_app(app)

    # 初始化数据库结构及默认管理员
    with app.app_context():
        db.create_all()
        if not User.query.filter_by(username='admin').first():
            admin_user = User(username='admin', role='ADMIN')
            admin_user.set_password('admin123')
            db.session.add(admin_user)
            db.session.commit()

    # 注入蓝图依赖
    init_trajectories_bp(get_city_pois)
    init_tasks_bp(get_city_pois)
    init_analysis_bp(get_city_pois, _POI_CACHE)
    init_analytics_bp(str(DATA_DIR), _POI_CACHE)

    # 注册蓝图
    app.register_blueprint(auth_bp)
    app.register_blueprint(trajectories_bp)
    app.register_blueprint(tasks_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(analytics_data_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(mobile_bp)

    # 【工程化改进 S8】标准化健康检查端点
    _start_time = time.time()

    @app.route("/api/health")
    def health_check():
        """标准化健康检查，配合 Docker HEALTHCHECK 和监控系统"""
        build_info = get_build_info()
        try:
            # 数据库连通性探测
            db.session.execute(db.text("SELECT 1"))
            db_status = "connected"
        except Exception:
            db_status = "disconnected"

        return jsonify({
            "code": 0,
            "data": {
                "status": "healthy" if db_status == "connected" else "degraded",
                "version": build_info["app_version"],
                "build": build_info,
                "database": db_status,
                "cached_cities": list(_POI_CACHE.keys()),
                "uptime_seconds": round(time.time() - _start_time, 1),
            },
            "message": "ok"
        })

    # ── 静态文件服务 (生产环境) ──
    @app.route("/")
    def serve_index():
        return send_from_directory(str(FRONTEND_DIST), "index.html")

    @app.route("/<path:path>")
    def serve_static(path):
        if (FRONTEND_DIST / path).exists():
            return send_from_directory(str(FRONTEND_DIST), path)
        if path.startswith("data/") and (ROOT / path).exists():
            return send_from_directory(str(ROOT), path)
        if not path.startswith("api/"):
            return send_from_directory(str(FRONTEND_DIST), "index.html")
        return jsonify({"code": 40400, "data": None, "message": "Not Found"}), 404

    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5001)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    app = create_app()
    logger.info(f"轨迹算法服务启动于 http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=True)
