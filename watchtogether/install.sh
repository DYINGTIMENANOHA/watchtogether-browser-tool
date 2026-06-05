#!/bin/bash
# One-command installer for the WatchTogether server.
# Usage: bash install.sh [--port 8892] [--domain your.domain.com] [--dir /opt/watchtogether]

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
die()   { echo -e "${RED}[ERR]${NC}  $1"; exit 1; }

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
    *) warn "Unknown argument $1, ignoring" ;;
  esac
  shift
done

[[ $EUID -ne 0 ]] && die "Please run this script as root or with sudo"

if   [[ -f /etc/debian_version ]]; then PKG="apt-get"
elif [[ -f /etc/redhat-release ]]; then PKG="yum"
else die "Unsupported OS. Please install manually."; fi

info "Installing base dependencies..."
if [[ "$PKG" == "apt-get" ]]; then
  apt-get update -qq
  apt-get install -y -qq curl wget git build-essential
else
  yum install -y -q curl wget git gcc
fi
ok "Dependencies installed"

if command -v go &>/dev/null && [[ "$(go version | awk '{print $3}')" == "go${GO_VERSION}" ]]; then
  ok "Go ${GO_VERSION} already installed"
else
  info "Installing Go ${GO_VERSION}..."
  ARCH=$(uname -m)
  [[ "$ARCH" == "x86_64" ]] && GOARCH="amd64" || GOARCH="arm64"
  GO_TAR="go${GO_VERSION}.linux-${GOARCH}.tar.gz"
  wget -q "https://go.dev/dl/${GO_TAR}" -O /tmp/${GO_TAR}
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/${GO_TAR}
  rm /tmp/${GO_TAR}
  export PATH=$PATH:/usr/local/go/bin
  echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
  ok "Go ${GO_VERSION} installed"
fi

export PATH=$PATH:/usr/local/go/bin

REPO_DIR="$INSTALL_DIR"
if [[ -d "$REPO_DIR/.git" ]]; then
  info "Updating repository..."
  git -C "$REPO_DIR" pull --quiet
else
  info "Cloning repository to $REPO_DIR..."
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone --quiet https://github.com/YOUR_USERNAME/watchtogether "$REPO_DIR" 2>/dev/null || {
    warn "Could not clone repository, using current directory"
    REPO_DIR="$(pwd)"
  }
fi

BACKEND_DIR="$REPO_DIR/backend"
[[ -d "$BACKEND_DIR" ]] || die "Backend directory not found: $BACKEND_DIR"

info "Building backend..."
cd "$BACKEND_DIR"
go build -o watchtogether . || die "Build failed; check your Go environment"
chmod +x watchtogether
ok "Build complete"

mkdir -p "$BACKEND_DIR/logs"

info "Writing systemd service..."
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
Environment=BIND_HOST=127.0.0.1
Environment=LOG_PRETTY=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME} --quiet
systemctl restart ${SERVICE_NAME}
sleep 2

if systemctl is-active --quiet ${SERVICE_NAME}; then
  ok "Service started on port ${PORT}"
else
  die "Service failed to start. Run: journalctl -u ${SERVICE_NAME} -n 30"
fi

info "Backend is bound to 127.0.0.1:${PORT}; expose it through Nginx instead of opening this port."

echo ""
echo -e "${GREEN}WatchTogether install complete.${NC}"
echo "Service status: systemctl status ${SERVICE_NAME}"
echo "Live logs:      journalctl -u ${SERVICE_NAME} -f"
echo "Backend URL:    http://127.0.0.1:${PORT}"
echo ""

if [[ -n "$DOMAIN" ]]; then
  echo -e "${YELLOW}Next: configure Nginx + HTTPS. Chrome extensions require wss://.${NC}"
  echo "1. Install Nginx and Certbot:"
  echo "   apt-get install -y nginx certbot python3-certbot-nginx"
  echo "2. Request an SSL certificate:"
  echo "   certbot --nginx -d ${DOMAIN}"
  echo "3. Add the reverse proxy rules from nginx_snippet.conf."
  echo "4. Set the extension server URL to: https://${DOMAIN}"
else
  echo -e "${YELLOW}Chrome extensions require HTTPS/wss://. Configure a domain and SSL certificate.${NC}"
fi
echo ""
