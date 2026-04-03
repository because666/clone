#!/bin/bash
# AetherWeave 服务器启动脚本 - 针对 2核2G 服务器优化

set -e

echo "🚀 启动 AetherWeave 服务..."
echo "💻 服务器配置: 2核2G"

PORT=${PORT:-8080}
echo "📡 服务端口: $PORT"

# 根据 2核2G 配置优化 Gunicorn 参数
# workers = 2 (充分利用双核)
# threads = 4 (提高并发)
# worker-class = gthread (线程模式更适合 I/O 密集型)
# max-requests = 1000 (定期重启 worker 防止内存泄漏)
# max-requests-jitter = 50 (随机抖动避免同时重启)

echo "🌐 启动优化后的 Gunicorn 服务..."
echo "   Workers: 2"
echo "   Threads: 4"
echo "   Worker Class: gthread"

exec gunicorn \
    --workers 2 \
    --threads 4 \
    --worker-class gthread \
    --worker-connections 1000 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --timeout 120 \
    --keep-alive 5 \
    --bind 0.0.0.0:$PORT \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    trajectory_lab.scripts.server:app
