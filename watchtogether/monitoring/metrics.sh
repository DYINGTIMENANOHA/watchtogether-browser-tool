#!/bin/bash
RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
METRICS_URL="http://127.0.0.1:9091/metrics"

if ! curl -fs "$METRICS_URL" >/dev/null 2>&1; then
  echo -e "${RED}error${NC}    cannot reach $METRICS_URL (is the service running?)"
  exit 1
fi

RAW=$(curl -s "$METRICS_URL")
get() { echo "$RAW" | grep -m1 "^${1} " | awk '{printf "%.1f", $2}'; }

echo -e "${CYAN}=== WatchTogether Metrics ===${NC}"
echo -e "  Active connections   $(get wt_active_connections)"
echo -e "  Active rooms         $(get wt_active_rooms)"
echo -e "  Memory               $(get wt_memory_mb) MB"
echo -e "  Rooms created        $(get wt_rooms_created_total)"
echo -e "  Total joins          $(get wt_rooms_joined_total)"
echo -e "  Total disconnects    $(get wt_ws_disconnects_total)"
echo -e "  Vetoes               $(get wt_veto_total)"
echo -e "  Rate limit hits      $(get wt_rate_limit_hits_total)"
echo -e "  Token failures       $(get wt_token_failures_total)"
