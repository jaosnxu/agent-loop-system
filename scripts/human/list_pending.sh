#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

found=0
for file in states/state_*.md; do
  [ -f "$file" ] || continue
  if grep -q '^- Current Stage: pending_human$' "$file"; then
    found=1
    task_id="$(grep '^- Task ID:' "$file" | sed 's/^- Task ID: //')"
    next_action="$(awk '/^## Next Action/{getline; getline; sub(/^- /, ""); print; exit}' "$file")"
    echo "PENDING_HUMAN task=$task_id next=$next_action file=$file"
  fi
done

if [ "$found" -eq 0 ]; then
  echo "PENDING_HUMAN_NONE"
fi
