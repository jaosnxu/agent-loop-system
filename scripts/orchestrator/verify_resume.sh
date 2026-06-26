#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASK_ID="${1:-resume-smoke}"

cd "$ROOT"
rm -f "states/state_$TASK_ID.md"
node scripts/state/sync_board.mjs >/dev/null
scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true

set +e
node scripts/orchestrator/run_task.mjs "$TASK_ID" "--title=Resume smoke" "--interrupt-after=development" >/tmp/agent-loop-resume-first.out 2>/tmp/agent-loop-resume-first.err
FIRST_STATUS=$?
set -e

if [ "$FIRST_STATUS" -ne 75 ]; then
  echo "Expected intentional interrupt status 75, got $FIRST_STATUS" >&2
  cat /tmp/agent-loop-resume-first.err >&2
  exit 1
fi

node scripts/orchestrator/run_task.mjs "$TASK_ID" "--title=Resume smoke" >/tmp/agent-loop-resume-second.out
grep -q "TASK_RESULT task=$TASK_ID stage=completed" /tmp/agent-loop-resume-second.out
test ! -e "../worktrees/$TASK_ID"
echo "RESUME_VERIFIED task=$TASK_ID"
