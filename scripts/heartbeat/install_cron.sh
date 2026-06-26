#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CRON_EXPR="${1:-*/30 * * * *}"
MARKER="# agent-loop-system-heartbeat"
COMMAND="$CRON_EXPR cd \"$ROOT\" && /usr/bin/env node scripts/heartbeat/heartbeat_once.mjs >> logs/heartbeat.log 2>&1 $MARKER"

(crontab -l 2>/dev/null | grep -v "$MARKER" || true; echo "$COMMAND") | crontab -
echo "Installed cron heartbeat: $CRON_EXPR"
