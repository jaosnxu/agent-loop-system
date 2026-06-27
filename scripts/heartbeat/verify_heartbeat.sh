#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="heartbeat-verify"
HUMAN_TASK_ID="heartbeat-human-verify"
STALE_TASK_ID="heartbeat-stale-verify"
rm -f "states/state_${TASK_ID}.md" "states/state_${HUMAN_TASK_ID}.md" "states/state_${STALE_TASK_ID}.md"
scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true

before_lines=0
[ -f logs/heartbeat.log ] && before_lines="$(wc -l < logs/heartbeat.log | tr -d ' ')"

node scripts/state/create_state.mjs "$TASK_ID" "Heartbeat verify" --priority=P2 --type=example --requirement="Heartbeat verification task" --acceptance="Heartbeat dispatches pending task" >/tmp/heartbeat-verify-create.out
node scripts/state/create_state.mjs "$HUMAN_TASK_ID" "Heartbeat human gate verify" --priority=P1 --type=example --requirement="Human-gated task must stay paused." --acceptance="Heartbeat supervisor logs waiting human and does not dispatch it." >/tmp/heartbeat-human-create.out
node scripts/human/record_gate.mjs "$HUMAN_TASK_ID" pending "verify_human_pause" "heartbeat-verify" "heartbeat must not bypass human gate" >/tmp/heartbeat-human-pending.out
node scripts/state/create_state.mjs "$STALE_TASK_ID" "Heartbeat stale verify" --priority=P1 --type=example --requirement="Stale running task must be detected." --acceptance="Heartbeat supervisor logs stale running without unsafe continuation." >/tmp/heartbeat-stale-create.out
node scripts/state/update_stage.mjs "$STALE_TASK_ID" running "simulate stale running" >/dev/null
node - <<'NODE'
const fs = require("fs");
const file = "states/state_heartbeat-stale-verify.md";
const oldDate = "2000-01-01T00:00:00.000Z";
const text = fs.readFileSync(file, "utf8").replace(/^- Updated At: .*$/m, `- Updated At: ${oldDate}`);
fs.writeFileSync(file, text);
NODE
node scripts/heartbeat/heartbeat_once.mjs >/tmp/heartbeat-verify.out 2>/tmp/heartbeat-verify.err

grep -q "HEARTBEAT_DISPATCHED\\|HEARTBEAT_NO_TASKS" /tmp/heartbeat-verify.out
after_lines="$(wc -l < logs/heartbeat.log | tr -d ' ')"
if [ "$after_lines" -le "$before_lines" ]; then
  echo "HEARTBEAT_VERIFY_FAILED no log growth"
  exit 1
fi
grep -q "heartbeat_start" logs/heartbeat.log
grep -q "heartbeat_supervisor" logs/heartbeat.log
grep -q "heartbeat_waiting_human task=$HUMAN_TASK_ID" logs/heartbeat.log
grep -q "heartbeat_stale_running task=$STALE_TASK_ID" logs/heartbeat.log
grep -q "Current Stage: pending_human" "states/state_${HUMAN_TASK_ID}.md"

rm -f "states/state_${TASK_ID}.md" "states/state_${HUMAN_TASK_ID}.md" "states/state_${STALE_TASK_ID}.md"
scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true
node scripts/state/sync_board.mjs >/dev/null

echo "HEARTBEAT_VERIFY_PASSED"
