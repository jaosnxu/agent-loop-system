#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="heartbeat-metrics-smoke"
TMP_DIR="$(mktemp -d)"
METRICS_FILE="logs/heartbeat-metrics.jsonl"
APPROVALS_FILE="queue/human-approvals.json"
HAD_METRICS=0
HAD_APPROVALS=0

cleanup() {
  rm -f "states/state_${TASK_ID}.md" "memory/tasks/${TASK_ID}.md"
  if [ "$HAD_METRICS" -eq 1 ]; then
    cp "$TMP_DIR/heartbeat-metrics.backup.jsonl" "$METRICS_FILE"
  else
    rm -f "$METRICS_FILE"
  fi
  if [ "$HAD_APPROVALS" -eq 1 ]; then
    cp "$TMP_DIR/human-approvals.backup.json" "$APPROVALS_FILE"
  else
    rm -f "$APPROVALS_FILE"
  fi
  rm -rf "$TMP_DIR"
  node scripts/state/sync_board.mjs >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p logs queue
if [ -f "$METRICS_FILE" ]; then
  HAD_METRICS=1
  cp "$METRICS_FILE" "$TMP_DIR/heartbeat-metrics.backup.jsonl"
fi
if [ -f "$APPROVALS_FILE" ]; then
  HAD_APPROVALS=1
  cp "$APPROVALS_FILE" "$TMP_DIR/human-approvals.backup.json"
fi

rm -f "$METRICS_FILE" "states/state_${TASK_ID}.md" "memory/tasks/${TASK_ID}.md"

node scripts/state/create_state.mjs "$TASK_ID" "Heartbeat metrics smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Heartbeat must persist long-term metrics and report trends." \
  --acceptance="Status summary and heartbeat tick append JSONL metrics; trend report summarizes them." >/dev/null
node scripts/human/record_gate.mjs "$TASK_ID" pending "heartbeat_metrics" "verifier" "metrics smoke pending human" >/dev/null

cat > "$APPROVALS_FILE" <<JSON
{
  "version": "0.1.0",
  "requests": [
    {
      "approvalId": "heartbeat-metrics-approval-1",
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

node scripts/heartbeat/status_summary.mjs >/tmp/heartbeat-metrics-status.out
grep -q "HEARTBEAT_STATUS" /tmp/heartbeat-metrics-status.out
grep -q '"eventType":"status_summary"' "$METRICS_FILE"

node scripts/heartbeat/heartbeat_once.mjs >/tmp/heartbeat-metrics-once.out
grep -q "HEARTBEAT_NO_TASKS\\|HEARTBEAT_DISPATCHED" /tmp/heartbeat-metrics-once.out
grep -q '"eventType":"heartbeat_tick"' "$METRICS_FILE"

node scripts/heartbeat/trend_report.mjs --last=20 >/tmp/heartbeat-metrics-trend.out
grep -q "HEARTBEAT_TREND" /tmp/heartbeat-metrics-trend.out
grep -q '"status_summary": 1' /tmp/heartbeat-metrics-trend.out
grep -q '"heartbeat_tick": 1' /tmp/heartbeat-metrics-trend.out
grep -q '"statusSummaries": 1' /tmp/heartbeat-metrics-trend.out
grep -q '"heartbeatTicks": 1' /tmp/heartbeat-metrics-trend.out
grep -q '"maxWaitingHuman": 1' /tmp/heartbeat-metrics-trend.out

echo "VERIFY_HEARTBEAT_METRICS_OK"
