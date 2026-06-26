#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PID_DIR="$ROOT/logs/mcp"

mkdir -p "$PID_DIR"

for pid_file in "$PID_DIR"/*.pid; do
  [ -e "$pid_file" ] || continue
  name="$(basename "$pid_file" .pid)"
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "$name stopped pid=$pid"
  else
    echo "$name not running pid=$pid"
  fi
  rm -f "$pid_file"
done
