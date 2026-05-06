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
COPY start-server.sh ./start-server.sh
RUN chmod +x ./start-server.sh

# 从前端构建阶段复制构建产物
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 暴露端口
EXPOSE 8080

# 环境变量
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PORT=8080
ENV FLASK_ENV=production
ARG APP_VERSION=1.0.0
ARG VCS_REF=unknown
ARG VCS_BRANCH=unknown
ARG BUILD_DATE=unknown
ENV APP_VERSION=${APP_VERSION}
ENV GIT_COMMIT=${VCS_REF}
ENV GIT_BRANCH=${VCS_BRANCH}
ENV BUILD_TIME=${BUILD_DATE}
ENV RELEASE_CHANNEL=production
LABEL org.opencontainers.image.title="AetherWeave"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.revision="${VCS_REF}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"

# 生产环境使用 gunicorn gthread，并发参数由运行环境控制
CMD ["./start-server.sh"]

# 健康检查，配合 /api/health 端点
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1
