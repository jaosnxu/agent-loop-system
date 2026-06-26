#!/usr/bin/env bash
set -euo pipefail

MARKER="# agent-loop-system-heartbeat"
(crontab -l 2>/dev/null | grep -v "$MARKER" || true) | crontab -
echo "Removed cron heartbeat entries"
