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
  if [ ! -f queue/human-approvals.json ]; then
    echo "PENDING_HUMAN_NONE"
    exit 0
  fi
fi

if [ -f queue/human-approvals.json ]; then
  export AGENT_LOOP_LIST_STATE_FOUND="$found"
  node --input-type=module <<'NODE'
import fs from "node:fs";
const file = "queue/human-approvals.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
let count = 0;
for (const request of data.requests || []) {
  if (request.status !== "pending") continue;
  count += 1;
  console.log(`PENDING_APPROVAL approval=${request.approvalId} task=${request.taskId} operation=${request.tool}:${request.operation} role=${request.role} target=${request.target || request.command || ""}`);
}
if (!count && process.env.AGENT_LOOP_LIST_STATE_FOUND !== "1") {
  console.log("PENDING_HUMAN_NONE");
}
NODE
fi
