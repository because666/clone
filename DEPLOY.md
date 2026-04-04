# AetherWeave Docker 部署指南

## 目录
- [快速开始](#快速开始)
- [阿里云服务器部署](#阿里云服务器部署)
- [Docker 部署详解](#docker-部署详解)
- [常见问题](#常见问题)
- [维护与更新](#维护与更新)

---

## 快速开始

### 1. 环境要求

| 组件 | 版本要求 | 说明 |
|------|----------|------|
| Docker | 20.10+ | 容器运行时 |
| Docker Compose | 2.0+ | 编排工具 |
| 服务器配置 | 2核2G+ | 最低配置要求 |
| 磁盘空间 | 10GB+ | 包含数据和日志 |

### 2. 一键部署

```bash
# 1. 克隆代码
git clone https://github.com/TengJiao33/AetherWeave.git
cd AetherWeave

# 2. 启动服务
docker-compose up -d

# 3. 查看状态
docker-compose ps
```

访问 `http://服务器IP:8080` 即可使用。

**默认账号**：`admin` / `admin123`

---

## 阿里云服务器部署

### 步骤 1: 购买和配置服务器

1. 登录 [阿里云控制台](https://ecs.console.aliyun.com/)
2. 创建 ECS 实例，推荐配置：
   - **实例规格**：2核(vCPU) 2GiB（经济型e或突发性能t6）
   - **操作系统**：Ubuntu 22.04 LTS / CentOS 8
   - **公网带宽**：5Mbps+
   - **磁盘**：40GB SSD

### 步骤 2: 连接服务器

```bash
# 使用 SSH 连接（替换为你的服务器IP）
ssh root@你的服务器IP
```

### 步骤 3: 安装 Docker

**Ubuntu/Debian:**
```bash
# 更新软件包
apt-get update

# 安装 Docker
apt-get install -y docker.io docker-compose

# 启动 Docker
systemctl start docker
systemctl enable docker

# 验证安装
docker --version
docker-compose --version
```

**CentOS/RHEL:**
```bash
# 安装 Docker
yum install -y docker docker-compose

# 启动 Docker
systemctl start docker
systemctl enable docker
```

### 步骤 4: 部署 AetherWeave

```bash
# 创建工作目录
mkdir -p /opt/aetherweave
cd /opt/aetherweave

# 克隆代码
git clone https://github.com/TengJiao33/AetherWeave.git .

# 创建日志目录
mkdir -p logs

# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f
```

### 步骤 5: 配置安全组

1. 进入阿里云控制台 → ECS → 安全组
2. 添加以下入方向规则：

| 协议类型 | 端口范围 | 授权对象 | 说明 |
|----------|----------|----------|------|
| TCP | 8080 | 0.0.0.0/0 | 应用访问端口 |
| TCP | 22 | 你的IP | SSH（建议限制IP） |

### 步骤 6: 访问应用

浏览器访问：`http://你的服务器公网IP:8080`

---

## Docker 部署详解

### 项目结构

```
AetherWeave/
├── Dockerfile              # Docker 构建配置
├── docker-compose.yml      # 服务编排配置
├── frontend/               # 前端代码
├── backend/                # 后端代码
├── data/                   # 数据文件（GeoJSON等）
└── logs/                   # 日志目录
```

### Dockerfile 说明

采用**多阶段构建**优化镜像体积：

1. **阶段1 - 前端构建**：使用 Node.js 构建 React 应用
2. **阶段2 - 后端运行**：使用 Python 运行 Flask 服务

```dockerfile
# 关键配置说明：
FROM node:20-alpine AS frontend-builder  # 前端构建环境
FROM python:3.11-slim                    # 后端运行环境
EXPOSE 8080                              # 暴露端口
CMD ["gunicorn", ...]                    # 生产服务器
```

### docker-compose.yml 说明

```yaml
services:
  aetherweave:
    ports:
      - "8080:8080"          # 端口映射（主机:容器）
    volumes:
      - ./data:/app/data     # 数据持久化
      - ./logs:/app/logs     # 日志持久化
    deploy:
      resources:
        limits:
          cpus: '1.5'         # CPU限制
          memory: 1500M       # 内存限制
    restart: unless-stopped   # 自动重启策略
```

### 常用命令

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 进入容器
docker exec -it aetherweave bash

# 查看资源使用
docker stats aetherweave
```

---

## 常见问题

### Q1: 端口被占用

```bash
# 查看端口占用
netstat -tlnp | grep 8080

# 修改端口（编辑 docker-compose.yml）
ports:
  - "8081:8080"  # 改为8081
```

### Q2: 内存不足

```bash
# 查看内存使用
docker stats

# 增加交换空间
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

### Q3: 容器无法启动

```bash
# 查看详细日志
docker-compose logs --tail=100

# 检查健康状态
docker inspect --format='{{.State.Health.Status}}' aetherweave
```

### Q4: 数据丢失

数据默认挂载在 `./data` 目录，确保：
1. 不要删除 `data/` 目录
2. 定期备份：`tar -czvf backup.tar.gz data/`

---

## 维护与更新

### 更新代码

```bash
cd /opt/aetherweave

# 拉取最新代码
git pull origin master

# 重新构建并启动
docker-compose down
docker-compose up -d --build

# 清理旧镜像
docker image prune -f
```

### 备份数据

```bash
#!/bin/bash
# backup.sh - 备份脚本

BACKUP_DIR="/backup/aetherweave/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# 备份数据
cp -r /opt/aetherweave/data $BACKUP_DIR/

# 备份数据库
docker exec aetherweave sqlite3 /app/aetherweave.db ".backup /app/backup.db"
docker cp aetherweave:/app/backup.db $BACKUP_DIR/

# 压缩
tar -czvf $BACKUP_DIR.tar.gz $BACKUP_DIR
rm -rf $BACKUP_DIR

echo "备份完成: $BACKUP_DIR.tar.gz"
```

### 监控告警

```bash
# 查看服务状态
docker-compose ps

# 设置定时检查（crontab -e）
*/5 * * * * curl -f http://localhost:8080/api/health || docker-compose restart
```

---

## 生产环境建议

1. **使用 Nginx 反向代理**：
   - 配置 HTTPS
   - 负载均衡
   - 静态文件缓存

2. **配置域名**：
   - 购买域名并解析到服务器IP
   - 申请 SSL 证书

3. **安全加固**：
   - 修改默认密码
   - 限制 SSH 登录IP
   - 定期更新系统补丁

4. **监控告警**：
   - 使用阿里云监控
   - 配置钉钉/微信告警

---

## 技术支持

- **GitHub Issues**: https://github.com/TengJiao33/AetherWeave/issues
- **文档更新**: 请关注项目 README

---

*最后更新: 2025年*
