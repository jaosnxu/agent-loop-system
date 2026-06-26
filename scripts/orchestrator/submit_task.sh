#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 TASK_ID [task title]" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASK_ID="$1"
TITLE="${2:-Manual task}"

cd "$ROOT"
node scripts/orchestrator/run_task.mjs "$TASK_ID" "--title=$TITLE"
