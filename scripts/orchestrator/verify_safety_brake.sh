#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASK_ID="${1:-brake-smoke}"

cd "$ROOT"
rm -f "states/state_$TASK_ID.md"
node scripts/state/create_state.mjs "$TASK_ID" "Safety brake smoke" >/dev/null
scripts/worktree/create_worktree.sh "$TASK_ID" >/dev/null
node scripts/state/update_stage.mjs "$TASK_ID" development "prepare safety brake verification" >/dev/null
node scripts/state/set_counter.mjs "$TASK_ID" "Iteration Count" 10 >/dev/null
node scripts/orchestrator/run_task.mjs "$TASK_ID" "--title=Safety brake smoke" >/tmp/agent-loop-brake.out
grep -q "TASK_RESULT task=$TASK_ID stage=terminated" /tmp/agent-loop-brake.out
grep -q "Current Stage: terminated" "states/state_$TASK_ID.md"
test ! -e "../worktrees/$TASK_ID"
echo "SAFETY_BRAKE_VERIFIED task=$TASK_ID"
