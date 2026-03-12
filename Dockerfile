# 多阶段构建 Dockerfile for Zeabur 部署
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

COPY zeabur-start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 8080

ENV PYTHONUNBUFFERED=1
ENV PORT=8080

CMD ["./start.sh"]
