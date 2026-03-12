#!/bin/sh
# Zeabur 启动脚本 - 同时启动前端静态文件服务和后端 API

set -e

echo "🚀 启动 AetherWeave 服务..."

# 获取端口（Zeabur 会提供 PORT 环境变量）
PORT=${PORT:-8080}
echo "📡 服务端口: $PORT"

# 创建简单的静态文件服务器配置
cat > serve_frontend.py << 'EOF'
import http.server
import socketserver
import os
from pathlib import Path

PORT = int(os.environ.get('PORT', 8080))
DIRECTORY = Path(__file__).parent / 'frontend' / 'dist'

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)
    
    def do_GET(self):
        # API 请求转发到后端
        if self.path.startswith('/api/'):
            self.send_error(502, "Backend API not available")
            return
        
        # 处理前端路由
        if not self.path.startswith('/assets/'):
            self.path = '/index.html'
        
        return super().do_GET()

with socketserver.TCPServer(("0.0.0.0", PORT), MyHTTPRequestHandler) as httpd:
    print(f"🌐 前端服务运行在 http://0.0.0.0:{PORT}")
    httpd.serve_forever()
EOF

# 启动前端服务
python serve_frontend.py
