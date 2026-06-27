#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="github-pr-continuation-smoke"
APPROVAL_ID="approval-pr-continuation-1"
rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md" queue/human-approvals.json

node scripts/state/create_state.mjs "$TASK_ID" "GitHub PR continuation smoke" \
  --priority=P1 \
  --type=development \
  --requirement="GitHub continuation must support dry-run and require a second human gate for live mode." \
  --acceptance="Create dry-run records planned write; live mode creates pending second approval; merge blocks without PR/CI." >/dev/null
node scripts/human/record_gate.mjs "$TASK_ID" pending "github_pr_create_update:task/$TASK_ID" "verifier" "continuation pending" >/dev/null

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
      "command": "{\\"taskId\\":\\"$TASK_ID\\",\\"title\\":\\"Smoke continuation\\",\\"head\\":\\"task/$TASK_ID\\",\\"base\\":\\"main\\",\\"body\\":\\"Smoke continuation body\\"}",
      "reason": "critical operation requires human gate",
      "requestedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
JSON

HUMAN_GATE_ACTOR=verifier scripts/human/approve_approval.sh "$APPROVAL_ID" "continuation smoke approval" >/tmp/pr-continuation-approve.out
grep -q "APPROVAL_RESOLVED approval=$APPROVAL_ID task=$TASK_ID decision=approved" /tmp/pr-continuation-approve.out

node scripts/github/continue_pr_operation.mjs "$APPROVAL_ID" create --mode=dry-run >/tmp/pr-continuation-dry-run.out
grep -q "GITHUB_CONTINUATION_DRY_RUN" /tmp/pr-continuation-dry-run.out
grep -q "action=create" /tmp/pr-continuation-dry-run.out
grep -q "Current Stage: github_continuation_dry_run_ready" "states/state_$TASK_ID.md"
grep -q "github_pr_continuation" "states/state_$TASK_ID.md"

set +e
node scripts/github/continue_pr_operation.mjs "$APPROVAL_ID" create --mode=live >/tmp/pr-continuation-live-pending.out 2>/tmp/pr-continuation-live-pending.err
rc=$?
set -e
if [ "$rc" -ne 90 ]; then
  echo "VERIFY_PR_CONTINUATION_FAILED live_pending_rc=$rc"
  cat /tmp/pr-continuation-live-pending.err
  cat /tmp/pr-continuation-live-pending.out
  exit 1
fi
grep -q "PENDING_LIVE_HUMAN" /tmp/pr-continuation-live-pending.out
grep -q '"operation": "pull_requests:create:live"' queue/human-approvals.json
grep -q '"status": "pending"' queue/human-approvals.json
grep -q "Current Stage: pending_human" "states/state_$TASK_ID.md"

set +e
node scripts/github/continue_pr_operation.mjs "$APPROVAL_ID" merge --mode=dry-run >/tmp/pr-continuation-merge.out 2>/tmp/pr-continuation-merge.err
rc=$?
set -e
if [ "$rc" -ne 2 ]; then
  echo "VERIFY_PR_CONTINUATION_FAILED merge_block_rc=$rc"
  cat /tmp/pr-continuation-merge.err
  cat /tmp/pr-continuation-merge.out
  exit 1
fi
grep -q "GITHUB_CONTINUATION_BLOCKED" /tmp/pr-continuation-merge.out
grep -Eq "pr_missing|ci_missing" /tmp/pr-continuation-merge.out
grep -q "GITHUB_CONTINUATION_BLOCKED" "states/state_$TASK_ID.md"

rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md" queue/human-approvals.json
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_PR_CONTINUATION_OK"
