#!/bin/bash
SERVICE="watchtogether.service"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

case "$1" in
  start)
    systemctl start $SERVICE
    sleep 1
    systemctl is-active --quiet $SERVICE && echo -e "${GREEN}✓ 已启动${NC}" || echo -e "${RED}✗ 启动失败${NC}"
    ;;
  stop)
    systemctl stop $SERVICE && echo -e "${YELLOW}✓ 已停止${NC}"
    ;;
  restart)
    systemctl restart $SERVICE
    sleep 1
    systemctl is-active --quiet $SERVICE && echo -e "${GREEN}✓ 已重启${NC}" || echo -e "${RED}✗ 重启失败${NC}"
    ;;
  build)
    echo -e "${CYAN}编译中...${NC}"
    cd /opt/watchtogether/backend && go build -o watchtogether . && echo -e "${GREEN}✓ 编译成功${NC}" || echo -e "${RED}✗ 编译失败${NC}"
    ;;
  deploy)
    echo -e "${CYAN}编译并重启...${NC}"
    cd /opt/watchtogether/backend && go build -o watchtogether . && systemctl restart $SERVICE
    sleep 1
    systemctl is-active --quiet $SERVICE && echo -e "${GREEN}✓ 部署成功${NC}" || echo -e "${RED}✗ 部署失败${NC}"
    ;;
  status)
    systemctl status $SERVICE --no-pager | head -15
    ;;
  log)
    echo -e "${CYAN}实时日志 (Ctrl+C 退出)${NC}"
    journalctl -u $SERVICE -f --no-pager
    ;;
  log20)
    journalctl -u $SERVICE -n 20 --no-pager
    ;;
  *)
    echo "用法: $0 {start|stop|restart|build|deploy|status|log|log20}"
    ;;
esac
