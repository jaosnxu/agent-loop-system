#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 APPROVAL_ID [reason]" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APPROVAL_ID="$1"
REASON="${2:-approved by human approval queue}"
ACTOR="${HUMAN_GATE_ACTOR:-${USER:-unknown}}"

cd "$ROOT"
node scripts/human/resolve_approval.mjs "$APPROVAL_ID" approved "$ACTOR" "$REASON"
