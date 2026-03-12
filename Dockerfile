# 多阶段构建 Dockerfile for Zeabur 部署
# 同时包含前端构建和后端服务

# ==================== 阶段 1: 构建前端 ====================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# 复制前端依赖文件
COPY frontend/package*.json ./
RUN npm ci

# 复制前端源代码并构建
COPY frontend/ ./
RUN npm run build

# ==================== 阶段 2: Python 后端 ====================
FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 复制 Python 依赖
COPY trajectory_lab/requirements.txt ./requirements.txt 2>/dev/null || echo "No requirements.txt found"

# 安装 Python 依赖
RUN pip install --no-cache-dir flask flask-cors numpy scipy scikit-learn

# 复制后端代码
COPY trajectory_lab/ ./trajectory_lab/
COPY scripts/ ./scripts/
COPY data/ ./data/

# 从前端构建阶段复制构建产物
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 复制启动脚本
COPY zeabur-start.sh ./start.sh
RUN chmod +x ./start.sh

# 暴露端口
EXPOSE 8080

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=trajectory_lab/server.py
ENV PORT=8080

# 启动命令
CMD ["./start.sh"]
