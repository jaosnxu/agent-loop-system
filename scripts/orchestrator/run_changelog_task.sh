#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASK_ID="${1:-changelog-v1}"

cd "$ROOT"
rm -f "states/state_$TASK_ID.md"
node scripts/state/sync_board.mjs >/dev/null
scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true
node scripts/orchestrator/run_task.mjs "$TASK_ID" "--title=Create v1.0 CHANGELOG" "--type=changelog"
