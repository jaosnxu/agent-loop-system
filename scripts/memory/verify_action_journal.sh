#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="action-journal-smoke"
rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"

node scripts/state/create_state.mjs "$TASK_ID" "Action journal smoke" --priority=P2 --type=development --requirement="Record every action into external memory." --acceptance="State and memory must contain Action Journal entries with actor, action, result, and next_check." >/tmp/action-journal-create.out
node scripts/state/record_action.mjs "$TASK_ID" development "read skill and write artifact" "../worktrees/$TASK_ID/example.md" "planned" "run gate and review" >/tmp/action-journal-record.out

grep -q "## Action Journal" "states/state_$TASK_ID.md"
grep -q "actor=development" "states/state_$TASK_ID.md"
grep -q "next_check" "states/state_$TASK_ID.md"
grep -q "## Action Journal" "memory/tasks/$TASK_ID.md"
grep -q "read skill and write artifact" "memory/tasks/$TASK_ID.md"

rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_ACTION_JOURNAL_OK"
