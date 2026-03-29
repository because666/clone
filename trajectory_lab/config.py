"""
config.py — 集中化配置管理

所有环境/密钥/路径配置统一从此文件读取，避免硬编码散落在代码各处。
"""
import os
from pathlib import Path

# 项目根目录
ROOT = Path(__file__).resolve().parent.parent

# 前端构建产物目录（生产环境静态文件服务）
FRONTEND_DIST = ROOT / "frontend" / "dist"

# 数据存储目录
DATA_DIR = ROOT / "data"

# 轨迹 JSON 输出目录
OUTPUT_BASE = ROOT / "frontend" / "public" / "data" / "processed" / "trajectories"


class Config:
    """Flask 应用配置"""
    # 【安全加固 SEC-1】密钥优先从环境变量读取，避免硬编码泄露
    SECRET_KEY = os.environ.get('SECRET_KEY', 'AetherWeave-SuperSecretKey-2026')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///aetherweave.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT 过期时间（天）
    JWT_EXPIRATION_DAYS = int(os.environ.get('JWT_EXPIRATION_DAYS', '1'))
