#!/bin/bash
# WatchTogether 服务端一键安装脚本
# 支持 Ubuntu 20.04+ / Debian 11+ / CentOS 8+
# 用法：curl -fsSL <你的脚本地址> | bash
#   或：bash install.sh [--port 8892] [--domain your.domain.com]

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
die()   { echo -e "${RED}[ERR]${NC}  $1"; exit 1; }

# ── 参数 ──────────────────────────────────────────
PORT=8892
DOMAIN=""
INSTALL_DIR="/opt/watchtogether"
SERVICE_NAME="watchtogether"
GO_VERSION="1.22.3"

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --port)   PORT="$2"; shift ;;
    --domain) DOMAIN="$2"; shift ;;
    --dir)    INSTALL_DIR="$2"; shift ;;
    *) warn "未知参数 $1，忽略" ;;
  esac
  shift
done

# ── 检查 root ──────────────────────────────────────
[[ $EUID -ne 0 ]] && die "请用 root 或 sudo 运行此脚本"

# ── 检测 OS ───────────────────────────────────────
if   [[ -f /etc/debian_version ]]; then PKG="apt-get"
elif [[ -f /etc/redhat-release ]]; then PKG="yum"
else die "暂不支持的操作系统，请手动安装"; fi

# ── 安装基础依赖 ──────────────────────────────────
info "安装基础依赖..."
if [[ "$PKG" == "apt-get" ]]; then
  apt-get update -qq
  apt-get install -y -qq curl wget git build-essential
else
  yum install -y -q curl wget git gcc
fi
ok "依赖安装完成"

# ── 安装 Go ───────────────────────────────────────
if command -v go &>/dev/null && [[ "$(go version | awk '{print $3}')" == "go${GO_VERSION}" ]]; then
  ok "Go ${GO_VERSION} 已安装"
else
  info "安装 Go ${GO_VERSION}..."
  ARCH=$(uname -m)
  [[ "$ARCH" == "x86_64" ]] && GOARCH="amd64" || GOARCH="arm64"
  GO_TAR="go${GO_VERSION}.linux-${GOARCH}.tar.gz"
  wget -q "https://go.dev/dl/${GO_TAR}" -O /tmp/${GO_TAR}
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/${GO_TAR}
  rm /tmp/${GO_TAR}
  export PATH=$PATH:/usr/local/go/bin
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
  ok "Go ${GO_VERSION} 安装完成"
fi

export PATH=$PATH:/usr/local/go/bin

# ── 拉取/更新代码 ─────────────────────────────────
REPO_DIR="$INSTALL_DIR"
if [[ -d "$REPO_DIR/.git" ]]; then
  info "更新代码..."
  git -C "$REPO_DIR" pull --quiet
else
  info "克隆代码到 $REPO_DIR..."
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone --quiet https://github.com/YOUR_USERNAME/watchtogether "$REPO_DIR" 2>/dev/null || {
    # 如果没有 git 仓库，假设已在当前目录
    warn "无法克隆仓库，使用当前目录"
    REPO_DIR="$(pwd)"
  }
fi

BACKEND_DIR="$REPO_DIR/backend"
[[ -d "$BACKEND_DIR" ]] || die "找不到 backend 目录：$BACKEND_DIR"

# ── 编译 ──────────────────────────────────────────
info "编译后端..."
cd "$BACKEND_DIR"
go build -o watchtogether . || die "编译失败，请检查 Go 环境"
chmod +x watchtogether
ok "编译完成"

# ── 创建日志目录 ──────────────────────────────────
mkdir -p "$BACKEND_DIR/logs"

# ── 写 systemd service ────────────────────────────
info "配置 systemd 服务..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=WatchTogether Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${BACKEND_DIR}
ExecStart=${BACKEND_DIR}/watchtogether
Restart=always
RestartSec=5
Environment=PORT=${PORT}
Environment=LOG_PRETTY=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME} --quiet
systemctl restart ${SERVICE_NAME}
sleep 2

if systemctl is-active --quiet ${SERVICE_NAME}; then
  ok "服务已启动 (端口 ${PORT})"
else
  die "服务启动失败，运行 journalctl -u ${SERVICE_NAME} -n 30 查看日志"
fi

# ── 防火墙放行 ────────────────────────────────────
if command -v ufw &>/dev/null && ufw status | grep -q "active"; then
  ufw allow ${PORT}/tcp --quiet && ok "UFW 已放行端口 ${PORT}"
elif command -v firewall-cmd &>/dev/null; then
  firewall-cmd --permanent --add-port=${PORT}/tcp --quiet && firewall-cmd --reload --quiet && ok "firewalld 已放行端口 ${PORT}"
fi

# ── Nginx 提示 ────────────────────────────────────
echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${GREEN} WatchTogether 安装完成！${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo ""
echo " 服务状态：systemctl status ${SERVICE_NAME}"
echo " 实时日志：journalctl -u ${SERVICE_NAME} -f"
echo " 后端端口：${PORT}"
echo ""

if [[ -n "$DOMAIN" ]]; then
  echo -e "${YELLOW}接下来需要配置 Nginx + HTTPS（Chrome 插件必须用 wss://）：${NC}"
  echo ""
  echo " 1. 安装 Nginx 和 Certbot："
  echo "    apt-get install -y nginx certbot python3-certbot-nginx"
  echo ""
  echo " 2. 申请 SSL 证书："
  echo "    certbot --nginx -d ${DOMAIN}"
  echo ""
  echo " 3. 在 Nginx 配置里加入反代（参考 repo 里的 nginx_snippet.conf）"
  echo ""
  echo " 4. 插件设置页填入：https://${DOMAIN}"
else
  echo -e "${YELLOW}注意：Chrome 插件需要 HTTPS (wss://)，请配置域名和 SSL 证书。${NC}"
  echo " 参考 repo 里的 nginx_snippet.conf 和 README.md"
fi
echo ""
