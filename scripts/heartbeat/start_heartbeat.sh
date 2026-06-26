#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PID_FILE="$ROOT/logs/heartbeat.pid"
LOG_FILE="$ROOT/logs/heartbeat.log"

mkdir -p "$ROOT/logs"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Heartbeat already running with PID $(cat "$PID_FILE")"
  exit 0
fi

nohup node "$ROOT/scripts/heartbeat/heartbeat_daemon.mjs" >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "Heartbeat started with PID $(cat "$PID_FILE")"
