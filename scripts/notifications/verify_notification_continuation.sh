#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="notification-continuation-smoke"
TMP_DIR="$(mktemp -d)"
APPROVALS_BACKUP="$TMP_DIR/human-approvals.backup.json"
HAD_APPROVALS=0
WEBHOOK_PID=""

cleanup() {
  if [ -n "$WEBHOOK_PID" ]; then
    kill "$WEBHOOK_PID" >/dev/null 2>&1 || true
    wait "$WEBHOOK_PID" >/dev/null 2>&1 || true
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

rm -f "states/state_${TASK_ID}.md" "memory/tasks/${TASK_ID}.md" queue/human-approvals.json
mkdir -p queue

cat > "$TMP_DIR/webhook_server.mjs" <<'NODE'
import fs from "node:fs";
import http from "node:http";

const capturePath = process.argv[2];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => body += chunk);
  req.on("end", () => {
    fs.writeFileSync(capturePath, JSON.stringify({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body
    }, null, 2));
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  console.log(`WEBHOOK_READY http://127.0.0.1:${address.port}/notify`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
NODE

node "$TMP_DIR/webhook_server.mjs" "$TMP_DIR/webhook-capture.json" >"$TMP_DIR/webhook.out" 2>&1 &
WEBHOOK_PID="$!"
for _ in $(seq 1 80); do
  if grep -q "WEBHOOK_READY" "$TMP_DIR/webhook.out"; then
    break
  fi
  sleep 0.1
done
grep -q "WEBHOOK_READY" "$TMP_DIR/webhook.out"
WEBHOOK_URL="$(sed -n 's/^WEBHOOK_READY //p' "$TMP_DIR/webhook.out" | tail -n 1)"

node scripts/state/create_state.mjs "$TASK_ID" "Notification continuation smoke" \
  --priority=P1 \
  --type=development \
  --requirement="External notification continuation must support dry-run, second human gate, and live webhook send." \
  --acceptance="Dry-run does not send; live mode requires second approval and posts the expected payload to the webhook." >/dev/null

PAYLOAD="$(node -e 'process.stdout.write(JSON.stringify({taskId: process.argv[1], channel: "ops-alerts", title: "Loop notification smoke", message: "Smoke notification body", webhookUrl: process.argv[2]}))' "$TASK_ID" "$WEBHOOK_URL")"
node scripts/mcp/mcp_tool.mjs development github notifications:send "$PAYLOAD" "$PAYLOAD" >/tmp/notification-mcp-gate.out || true
grep -q "HUMAN_GATE_REQUIRED" /tmp/notification-mcp-gate.out

APPROVAL_ID="$(node -e 'const fs=require("fs"); const q=JSON.parse(fs.readFileSync("queue/human-approvals.json","utf8")); const r=q.requests.find((item)=>item.tool==="github" && item.operation==="notifications:send" && item.taskId===process.argv[1]); if (!r) process.exit(2); process.stdout.write(r.approvalId);' "$TASK_ID")"
HUMAN_GATE_ACTOR=verifier scripts/human/approve_approval.sh "$APPROVAL_ID" "approve notification primary smoke" >/tmp/notification-primary-approval.out
grep -q "APPROVAL_RESOLVED approval=$APPROVAL_ID task=$TASK_ID decision=approved" /tmp/notification-primary-approval.out

node scripts/notifications/continue_notification.mjs "$APPROVAL_ID" --mode=dry-run >/tmp/notification-dry-run.out
grep -q "NOTIFICATION_DRY_RUN" /tmp/notification-dry-run.out
grep -q "Current Stage: notification_dry_run_ready" "states/state_$TASK_ID.md"
grep -q "notification_continuation" "states/state_$TASK_ID.md"
test ! -f "$TMP_DIR/webhook-capture.json"

set +e
node scripts/notifications/continue_notification.mjs "$APPROVAL_ID" --mode=live >/tmp/notification-live-pending.out
LIVE_PENDING_STATUS=$?
set -e
test "$LIVE_PENDING_STATUS" -eq 90
grep -q "PENDING_LIVE_HUMAN" /tmp/notification-live-pending.out
grep -q '"operation": "notifications:send:live"' queue/human-approvals.json
grep -q "Current Stage: pending_human" "states/state_$TASK_ID.md"

LIVE_APPROVAL_ID="$(node -e 'const fs=require("fs"); const q=JSON.parse(fs.readFileSync("queue/human-approvals.json","utf8")); const r=q.requests.find((item)=>item.operation==="notifications:send:live" && item.taskId===process.argv[1]); if (!r) process.exit(2); process.stdout.write(r.approvalId);' "$TASK_ID")"
HUMAN_GATE_ACTOR=verifier scripts/human/approve_approval.sh "$LIVE_APPROVAL_ID" "approve notification live smoke" >/tmp/notification-live-approval.out
node scripts/notifications/continue_notification.mjs "$APPROVAL_ID" --mode=live --live-approval-id="$LIVE_APPROVAL_ID" --confirm-live >/tmp/notification-live-done.out
grep -q "NOTIFICATION_LIVE_DONE" /tmp/notification-live-done.out
grep -q "Current Stage: notification_sent" "states/state_$TASK_ID.md"
grep -q "notification_continuation_live" logs/human-gate.log
grep -q "operation=notifications:send:live" logs/tool-calls.log
test -f "$TMP_DIR/webhook-capture.json"

node - "$TMP_DIR/webhook-capture.json" "$TASK_ID" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const taskId = process.argv[3];
const capture = JSON.parse(fs.readFileSync(file, "utf8"));
if (capture.method !== "POST") throw new Error(`expected POST, got ${capture.method}`);
const payload = JSON.parse(capture.body);
if (payload.taskId !== taskId) throw new Error(`task mismatch ${payload.taskId}`);
if (payload.channel !== "ops-alerts") throw new Error(`channel mismatch ${payload.channel}`);
if (payload.message !== "Smoke notification body") throw new Error("message mismatch");
NODE

echo "VERIFY_NOTIFICATION_CONTINUATION_OK"
