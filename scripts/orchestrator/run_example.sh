#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASK_ID="${1:-example-smoke}"

cd "$ROOT"
rm -f "states/state_$TASK_ID.md"
node scripts/state/sync_board.mjs >/dev/null
node scripts/orchestrator/run_task.mjs "$TASK_ID" "--title=Example isolated file update"
