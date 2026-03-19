#!/bin/sh
# Zeabur 启动脚本 - 同时启动前端静态文件服务和后端 API

set -e

echo "🚀 启动 AetherWeave 服务..."

PORT=${PORT:-8080}
echo "📡 服务端口: $PORT"

cd /app

cd /app

echo "🌐 启动生产级 Gunicorn 服务 (包含静态文件及 GZIP 压缩)..."

# 使用 gunicorn 启动服务
# --workers: 建议设为 (2 x num_cores) + 1，Zeabur 环境下通常 2-4 即可
# --threads: 提高并发处理能力
# --timeout: 轨迹生成可能耗时较长，增加超时时间
# --bind: 监听指定端口
exec gunicorn \
    --workers 2 \
    --threads 4 \
    --timeout 120 \
    --bind 0.0.0.0:$PORT \
    --access-logfile - \
    --error-logfile - \
    trajectory_lab.scripts.server:app
