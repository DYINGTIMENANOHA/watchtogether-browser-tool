#!/bin/bash
SERVICE="watchtogether.service"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
APP_DIR="/opt/watchtogether/backend"
HEALTH_URL="http://127.0.0.1:8892/health"
PUBLIC_PORTS_REGEX=':(8892|9091|9090|3000|3100)\b'

check_bind_host() {
  if systemctl show "$SERVICE" -p Environment 2>/dev/null | grep -q 'BIND_HOST=127.0.0.1'; then
    echo -e "${GREEN}bind ok${NC}  BIND_HOST=127.0.0.1"
  else
    echo -e "${YELLOW}warn${NC}     BIND_HOST=127.0.0.1 is not set in ${SERVICE}"
    echo "         Add it with: sudo systemctl edit ${SERVICE}"
  fi
}

check_health() {
  if command -v curl >/dev/null 2>&1 && curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo -e "${GREEN}health ok${NC} ${HEALTH_URL}"
  else
    echo -e "${YELLOW}warn${NC}     local health check failed: ${HEALTH_URL}"
  fi
}

check_ports() {
  if ! command -v ss >/dev/null 2>&1; then
    echo -e "${YELLOW}warn${NC}     ss not found; skipped port exposure check"
    return
  fi

  exposed=$(ss -lnt 2>/dev/null | grep -E "$PUBLIC_PORTS_REGEX" | grep -Ev '127\.0\.0\.1:|\[::1\]:' || true)
  if [[ -z "$exposed" ]]; then
    echo -e "${GREEN}ports ok${NC} monitored/backend ports are not listening publicly"
  else
    echo -e "${YELLOW}warn${NC}     these ports may be publicly exposed:"
    echo "$exposed"
  fi
}

check_nginx() {
  if ! command -v nginx >/dev/null 2>&1; then
    echo -e "${YELLOW}warn${NC}     nginx not found; skipped nginx check"
    return
  fi

  if nginx -t >/dev/null 2>&1; then
    echo -e "${GREEN}nginx ok${NC} config test passed"
  else
    echo -e "${RED}nginx failed${NC} config test failed"
    nginx -t
    return 1
  fi
}

maybe_reload_nginx() {
  check_nginx || return 1
  if [[ "$1" == "--reload-nginx" ]]; then
    systemctl reload nginx && echo -e "${GREEN}nginx reloaded${NC}"
    return
  fi
  if [[ -t 0 ]]; then
    read -r -p "Reload nginx now? [y/N] " answer
    case "$answer" in
      y|Y|yes|YES)
        systemctl reload nginx && echo -e "${GREEN}nginx reloaded${NC}"
        ;;
      *)
        echo "nginx reload skipped"
        ;;
    esac
  else
    echo "nginx reload skipped; run: sudo ./manage.sh nginx-reload"
  fi
}

case "$1" in
  start)
    systemctl start $SERVICE
    sleep 1
    systemctl is-active --quiet $SERVICE && echo -e "${GREEN}started${NC}" || echo -e "${RED}start failed${NC}"
    ;;
  stop)
    systemctl stop $SERVICE && echo -e "${YELLOW}stopped${NC}"
    ;;
  restart)
    systemctl restart $SERVICE
    sleep 1
    systemctl is-active --quiet $SERVICE && echo -e "${GREEN}restarted${NC}" || echo -e "${RED}restart failed${NC}"
    ;;
  build)
    echo -e "${CYAN}building...${NC}"
    cd "$APP_DIR" && go build -o watchtogether . && echo -e "${GREEN}build ok${NC}" || echo -e "${RED}build failed${NC}"
    ;;
  deploy)
    echo -e "${CYAN}building and restarting...${NC}"
    cd "$APP_DIR" && go build -o watchtogether . || { echo -e "${RED}build failed${NC}"; exit 1; }
    systemctl daemon-reload
    systemctl restart $SERVICE
    sleep 1
    if systemctl is-active --quiet $SERVICE; then
      echo -e "${GREEN}deploy ok${NC}"
      check_bind_host
      check_health
      check_ports
      maybe_reload_nginx "$2"
    else
      echo -e "${RED}deploy failed${NC}"
      systemctl status $SERVICE --no-pager | head -20
      exit 1
    fi
    ;;
  status)
    systemctl status $SERVICE --no-pager | head -15
    check_bind_host
    check_health
    check_ports
    check_nginx
    ;;
  nginx-reload)
    check_nginx && systemctl reload nginx && echo -e "${GREEN}nginx reloaded${NC}"
    ;;
  log)
    echo -e "${CYAN}live log (Ctrl+C to exit)${NC}"
    journalctl -u $SERVICE -f --no-pager
    ;;
  log20)
    journalctl -u $SERVICE -n 20 --no-pager
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|build|deploy [--reload-nginx]|status|nginx-reload|log|log20}"
    ;;
esac
