#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PID_FILE="$ROOT/logs/heartbeat.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "Heartbeat is not running"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Heartbeat stopped PID $PID"
else
  echo "Heartbeat PID $PID is not active"
fi

rm -f "$PID_FILE"
