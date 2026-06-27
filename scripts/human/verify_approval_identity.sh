#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="approval-identity-smoke"
TMP_DIR="$(mktemp -d)"
SERVER_OUT="$TMP_DIR/server.out"
APPROVALS_BACKUP="$TMP_DIR/human-approvals.backup.json"
HAD_APPROVALS=0
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -f "states/state_${TASK_ID}.md" "memory/tasks/${TASK_ID}.md"
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

rm -f "states/state_${TASK_ID}.md" "memory/tasks/${TASK_ID}.md"
mkdir -p queue

node scripts/state/create_state.mjs "$TASK_ID" "Approval identity smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Human Gate UI must support production identity proxy headers with role mapping." \
  --acceptance="Trusted identity viewer can read but not approve; trusted identity approver can approve and writes actor evidence." >/dev/null
node scripts/human/record_gate.mjs "$TASK_ID" pending "approval_identity" "verifier" "approval identity pending" >/dev/null

cat > queue/human-approvals.json <<JSON
{
  "version": "0.1.0",
  "requests": [
    {
      "approvalId": "approval-identity-1",
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

cat > "$TMP_DIR/identity.json" <<'JSON'
{
  "version": "0.1.0",
  "mode": "trusted-header",
  "sharedSecretEnv": "VERIFY_IDENTITY_SECRET",
  "secretHeader": "x-agent-loop-identity-secret",
  "userHeader": "x-auth-request-user",
  "emailHeader": "x-auth-request-email",
  "groupsHeader": "x-auth-request-groups",
  "groupSeparator": ",",
  "defaultRole": "viewer",
  "roleMappings": [
    { "role": "approver", "groups": ["agent-loop-approvers"] },
    { "role": "viewer", "groups": ["agent-loop-viewers"] }
  ]
}
JSON

VERIFY_IDENTITY_SECRET=identity-secret node scripts/human/approval_server.mjs --host=127.0.0.1 --port=0 --identity="$TMP_DIR/identity.json" --token=legacy-token >"$SERVER_OUT" 2>&1 &
SERVER_PID="$!"

for _ in $(seq 1 80); do
  if grep -q "HUMAN_GATE_UI_READY" "$SERVER_OUT"; then
    break
  fi
  sleep 0.1
done
grep -q "identity=trusted-header" "$SERVER_OUT"
URL="$(sed -n 's/^HUMAN_GATE_UI_READY url=\([^ ]*\) token=.*/\1/p' "$SERVER_OUT" | tail -n 1)"

node - "$URL/api/approvals" GET viewer >/tmp/approval-identity-viewer-api.out <<'NODE'
const http = require("http");
const [url, method, persona] = process.argv.slice(2);
const groups = persona === "approver" ? "agent-loop-approvers" : "agent-loop-viewers";
const req = http.request(url, {
  method,
  headers: {
    "x-agent-loop-identity-secret": "identity-secret",
    "x-auth-request-user": `idp-${persona}`,
    "x-auth-request-email": `${persona}@example.com`,
    "x-auth-request-groups": groups
  }
}, (res) => {
  let body = "";
  res.on("data", (chunk) => body += chunk);
  res.on("end", () => {
    process.stdout.write(body);
    if (res.statusCode !== 200) process.exit(2);
  });
});
req.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
req.end();
NODE
grep -q '"id": "idp-viewer"' /tmp/approval-identity-viewer-api.out
grep -q '"role": "viewer"' /tmp/approval-identity-viewer-api.out

node - "$URL/approve" "approval-identity-1" "viewer must not approve" viewer 403 <<'NODE'
const http = require("http");
const [url, approvalId, reason, persona, expectedStatus] = process.argv.slice(2);
const groups = persona === "approver" ? "agent-loop-approvers" : "agent-loop-viewers";
const body = new URLSearchParams({ approvalId, reason }).toString();
const req = http.request(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Content-Length": Buffer.byteLength(body),
    "x-agent-loop-identity-secret": "identity-secret",
    "x-auth-request-user": `idp-${persona}`,
    "x-auth-request-email": `${persona}@example.com`,
    "x-auth-request-groups": groups
  }
}, (res) => {
  res.resume();
  res.on("end", () => {
    if (res.statusCode !== Number(expectedStatus)) process.exit(2);
  });
});
req.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
req.end(body);
NODE
grep -A5 '"approvalId": "approval-identity-1"' queue/human-approvals.json | grep -q '"status": "pending"'

node - "$URL/approve" "approval-identity-1" "approved from identity smoke" approver 303 <<'NODE'
const http = require("http");
const [url, approvalId, reason, persona, expectedStatus] = process.argv.slice(2);
const groups = persona === "approver" ? "agent-loop-approvers" : "agent-loop-viewers";
const body = new URLSearchParams({ approvalId, reason }).toString();
const req = http.request(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Content-Length": Buffer.byteLength(body),
    "x-agent-loop-identity-secret": "identity-secret",
    "x-auth-request-user": `idp-${persona}`,
    "x-auth-request-email": `${persona}@example.com`,
    "x-auth-request-groups": groups
  }
}, (res) => {
  res.resume();
  res.on("end", () => {
    if (res.statusCode !== Number(expectedStatus)) process.exit(2);
  });
});
req.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
req.end(body);
NODE

grep -q '"approvalId": "approval-identity-1"' queue/human-approvals.json
grep -q '"status": "approved"' queue/human-approvals.json
grep -q '"decidedBy": "idp-approver"' queue/human-approvals.json
grep -q "approval_ui_decision approval_id=approval-identity-1 decision=approved actor=\"idp-approver\"" logs/human-gate.log
grep -q "Current Stage: human_approved" "states/state_${TASK_ID}.md"

echo "VERIFY_APPROVAL_IDENTITY_OK"
