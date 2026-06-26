#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="heartbeat-verify"
rm -f "states/state_${TASK_ID}.md"
scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true

before_lines=0
[ -f logs/heartbeat.log ] && before_lines="$(wc -l < logs/heartbeat.log | tr -d ' ')"

node scripts/state/create_state.mjs "$TASK_ID" "Heartbeat verify" --priority=P2 --type=example --requirement="Heartbeat verification task" --acceptance="Heartbeat dispatches pending task" >/tmp/heartbeat-verify-create.out
node scripts/heartbeat/heartbeat_once.mjs >/tmp/heartbeat-verify.out 2>/tmp/heartbeat-verify.err

grep -q "HEARTBEAT_DISPATCHED\\|HEARTBEAT_NO_TASKS" /tmp/heartbeat-verify.out
after_lines="$(wc -l < logs/heartbeat.log | tr -d ' ')"
if [ "$after_lines" -le "$before_lines" ]; then
  echo "HEARTBEAT_VERIFY_FAILED no log growth"
  exit 1
fi
grep -q "heartbeat_start" logs/heartbeat.log

rm -f "states/state_${TASK_ID}.md"
scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true
node scripts/state/sync_board.mjs >/dev/null

echo "HEARTBEAT_VERIFY_PASSED"
