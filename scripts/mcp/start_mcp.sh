#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PID_DIR="$ROOT/logs/mcp"
LOG_DIR="$ROOT/logs"
WORKTREES_ROOT="$(cd "$ROOT/../.." && pwd)/worktrees"
PROJECT_ROOT="$(cd "$ROOT/.." && pwd)"
LOCAL_GITHUB_ENV="$ROOT/config/github.local.env"

mkdir -p "$PID_DIR" "$LOG_DIR" "$WORKTREES_ROOT"

if [ -f "$LOCAL_GITHUB_ENV" ]; then
  source "$LOCAL_GITHUB_ENV"
fi

start_one() {
  local name="$1"
  shift
  local pid_file="$PID_DIR/$name.pid"
  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$name already running pid=$(cat "$pid_file")"
    return 0
  fi
  nohup bash -lc "tail -f /dev/null | $*" >> "$LOG_DIR/mcp-$name.log" 2>&1 &
  echo $! > "$pid_file"
  echo "$name started pid=$(cat "$pid_file")"
}

start_one filesystem "npx -y @modelcontextprotocol/server-filesystem '$WORKTREES_ROOT' '$PROJECT_ROOT'"
start_one shell "node '$ROOT/scripts/mcp/shell_server.mjs'"

GITHUB_TOKEN_VALUE="${GITHUB_TOKEN:-}"
if [ -z "$GITHUB_TOKEN_VALUE" ] && command -v gh >/dev/null 2>&1; then
  GITHUB_TOKEN_VALUE="$(gh auth token 2>/dev/null || true)"
fi

if [ -z "$GITHUB_TOKEN_VALUE" ]; then
  echo "github skipped: no GITHUB_TOKEN and no gh auth token"
else
  start_one github "GITHUB_TOKEN='$GITHUB_TOKEN_VALUE' GITHUB_OWNER='${GITHUB_OWNER:-}' GITHUB_REPO='${GITHUB_REPO:-}' npx -y @modelcontextprotocol/server-github"
fi
