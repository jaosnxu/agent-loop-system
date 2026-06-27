#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="filesystem-delete-continuation-smoke"
DENIED_TASK_ID="filesystem-delete-denied-smoke"
TMP_DIR="$(mktemp -d)"
APPROVALS_BACKUP="$TMP_DIR/human-approvals.backup.json"
HAD_APPROVALS=0

cleanup_task() {
  local task_id="$1"
  rm -f "states/state_${task_id}.md" "memory/tasks/${task_id}.md"
  scripts/worktree/clean_worktree.sh "$task_id" >/dev/null 2>&1 || true
}

cleanup() {
  cleanup_task "$TASK_ID"
  cleanup_task "$DENIED_TASK_ID"
  if [ "$HAD_APPROVALS" -eq 1 ]; then
    cp "$APPROVALS_BACKUP" queue/human-approvals.json
  else
    rm -f queue/human-approvals.json
  fi
  rm -rf "$TMP_DIR"
  node scripts/state/sync_board.mjs >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ -f queue/human-approvals.json ]; then
  HAD_APPROVALS=1
  cp queue/human-approvals.json "$APPROVALS_BACKUP"
fi

cleanup_task "$TASK_ID"
cleanup_task "$DENIED_TASK_ID"
mkdir -p queue

node scripts/state/create_state.mjs "$TASK_ID" "Filesystem delete continuation smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Filesystem delete continuation must support dry-run and require a second human gate for live mode." \
  --acceptance="Dry-run does not delete, live mode requires a second approval, approved live mode deletes only inside the task worktree." >/dev/null
scripts/worktree/create_worktree.sh "$TASK_ID" >/dev/null

TARGET="../worktrees/$TASK_ID/delete-me.txt"
printf "delete smoke\n" > "$TARGET"

cat > queue/human-approvals.json <<JSON
{
  "version": "0.1.0",
  "requests": [
    {
      "approvalId": "approval-delete-continuation-1",
      "taskId": "$TASK_ID",
      "status": "pending",
      "role": "development",
      "tool": "filesystem",
      "operation": "delete",
      "target": "$TARGET",
      "command": "$TARGET",
      "reason": "critical operation requires human gate",
      "requestedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
JSON

HUMAN_GATE_ACTOR=verifier scripts/human/approve_approval.sh approval-delete-continuation-1 "approve primary delete smoke" >/tmp/filesystem-delete-primary-approval.out
grep -q "APPROVAL_RESOLVED approval=approval-delete-continuation-1 task=$TASK_ID decision=approved" /tmp/filesystem-delete-primary-approval.out

node scripts/mcp/continue_filesystem_delete.mjs approval-delete-continuation-1 --mode=dry-run >/tmp/filesystem-delete-dry-run.out
grep -q "FILESYSTEM_DELETE_DRY_RUN" /tmp/filesystem-delete-dry-run.out
grep -q "filesystem_delete_continuation" "states/state_$TASK_ID.md"
grep -q "Current Stage: filesystem_delete_dry_run_ready" "states/state_$TASK_ID.md"
test -f "$TARGET"

set +e
node scripts/mcp/continue_filesystem_delete.mjs approval-delete-continuation-1 --mode=live >/tmp/filesystem-delete-live-pending.out
LIVE_PENDING_STATUS=$?
set -e
test "$LIVE_PENDING_STATUS" -eq 90
grep -q "PENDING_LIVE_HUMAN" /tmp/filesystem-delete-live-pending.out
grep -q "operation\\\": \\\"delete:live\\\"" queue/human-approvals.json
grep -q "Current Stage: pending_human" "states/state_$TASK_ID.md"

LIVE_APPROVAL_ID="$(
  node -e 'const fs=require("fs"); const q=JSON.parse(fs.readFileSync("queue/human-approvals.json","utf8")); const r=q.requests.find((item)=>item.operation==="delete:live" && item.taskId===process.argv[1]); if (!r) process.exit(2); process.stdout.write(r.approvalId);' "$TASK_ID"
)"
HUMAN_GATE_ACTOR=verifier scripts/human/approve_approval.sh "$LIVE_APPROVAL_ID" "approve live delete smoke" >/tmp/filesystem-delete-live-approval.out
node scripts/mcp/continue_filesystem_delete.mjs approval-delete-continuation-1 --mode=live --live-approval-id="$LIVE_APPROVAL_ID" --confirm-live >/tmp/filesystem-delete-live-done.out
grep -q "FILESYSTEM_DELETE_LIVE_DONE" /tmp/filesystem-delete-live-done.out
grep -q "Current Stage: filesystem_delete_completed" "states/state_$TASK_ID.md"
grep -q "filesystem_delete_completed" "states/state_$TASK_ID.md"
test ! -e "$TARGET"

node scripts/state/create_state.mjs "$DENIED_TASK_ID" "Filesystem delete denied smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Filesystem delete continuation must deny targets outside the task worktree." \
  --acceptance="A target outside ../worktrees/TASK_ID is blocked and not deleted." >/dev/null
scripts/worktree/create_worktree.sh "$DENIED_TASK_ID" >/dev/null
DENIED_TARGET="$TMP_DIR/denied-delete.txt"
printf "must remain\n" > "$DENIED_TARGET"

cat > queue/human-approvals.json <<JSON
{
  "version": "0.1.0",
  "requests": [
    {
      "approvalId": "approval-delete-denied-1",
      "taskId": "$DENIED_TASK_ID",
      "status": "pending",
      "role": "development",
      "tool": "filesystem",
      "operation": "delete",
      "target": "$DENIED_TARGET",
      "command": "$DENIED_TARGET",
      "reason": "critical operation requires human gate",
      "requestedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
JSON

HUMAN_GATE_ACTOR=verifier scripts/human/approve_approval.sh approval-delete-denied-1 "approve denied delete smoke" >/tmp/filesystem-delete-denied-approval.out
set +e
node scripts/mcp/continue_filesystem_delete.mjs approval-delete-denied-1 --mode=dry-run >/tmp/filesystem-delete-denied.out
DENIED_STATUS=$?
set -e
test "$DENIED_STATUS" -eq 2
grep -q "FILESYSTEM_DELETE_CONTINUATION_BLOCKED" /tmp/filesystem-delete-denied.out
grep -Eq "target_outside_task_worktree|task_target_mismatch" /tmp/filesystem-delete-denied.out
test -f "$DENIED_TARGET"

grep -q "operation=delete:dry-run" logs/tool-calls.log
grep -q "operation=delete:live" logs/tool-calls.log
grep -q "filesystem_delete_live_approval_requested" logs/human-gate.log

echo "VERIFY_FILESYSTEM_DELETE_CONTINUATION_OK"
