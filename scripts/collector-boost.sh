#!/bin/sh
# Browser market collector boost mode (owner's switch, 2026-11-21).
#   scripts/collector-boost.sh on      every 10 min, 200 shops / 200 rows per run, until turned off
#   scripts/collector-boost.sh off     back to normal (15 min period, 150 shops / 150 rows)
#   scripts/collector-boost.sh status  current state
# The extension reads the period and scope from the server on every run, so nothing needs a restart.
set -e
API=https://gms-hub-votes.kwonth211.workers.dev/internal/market-boost
KEY="Authorization: Bearer $(cat ~/.config/gms-hub/mail-token)"
case "${1:-status}" in
  on)  curl -s -A gms-hub-mail/1.0 -H "$KEY" -H 'Content-Type: application/json' -d '{"on":true}' "$API" ;;
  off) curl -s -A gms-hub-mail/1.0 -H "$KEY" -H 'Content-Type: application/json' -d '{"on":false}' "$API" ;;
  status) curl -s -A gms-hub-mail/1.0 -H "$KEY" "$API" ;;
  *) echo "usage: $0 on|off|status" >&2; exit 2 ;;
esac
echo
