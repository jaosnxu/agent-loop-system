#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="github-merge-readiness-smoke"
APPROVAL_ID="approval-merge-readiness-1"
rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md" queue/human-approvals.json

node scripts/state/create_state.mjs "$TASK_ID" "GitHub merge readiness smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Merge readiness must require approved human gate, PR evidence, and CI evidence." \
  --acceptance="Approved request is accepted, GitHub PR/Actions are read, missing PR or CI blocks merge readiness without executing merge." >/dev/null
node scripts/human/record_gate.mjs "$TASK_ID" pending "github_pr_create_update:task/$TASK_ID" "verifier" "merge readiness pending" >/dev/null

mkdir -p queue
cat > queue/human-approvals.json <<JSON
{
  "version": "0.1.0",
  "requests": [
    {
      "approvalId": "$APPROVAL_ID",
      "taskId": "$TASK_ID",
      "status": "pending",
      "role": "development",
      "tool": "github",
      "operation": "pull_requests:write",
      "target": "https://api.github.com/repos/example/repo/pulls",
      "command": "{\\"taskId\\":\\"$TASK_ID\\",\\"head\\":\\"task/$TASK_ID\\",\\"base\\":\\"main\\"}",
      "reason": "critical operation requires human gate",
      "requestedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
JSON

HUMAN_GATE_ACTOR=verifier scripts/human/approve_approval.sh "$APPROVAL_ID" "merge readiness smoke approval" >/tmp/merge-readiness-approve.out
grep -q "APPROVAL_RESOLVED approval=$APPROVAL_ID task=$TASK_ID decision=approved" /tmp/merge-readiness-approve.out

set +e
node scripts/github/merge_readiness.mjs "$APPROVAL_ID" "task/$TASK_ID" "main" >/tmp/merge-readiness.out 2>/tmp/merge-readiness.err
rc=$?
set -e
if [ "$rc" -ne 2 ]; then
  echo "VERIFY_MERGE_READINESS_FAILED unexpected_rc=$rc"
  cat /tmp/merge-readiness.err
  cat /tmp/merge-readiness.out
  exit 1
fi

grep -q "MERGE_READINESS_BLOCKED" /tmp/merge-readiness.out
grep -Eq "pr_missing|ci_missing" /tmp/merge-readiness.out
grep -q "github_merge_readiness" "states/state_$TASK_ID.md"
grep -q "MERGE_READINESS_BLOCKED" "states/state_$TASK_ID.md"
grep -q "Current Stage: human_approved" "states/state_$TASK_ID.md"
grep -q "approval_status=approved" "states/state_$TASK_ID.md"
grep -q "github_merge_readiness" logs/human-gate.log

rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md" queue/human-approvals.json
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_MERGE_READINESS_OK"
