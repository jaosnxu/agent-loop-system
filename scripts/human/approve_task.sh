#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 TASK_ID [type]" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASK_ID="$1"
TYPE="${2:-changelog}"

cd "$ROOT"
node scripts/state/update_stage.mjs "$TASK_ID" cleanup "human approved" >/dev/null
node scripts/orchestrator/run_task.mjs "$TASK_ID" "--type=$TYPE" "--approved=true"
