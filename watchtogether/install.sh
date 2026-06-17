#!/usr/bin/env bash
# One-command installer for the WatchTogether relay server.
#
# Typical first install:
#   curl -fsSL https://raw.githubusercontent.com/DYINGTIMENANOHA/watchtogether-browser-tool/main/watchtogether/install.sh \
#     | sudo bash -s -- --domain watch.example.com --email admin@example.com
#
# Local install from an already-cloned repository:
#   sudo bash watchtogether/install.sh --domain watch.example.com --email admin@example.com

set -Eeuo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()   { echo -e "${RED}[ERR]${NC}  $*" >&2; exit 1; }

PORT=8892
PROM_PORT=9091
BIND_HOST=127.0.0.1
DOMAIN=""
EMAIL=""
INSTALL_DIR="/opt/watchtogether-extension"
SERVICE_NAME="watchtogether"
REPO_URL="https://github.com/DYINGTIMENANOHA/watchtogether-browser-tool.git"
BRANCH="main"
GO_VERSION="1.22.3"
GO_BIN="/usr/local/go/bin/go"
WITH_NGINX=1
WITH_CERTBOT=1
CLIENT_TOKEN=""
ALLOWED_ORIGINS=""

usage() {
  cat <<EOF
Usage: sudo bash install.sh [options]

Options:
  --domain DOMAIN          Public HTTPS domain, for example watch.example.com
  --email EMAIL            Let's Encrypt registration email
  --port PORT              Backend port bound to 127.0.0.1 (default: 8892)
  --prom-port PORT         Metrics port bound to 127.0.0.1 (default: 9091)
  --dir DIR                Install/update repository in DIR (default: /opt/watchtogether-extension)
  --service NAME           systemd service name (default: watchtogether)
  --repo-url URL           Git repository URL
  --branch BRANCH          Git branch to deploy (default: main)
  --client-token TOKEN     Optional private server token; leave empty for public relay
  --allowed-origins LIST   Optional comma-separated browser origins
  --no-nginx               Do not write Nginx config
  --no-certbot             Do not request/renew Let's Encrypt certificate
  -h, --help               Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --prom-port) PROM_PORT="${2:-}"; shift 2 ;;
    --dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --service) SERVICE_NAME="${2:-}"; shift 2 ;;
    --repo-url) REPO_URL="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --client-token) CLIENT_TOKEN="${2:-}"; shift 2 ;;
    --allowed-origins) ALLOWED_ORIGINS="${2:-}"; shift 2 ;;
    --no-nginx) WITH_NGINX=0; shift ;;
    --no-certbot) WITH_CERTBOT=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Please run as root, for example: sudo bash install.sh ..."
[[ "$PORT" =~ ^[0-9]+$ ]] || die "--port must be a number"
[[ "$PROM_PORT" =~ ^[0-9]+$ ]] || die "--prom-port must be a number"
if [[ "$WITH_NGINX" -eq 1 && -z "$DOMAIN" ]]; then
  die "--domain is required unless --no-nginx is used"
fi

if [[ -f /etc/debian_version ]]; then
  OS_FAMILY="debian"
elif [[ -f /etc/redhat-release ]]; then
  OS_FAMILY="redhat"
else
  die "Unsupported OS. Use Ubuntu/Debian/CentOS/RHEL or install manually."
fi

install_packages() {
  info "Installing base packages..."
  if [[ "$OS_FAMILY" == "debian" ]]; then
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl wget git build-essential ca-certificates
    if [[ "$WITH_NGINX" -eq 1 ]]; then
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
    fi
    if [[ "$WITH_CERTBOT" -eq 1 && "$WITH_NGINX" -eq 1 ]]; then
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx
    fi
  else
    yum install -y -q curl wget git gcc ca-certificates
    if [[ "$WITH_NGINX" -eq 1 ]]; then yum install -y -q nginx; fi
    if [[ "$WITH_CERTBOT" -eq 1 && "$WITH_NGINX" -eq 1 ]]; then yum install -y -q certbot python3-certbot-nginx || yum install -y -q certbot; fi
  fi
  ok "Packages ready"
}

install_go() {
  if command -v go >/dev/null 2>&1 && [[ "$(go version | awk '{print $3}')" == "go${GO_VERSION}" ]]; then
    GO_BIN="$(command -v go)"
    ok "Go ${GO_VERSION} already installed"
    return
  fi

  info "Installing Go ${GO_VERSION}..."
  local arch goarch go_tar
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) goarch="amd64" ;;
    aarch64|arm64) goarch="arm64" ;;
    *) die "Unsupported CPU architecture for automatic Go install: $arch" ;;
  esac
  go_tar="go${GO_VERSION}.linux-${goarch}.tar.gz"
  wget -q "https://go.dev/dl/${go_tar}" -O "/tmp/${go_tar}"
  rm -rf /usr/local/go
  tar -C /usr/local -xzf "/tmp/${go_tar}"
  rm -f "/tmp/${go_tar}"
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
  GO_BIN="/usr/local/go/bin/go"
  ok "Go ${GO_VERSION} installed"
}

sync_repo() {
  local script_dir candidate_root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  candidate_root="$(cd "${script_dir}/.." && pwd)"

  if [[ -d "${candidate_root}/watchtogether/backend" && -d "${candidate_root}/.git" ]]; then
    REPO_DIR="$candidate_root"
    info "Using local repository: $REPO_DIR"
    return
  fi
  if [[ -d "${script_dir}/backend" ]]; then
    REPO_DIR="$script_dir"
    info "Using local server directory: $REPO_DIR"
    return
  fi

  REPO_DIR="$INSTALL_DIR"
  if [[ -d "${REPO_DIR}/.git" ]]; then
    info "Updating repository in $REPO_DIR..."
    git -C "$REPO_DIR" fetch --quiet origin "$BRANCH"
    git -C "$REPO_DIR" checkout --quiet "$BRANCH"
    git -C "$REPO_DIR" pull --ff-only --quiet origin "$BRANCH"
  else
    info "Cloning repository to $REPO_DIR..."
    mkdir -p "$(dirname "$REPO_DIR")"
    git clone --quiet --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
  fi
  ok "Repository ready"
}

find_backend_dir() {
  if [[ -d "${REPO_DIR}/watchtogether/backend" ]]; then
    BACKEND_DIR="${REPO_DIR}/watchtogether/backend"
    SERVER_DIR="${REPO_DIR}/watchtogether"
  elif [[ -d "${REPO_DIR}/backend" ]]; then
    BACKEND_DIR="${REPO_DIR}/backend"
    SERVER_DIR="$REPO_DIR"
  else
    die "Backend directory not found under $REPO_DIR"
  fi
}

build_backend() {
  info "Building backend..."
  mkdir -p "${BACKEND_DIR}/logs"
  (cd "$BACKEND_DIR" && "$GO_BIN" build -o watchtogether .)
  chmod +x "${BACKEND_DIR}/watchtogether"
  ok "Backend build complete"
}

write_service() {
  info "Writing systemd service ${SERVICE_NAME}.service..."
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
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
Environment=PROM_PORT=${PROM_PORT}
Environment=BIND_HOST=${BIND_HOST}
Environment=LOG_PRETTY=0
Environment=CLIENT_TOKEN=${CLIENT_TOKEN}
Environment=ALLOWED_ORIGINS=${ALLOWED_ORIGINS}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}" --quiet
  systemctl restart "${SERVICE_NAME}"
  sleep 2
  systemctl is-active --quiet "${SERVICE_NAME}" || {
    systemctl status "${SERVICE_NAME}" --no-pager | head -30
    die "Service failed to start"
  }
  ok "Service is running on ${BIND_HOST}:${PORT}"
}

write_nginx() {
  [[ "$WITH_NGINX" -eq 1 ]] || return

  info "Writing Nginx config for ${DOMAIN}..."
  local available enabled conf
  available="/etc/nginx/sites-available"
  enabled="/etc/nginx/sites-enabled"
  if [[ -d "$available" && -d "$enabled" ]]; then
    conf="${available}/${SERVICE_NAME}.conf"
  else
    conf="/etc/nginx/conf.d/${SERVICE_NAME}.conf"
  fi

  cat > "$conf" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    server_tokens off;

    location /wt/room/ {
        proxy_pass http://${BIND_HOST}:${PORT}/room/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /wt/ws {
        proxy_pass http://${BIND_HOST}:${PORT}/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /wt/health {
        proxy_pass http://${BIND_HOST}:${PORT}/health;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

  if [[ "$conf" == "$available/"* ]]; then
    ln -sf "$conf" "${enabled}/${SERVICE_NAME}.conf"
  fi

  nginx -t
  systemctl enable nginx --quiet || true
  systemctl reload nginx 2>/dev/null || systemctl restart nginx
  ok "Nginx HTTP config active"
}

request_certificate() {
  [[ "$WITH_CERTBOT" -eq 1 && "$WITH_NGINX" -eq 1 ]] || return

  if ! command -v certbot >/dev/null 2>&1; then
    warn "certbot is not installed; skipping HTTPS certificate"
    return
  fi

  info "Requesting or renewing Let's Encrypt certificate for ${DOMAIN}..."
  local email_args
  if [[ -n "$EMAIL" ]]; then
    email_args=(--email "$EMAIL")
  else
    email_args=(--register-unsafely-without-email)
  fi
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos "${email_args[@]}" --redirect
  nginx -t
  systemctl reload nginx
  ok "HTTPS certificate active"
}

check_firewall_hint() {
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
    info "Opening Nginx firewall profile with ufw..."
    ufw allow 'Nginx Full' >/dev/null || true
  elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    info "Opening HTTP/HTTPS with firewalld..."
    firewall-cmd --permanent --add-service=http >/dev/null || true
    firewall-cmd --permanent --add-service=https >/dev/null || true
    firewall-cmd --reload >/dev/null || true
  else
    warn "No active ufw/firewalld detected. Make sure VPS security groups allow TCP 80 and 443."
  fi
}

health_checks() {
  info "Running health checks..."
  curl -fsS "http://${BIND_HOST}:${PORT}/health" >/dev/null
  ok "Local backend health OK"

  if command -v ss >/dev/null 2>&1; then
    local exposed
    exposed="$(ss -lnt | grep -E ":(${PORT}|${PROM_PORT})\\b" | grep -Ev "${BIND_HOST}:|\\[::1\\]:" || true)"
    if [[ -z "$exposed" ]]; then
      ok "Backend and metrics ports are not listening publicly"
    else
      warn "These backend/metrics ports may be publicly exposed:"
      echo "$exposed"
    fi
  fi

  if [[ -n "$DOMAIN" ]]; then
    if curl -fsS --max-time 10 "https://${DOMAIN}/wt/health" >/dev/null 2>&1; then
      ok "HTTPS health OK: https://${DOMAIN}/wt/health"
    else
      warn "HTTPS health check failed. If DNS was just changed, wait for DNS propagation, then run:"
      echo "     curl -v https://${DOMAIN}/wt/health"
    fi
  fi
}

install_packages
install_go
sync_repo
find_backend_dir
build_backend
write_service
write_nginx
request_certificate
check_firewall_hint
health_checks

echo ""
echo -e "${GREEN}WatchTogether deployment complete.${NC}"
echo "Service:       ${SERVICE_NAME}.service"
echo "Repository:    ${REPO_DIR}"
echo "Backend:       http://${BIND_HOST}:${PORT}"
if [[ -n "$DOMAIN" ]]; then
  echo "Public URL:    https://${DOMAIN}"
  echo "Health URL:    https://${DOMAIN}/wt/health"
fi
echo "Status:        systemctl status ${SERVICE_NAME} --no-pager"
echo "Logs:          journalctl -u ${SERVICE_NAME} -f"
