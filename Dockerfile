# 多阶段构建 Dockerfile for 生产部署
# 同时包含前端构建和后端服务

# ==================== 阶段 1: 构建前端 ====================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ==================== 阶段 2: 最终运行镜像 ====================
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY trajectory_lab/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY trajectory_lab/ ./trajectory_lab/
COPY scripts/ ./scripts/
COPY data/ ./data/

COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 8080

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PORT=8080

# 直接使用 python 启动，不再依赖缺失的 shell 脚本
CMD ["python", "-m", "trajectory_lab.scripts.server", "--host", "0.0.0.0", "--port", "8080"]

# 健康检查，配合 /api/health 端点
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1
