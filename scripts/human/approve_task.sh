#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 TASK_ID [type]" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASK_ID="$1"
TYPE="${2:-changelog}"
ACTOR="${HUMAN_GATE_ACTOR:-${USER:-unknown}}"
REASON="${3:-approved by human gate}"

cd "$ROOT"
node scripts/human/record_gate.mjs "$TASK_ID" approved "continue:$TYPE" "$ACTOR" "$REASON" >/dev/null
node scripts/state/update_stage.mjs "$TASK_ID" cleanup "human approved" >/dev/null
node scripts/orchestrator/run_task.mjs "$TASK_ID" "--type=$TYPE" "--approved=true"
