#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="memory-spine-smoke"
rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"

node scripts/state/create_state.mjs "$TASK_ID" "Memory spine smoke" --priority=P2 --type=development --requirement="Persist task state to external memory." --acceptance="Memory file must mirror stage, failures, root cause, fix plan, next checks, and action journal." >/tmp/memory-spine-create.out
node scripts/state/update_stage.mjs "$TASK_ID" development "memory smoke stage" >/tmp/memory-spine-stage.out
node scripts/state/record_action.mjs "$TASK_ID" development "inspect requirement" "states/state_$TASK_ID.md" "read" "write artifact then run gate" >/tmp/memory-spine-action.out
node scripts/state/record_diagnostic.mjs "$TASK_ID" auto_gate 1 3 "Injected gate failure for memory verification." >/tmp/memory-spine-diagnostic.out
node scripts/state/record_failure.mjs "$TASK_ID" "Injected failure for memory verification." >/tmp/memory-spine-failure.out

test -f "memory/tasks/$TASK_ID.md"
grep -q "Current Stage: returned_to_development" "memory/tasks/$TASK_ID.md"
grep -q "## Action Journal" "memory/tasks/$TASK_ID.md"
grep -q "inspect requirement" "memory/tasks/$TASK_ID.md"
grep -q "## Root Cause Analysis" "memory/tasks/$TASK_ID.md"
grep -q "Injected gate failure" "memory/tasks/$TASK_ID.md"
grep -q "## Fix Plan" "memory/tasks/$TASK_ID.md"
grep -q "## Next Checks" "memory/tasks/$TASK_ID.md"
grep -q "## Retry Ledger" "memory/tasks/$TASK_ID.md"
grep -q "Injected failure" "memory/tasks/$TASK_ID.md"

rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_MEMORY_SPINE_OK"
