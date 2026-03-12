#!/bin/sh
# Zeabur 启动脚本 - 同时启动前端静态文件服务和后端 API

set -e

echo "🚀 启动 AetherWeave 服务..."

PORT=${PORT:-8080}
echo "📡 服务端口: $PORT"

cd /app

cat > serve_all.py << 'PYEOF'
import http.server
import socketserver
import os
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

PORT = int(os.environ.get('PORT', 8080))
DIRECTORY = Path(__file__).parent / 'frontend' / 'dist'

sys.path.insert(0, str(Path(__file__).parent))

try:
    from trajectory_lab.server import app as flask_app
except ImportError as e:
    print(f"⚠️  无法导入 Flask 应用: {e}")
    flask_app = None

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)
    
    def do_GET(self):
        if self.path.startswith('/api/'):
            if flask_app:
                self.proxy_to_flask('GET')
            else:
                self.send_error(502, "Backend API not available")
            return
        
        if not (self.path.startswith('/assets/') or 
                self.path.startswith('/data/') or 
                self.path.endswith(('.js', '.css', '.ico', '.png', '.jpg', '.svg', '.glb'))):
            self.path = '/index.html'
        
        return super().do_GET()
    
    def do_POST(self):
        if self.path.startswith('/api/'):
            if flask_app:
                self.proxy_to_flask('POST')
            else:
                self.send_error(502, "Backend API not available")
            return
        self.send_error(404, "Not Found")
    
    def proxy_to_flask(self, method):
        if not flask_app:
            self.send_error(502, "Backend API not available")
            return
        
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else b''
            
            with flask_app.test_client() as client:
                response = client.open(
                    self.path,
                    method=method,
                    data=body,
                    headers={k: v for k, v in self.headers.items()}
                )
            
            self.send_response(response.status_code)
            for key, value in response.headers:
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(response.data)
        except Exception as e:
            print(f"❌ 代理请求失败: {e}")
            self.send_error(500, str(e))

with socketserver.TCPServer(("0.0.0.0", PORT), ProxyHTTPRequestHandler) as httpd:
    print(f"✅ 前端服务运行在 http://0.0.0.0:{PORT}")
    print(f"✅ 后端 API 可通过 /api/* 访问")
    httpd.serve_forever()
PYEOF

echo "🌐 启动服务..."
python serve_all.py
