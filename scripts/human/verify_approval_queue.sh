#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

cleanup_task() {
  local task_id="$1"
  rm -f "states/state_${task_id}.md" "memory/tasks/${task_id}.md"
  scripts/worktree/clean_worktree.sh "$task_id" >/dev/null 2>&1 || true
}

approve_task="approval-queue-approve-smoke"
reject_task="approval-queue-reject-smoke"
cleanup_task "$approve_task"
cleanup_task "$reject_task"
rm -f queue/human-approvals.json

node scripts/state/create_state.mjs "$approve_task" "Approval queue approve smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Approval queue must support approval by approval id." \
  --acceptance="Approving an approval request updates queue status, state gate, and stage." >/dev/null
node scripts/human/record_gate.mjs "$approve_task" pending "github_pr_create_update" "verifier" "approval queue approve pending" >/dev/null

mkdir -p queue
cat > queue/human-approvals.json <<JSON
{
  "version": "0.1.0",
  "requests": [
    {
      "approvalId": "approval-queue-approve-1",
      "taskId": "$approve_task",
      "status": "pending",
      "role": "development",
      "tool": "github",
      "operation": "pull_requests:write",
      "target": "https://api.github.com/repos/example/repo/pulls",
      "command": "{\\"taskId\\":\\"$approve_task\\"}",
      "reason": "critical operation requires human gate",
      "requestedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
JSON

HUMAN_GATE_ACTOR=verifier scripts/human/approve_approval.sh approval-queue-approve-1 "smoke approval" >/tmp/approval-queue-approve.out
grep -q "APPROVAL_RESOLVED approval=approval-queue-approve-1 task=$approve_task decision=approved" /tmp/approval-queue-approve.out
grep -q '"status": "approved"' queue/human-approvals.json
grep -q '"decidedBy": "verifier"' queue/human-approvals.json
grep -q "Current Stage: human_approved" "states/state_$approve_task.md"
grep -q "Human Gate: approved" "states/state_$approve_task.md"
grep -q "approval_request:approval-queue-approve-1:github:pull_requests:write" "states/state_$approve_task.md"
scripts/human/list_pending.sh >/tmp/approval-queue-list-approved.out
grep -q "PENDING_HUMAN_NONE" /tmp/approval-queue-list-approved.out

cleanup_task "$approve_task"
rm -f queue/human-approvals.json

node scripts/state/create_state.mjs "$reject_task" "Approval queue reject smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Approval queue must support rejection by approval id." \
  --acceptance="Rejecting an approval request updates queue status, terminates state, and cleans worktree." >/dev/null
scripts/worktree/create_worktree.sh "$reject_task" >/dev/null
node scripts/human/record_gate.mjs "$reject_task" pending "filesystem_delete" "verifier" "approval queue reject pending" >/dev/null

cat > queue/human-approvals.json <<JSON
{
  "version": "0.1.0",
  "requests": [
    {
      "approvalId": "approval-queue-reject-1",
      "taskId": "$reject_task",
      "status": "pending",
      "role": "development",
      "tool": "filesystem",
      "operation": "delete",
      "target": "../worktrees/$reject_task/file.txt",
      "command": "../worktrees/$reject_task/file.txt",
      "reason": "critical operation requires human gate",
      "requestedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
JSON

HUMAN_GATE_ACTOR=verifier scripts/human/reject_approval.sh approval-queue-reject-1 "smoke rejection" >/tmp/approval-queue-reject.out
grep -q "APPROVAL_RESOLVED approval=approval-queue-reject-1 task=$reject_task decision=rejected" /tmp/approval-queue-reject.out
grep -q '"status": "rejected"' queue/human-approvals.json
grep -q "Current Stage: terminated" "states/state_$reject_task.md"
grep -q "Human Gate: rejected" "states/state_$reject_task.md"
grep -q "approval approval-queue-reject-1 rejected" "states/state_$reject_task.md"
test ! -d "../worktrees/$reject_task"

cleanup_task "$reject_task"
rm -f queue/human-approvals.json
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_APPROVAL_QUEUE_OK"
