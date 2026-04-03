# AetherWeave 部署指南

## 服务器配置建议

### 最低配置
- **CPU**: 1核
- **内存**: 1GB
- **存储**: 10GB
- **网络**: 1Mbps

### 推荐配置 (当前优化目标)
- **CPU**: 2核
- **内存**: 2GB
- **存储**: 20GB
- **网络**: 3Mbps+

## 部署方式

### 方式一: Docker Compose (推荐)

```bash
# 1. 克隆代码
git clone <your-repo-url>
cd AetherWeave

# 2. 启动服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 停止服务
docker-compose down
```

### 方式二: 手动部署

```bash
# 1. 安装依赖
pip install -r trajectory_lab/requirements.txt

# 2. 构建前端
cd frontend
npm install
npm run build
cd ..

# 3. 启动服务
chmod +x start-server.sh
./start-server.sh
```

## 2核2G 服务器优化说明

### Gunicorn 配置优化
- **Workers**: 2 (匹配 CPU 核心数)
- **Threads**: 4 (提高并发处理能力)
- **Worker Class**: gthread (适合 I/O 密集型应用)
- **内存控制**: 限制容器内存使用不超过 1.5GB

### 性能预期
- **并发请求**: 支持 50-100 并发用户
- **响应时间**: API 响应 < 500ms
- **轨迹生成**: 单次生成 1000 条轨迹约 10-30 秒

### 监控建议
```bash
# 查看容器资源使用
docker stats aetherweave

# 查看服务状态
curl http://localhost:8080/api/status
```

## 常见问题

### 1. 内存不足
如果服务被 OOM Kill，可以:
- 减少 Gunicorn workers 数量 (改为 1)
- 增加服务器内存到 4GB

### 2. 启动失败
检查日志:
```bash
docker-compose logs aetherweave
```

### 3. 数据库权限
SQLite 数据库文件需要写入权限:
```bash
chmod 777 /app/aetherweave.db
```

## 访问服务

部署完成后，访问:
- **前端页面**: http://your-server-ip:8080
- **API 状态**: http://your-server-ip:8080/api/status
