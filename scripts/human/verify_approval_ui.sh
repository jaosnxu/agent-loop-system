#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

APPROVE_TASK="approval-ui-approve-smoke"
REJECT_TASK="approval-ui-reject-smoke"
TMP_DIR="$(mktemp -d)"
SERVER_OUT="$TMP_DIR/server.out"
APPROVALS_BACKUP="$TMP_DIR/human-approvals.backup.json"
HAD_APPROVALS=0
SERVER_PID=""

cleanup_task() {
  local task_id="$1"
  rm -f "states/state_${task_id}.md" "memory/tasks/${task_id}.md"
  scripts/worktree/clean_worktree.sh "$task_id" >/dev/null 2>&1 || true
}

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  cleanup_task "$APPROVE_TASK"
  cleanup_task "$REJECT_TASK"
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

cleanup_task "$APPROVE_TASK"
cleanup_task "$REJECT_TASK"
mkdir -p queue

node scripts/state/create_state.mjs "$APPROVE_TASK" "Approval UI approve smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Human Gate UI must approve pending approval requests." \
  --acceptance="Posting approve through the UI updates queue status, task state, and audit log." >/dev/null
node scripts/human/record_gate.mjs "$APPROVE_TASK" pending "approval_ui_approve" "verifier" "approval UI approve pending" >/dev/null

node scripts/state/create_state.mjs "$REJECT_TASK" "Approval UI reject smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Human Gate UI must reject pending approval requests." \
  --acceptance="Posting reject through the UI updates queue status, terminates task state, and audit log." >/dev/null
scripts/worktree/create_worktree.sh "$REJECT_TASK" >/dev/null
node scripts/human/record_gate.mjs "$REJECT_TASK" pending "approval_ui_reject" "verifier" "approval UI reject pending" >/dev/null

cat > queue/human-approvals.json <<JSON
{
  "version": "0.1.0",
  "requests": [
    {
      "approvalId": "approval-ui-approve-1",
      "taskId": "$APPROVE_TASK",
      "status": "pending",
      "role": "development",
      "tool": "github",
      "operation": "pull_requests:write",
      "target": "https://api.github.com/repos/example/repo/pulls",
      "command": "{\\"taskId\\":\\"$APPROVE_TASK\\"}",
      "reason": "critical operation requires human gate",
      "requestedAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "approvalId": "approval-ui-reject-1",
      "taskId": "$REJECT_TASK",
      "status": "pending",
      "role": "development",
      "tool": "filesystem",
      "operation": "delete",
      "target": "../worktrees/$REJECT_TASK/file.txt",
      "command": "../worktrees/$REJECT_TASK/file.txt",
      "reason": "critical operation requires human gate",
      "requestedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
JSON

node scripts/human/approval_server.mjs --host=127.0.0.1 --port=0 --token=verify-token >"$SERVER_OUT" 2>&1 &
SERVER_PID="$!"

for _ in $(seq 1 80); do
  if grep -q "HUMAN_GATE_UI_READY" "$SERVER_OUT"; then
    break
  fi
  sleep 0.1
done
grep -q "HUMAN_GATE_UI_READY" "$SERVER_OUT"
URL="$(sed -n 's/^HUMAN_GATE_UI_READY url=\([^ ]*\) token=.*/\1/p' "$SERVER_OUT" | tail -n 1)"

node - "$URL" <<'NODE' >/tmp/approval-ui-page.out
const http = require("http");
const url = process.argv[2];
http.get(url, (res) => {
  let body = "";
  res.on("data", (chunk) => body += chunk);
  res.on("end", () => {
    process.stdout.write(body);
    if (res.statusCode !== 200) process.exit(2);
  });
}).on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
grep -q "Human Gate Approval Queue" /tmp/approval-ui-page.out
grep -q "approval-ui-approve-1" /tmp/approval-ui-page.out
grep -q "approval-ui-reject-1" /tmp/approval-ui-page.out

node - "$URL/api/approvals" <<'NODE' >/tmp/approval-ui-api.out
const http = require("http");
const url = process.argv[2];
http.get(url, (res) => {
  let body = "";
  res.on("data", (chunk) => body += chunk);
  res.on("end", () => {
    process.stdout.write(body);
    if (res.statusCode !== 200) process.exit(2);
  });
}).on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
grep -q '"pending": 2' /tmp/approval-ui-api.out

node - "$URL/approve" "approval-ui-approve-1" "approved from UI smoke" <<'NODE'
const http = require("http");
const endpoint = new URL(process.argv[2]);
const approvalId = process.argv[3];
const reason = process.argv[4];
const body = new URLSearchParams({ token: "verify-token", approvalId, actor: "ui-verifier", reason }).toString();
const req = http.request(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Content-Length": Buffer.byteLength(body)
  }
}, (res) => {
  res.resume();
  res.on("end", () => {
    if (res.statusCode !== 303) process.exit(2);
  });
});
req.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
req.end(body);
NODE

node - "$URL/reject" "approval-ui-reject-1" "rejected from UI smoke" <<'NODE'
const http = require("http");
const endpoint = new URL(process.argv[2]);
const approvalId = process.argv[3];
const reason = process.argv[4];
const body = new URLSearchParams({ token: "verify-token", approvalId, actor: "ui-verifier", reason }).toString();
const req = http.request(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Content-Length": Buffer.byteLength(body)
  }
}, (res) => {
  res.resume();
  res.on("end", () => {
    if (res.statusCode !== 303) process.exit(2);
  });
});
req.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
req.end(body);
NODE

grep -q '"approvalId": "approval-ui-approve-1"' queue/human-approvals.json
grep -q '"status": "approved"' queue/human-approvals.json
grep -q '"approvalId": "approval-ui-reject-1"' queue/human-approvals.json
grep -q '"status": "rejected"' queue/human-approvals.json
grep -q "Current Stage: human_approved" "states/state_$APPROVE_TASK.md"
grep -q "Human Gate: approved" "states/state_$APPROVE_TASK.md"
grep -q "Current Stage: terminated" "states/state_$REJECT_TASK.md"
grep -q "Human Gate: rejected" "states/state_$REJECT_TASK.md"
test ! -d "../worktrees/$REJECT_TASK"
grep -q "approval_ui_decision approval_id=approval-ui-approve-1 decision=approved" logs/human-gate.log
grep -q "approval_ui_decision approval_id=approval-ui-reject-1 decision=rejected" logs/human-gate.log

echo "VERIFY_APPROVAL_UI_OK"
