#!/bin/bash
# ============================================================
# AetherWeave 阿里云服务器一键部署脚本
# 使用方法: chmod +x deploy.sh && ./deploy.sh
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
APP_NAME="AetherWeave"
APP_DIR="/opt/aetherweave"
PORT=8080

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  $APP_NAME 一键部署脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}请使用 root 权限运行此脚本${NC}"
    exit 1
fi

# 步骤 1: 安装 Docker
echo -e "${YELLOW}[1/6] 检查并安装 Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo "正在安装 Docker..."
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        apt-get update
        apt-get install -y docker.io docker-compose
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        yum install -y docker docker-compose
    else
        echo -e "${RED}不支持的系统，请手动安装 Docker${NC}"
        exit 1
    fi
    
    systemctl start docker
    systemctl enable docker
    echo -e "${GREEN}Docker 安装完成${NC}"
else
    echo -e "${GREEN}Docker 已安装${NC}"
fi

# 步骤 2: 创建工作目录
echo -e "${YELLOW}[2/6] 创建工作目录...${NC}"
mkdir -p $APP_DIR
mkdir -p $APP_DIR/logs
cd $APP_DIR

# 步骤 3: 克隆代码
echo -e "${YELLOW}[3/6] 拉取代码...${NC}"
if [ -d ".git" ]; then
    echo "检测到已有代码，执行更新..."
    git pull origin master
else
    echo "首次克隆代码..."
    git clone https://github.com/TengJiao33/AetherWeave.git .
fi
echo -e "${GREEN}代码拉取完成${NC}"

# 步骤 4: 构建镜像
echo -e "${YELLOW}[4/6] 构建 Docker 镜像...${NC}"
export APP_VERSION="${APP_VERSION:-1.0.0}"
export VCS_REF="$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
export VCS_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
export BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Build mapping: version=${APP_VERSION}, commit=${VCS_REF}, branch=${VCS_BRANCH}, built=${BUILD_DATE}"
docker-compose build --no-cache
echo -e "${GREEN}镜像构建完成${NC}"

# 步骤 5: 启动服务
echo -e "${YELLOW}[5/6] 启动服务...${NC}"
docker-compose down 2>/dev/null || true
docker-compose up -d

# 等待服务启动
echo "等待服务启动..."
sleep 10

# 检查健康状态
echo -e "${YELLOW}[6/6] 检查服务状态...${NC}"
if curl -sf http://localhost:$PORT/api/health > /dev/null; then
    echo -e "${GREEN}服务启动成功！${NC}"
else
    echo -e "${RED}服务可能未正常启动，请检查日志: docker-compose logs${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "访问地址: ${YELLOW}http://$(curl -s ifconfig.me):$PORT${NC}"
echo -e "默认账号: ${YELLOW}admin / admin123${NC}"
echo ""
echo "常用命令:"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo ""
echo -e "${YELLOW}提示: 请确保阿里云安全组已开放 $PORT 端口${NC}"
echo ""
