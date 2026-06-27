#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="heartbeat-status-smoke"
rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
rm -f queue/human-approvals.json

node scripts/state/create_state.mjs "$TASK_ID" "Heartbeat status smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Heartbeat status must summarize task, queue, and approval state." \
  --acceptance="Status summary reports pending_human state and pending approval counts." >/dev/null
node scripts/human/record_gate.mjs "$TASK_ID" pending "status_summary" "verifier" "status summary pending" >/dev/null

mkdir -p queue
cat > queue/human-approvals.json <<JSON
{
  "version": "0.1.0",
  "requests": [
    {
      "approvalId": "heartbeat-status-approval-1",
      "taskId": "$TASK_ID",
      "status": "pending",
      "role": "development",
      "tool": "github",
      "operation": "pull_requests:write",
      "target": "https://api.github.com/repos/example/repo/pulls",
      "command": "{\\"taskId\\":\\"$TASK_ID\\"}",
      "reason": "critical operation requires human gate",
      "requestedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
JSON

node scripts/heartbeat/status_summary.mjs >/tmp/heartbeat-status-summary.out
grep -q "HEARTBEAT_STATUS" /tmp/heartbeat-status-summary.out
grep -q '"waiting_human": 1' /tmp/heartbeat-status-summary.out
grep -q '"pending": 1' /tmp/heartbeat-status-summary.out
grep -q "heartbeat_status_summary" logs/heartbeat.log

rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md" queue/human-approvals.json
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_HEARTBEAT_STATUS_SUMMARY_OK"
