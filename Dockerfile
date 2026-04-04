# ============================================================
# AetherWeave Docker 生产部署配置
# 支持多阶段构建，优化镜像体积
# ============================================================

# ==================== 阶段 1: 构建前端 ====================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# 先复制 package.json 利用 Docker 缓存层
COPY frontend/package*.json ./
RUN npm ci

# 复制前端源码并构建
COPY frontend/ ./
RUN npm run build

# ==================== 阶段 2: 最终运行镜像 ====================
FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/ ./backend/
COPY scripts/ ./scripts/
COPY data/ ./data/

# 从前端构建阶段复制构建产物
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 暴露端口
EXPOSE 8080

# 环境变量
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PORT=8080
ENV FLASK_ENV=production

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# 启动命令 - 使用 Gunicorn 生产服务器
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "backend.scripts.server:create_app()"]
