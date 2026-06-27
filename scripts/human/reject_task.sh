#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 TASK_ID [reason]" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASK_ID="$1"
REASON="${2:-human rejected}"
ACTOR="${HUMAN_GATE_ACTOR:-${USER:-unknown}}"

cd "$ROOT"
node scripts/human/record_gate.mjs "$TASK_ID" rejected "reject_task" "$ACTOR" "$REASON" >/dev/null
node scripts/state/terminate_task.mjs "$TASK_ID" "$REASON"
scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true
echo "TASK_REJECTED $TASK_ID"
