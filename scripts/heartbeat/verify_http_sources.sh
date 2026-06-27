#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TMP_DIR="$(mktemp -d)"
QUEUE_FILE="queue/queue.json"
PROCESSED_FILE="queue/processed-events.json"
HAD_QUEUE=0
HAD_PROCESSED=0
API_PID=""

cleanup() {
  if [ -n "$API_PID" ]; then
    kill "$API_PID" >/dev/null 2>&1 || true
    wait "$API_PID" >/dev/null 2>&1 || true
  fi
  if [ "$HAD_QUEUE" -eq 1 ]; then
    cp "$TMP_DIR/queue.backup.json" "$QUEUE_FILE"
  else
    rm -f "$QUEUE_FILE"
  fi
  if [ "$HAD_PROCESSED" -eq 1 ]; then
    cp "$TMP_DIR/processed.backup.json" "$PROCESSED_FILE"
  else
    rm -f "$PROCESSED_FILE"
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p queue
if [ -f "$QUEUE_FILE" ]; then
  HAD_QUEUE=1
  cp "$QUEUE_FILE" "$TMP_DIR/queue.backup.json"
fi
if [ -f "$PROCESSED_FILE" ]; then
  HAD_PROCESSED=1
  cp "$PROCESSED_FILE" "$TMP_DIR/processed.backup.json"
fi

cat > "$QUEUE_FILE" <<'JSON'
{
  "version": "0.1.0",
  "tasks": []
}
JSON
cat > "$PROCESSED_FILE" <<'JSON'
{
  "version": "0.1.0",
  "events": []
}
JSON

cat > "$TMP_DIR/api_server.mjs" <<'NODE'
import http from "node:http";

const events = {
  "/ci": {
    events: [{
      id: "ci-live-1001",
      kind: "ci",
      taskId: "http-ci-smoke",
      title: "HTTP CI failure event",
      priority: "P0",
      type: "development",
      labels: ["agent-loop", "ci"],
      requirement: "HTTP CI source must create a development task from a live API response.",
      acceptance: "The queued CI task keeps requirement, acceptance, source, and dedupe evidence."
    }]
  },
  "/docs": {
    data: {
      events: [{
        id: "docs-live-2001",
        kind: "docs",
        taskId: "http-docs-smoke",
        title: "HTTP docs review event",
        priority: "P2",
        type: "documentation",
        labels: ["agent-loop", "docs"],
        requirement: "HTTP docs source must create a documentation task from nested response data.",
        acceptance: "The queued docs task preserves nested event data and acceptance."
      }]
    }
  },
  "/browser": {
    events: [{
      id: "browser-live-3001",
      kind: "browser",
      taskId: "http-browser-smoke",
      title: "HTTP browser regression event",
      priority: "P1",
      type: "prototype",
      labels: ["agent-loop", "browser"],
      requirement: "HTTP browser source must create a prototype testing task from an API event.",
      acceptance: "The queued browser task requires browser testing evidence before approval."
    }]
  }
};

const server = http.createServer((req, res) => {
  const payload = events[req.url] || { events: [] };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  console.log(`HTTP_SOURCES_READY http://127.0.0.1:${address.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
NODE

node "$TMP_DIR/api_server.mjs" >"$TMP_DIR/api.out" 2>&1 &
API_PID="$!"
for _ in $(seq 1 80); do
  if grep -q "HTTP_SOURCES_READY" "$TMP_DIR/api.out"; then
    break
  fi
  sleep 0.1
done
grep -q "HTTP_SOURCES_READY" "$TMP_DIR/api.out"
BASE_URL="$(sed -n 's/^HTTP_SOURCES_READY //p' "$TMP_DIR/api.out" | tail -n 1)"

cat > "$TMP_DIR/heartbeat.sources.json" <<JSON
{
  "version": "0.1.0",
  "sources": [
    {
      "id": "ci-http",
      "type": "http-json",
      "enabled": true,
      "url": "$BASE_URL/ci",
      "filters": { "labels": ["ci"] }
    },
    {
      "id": "docs-http",
      "type": "http-json",
      "enabled": true,
      "url": "$BASE_URL/docs",
      "eventsPath": "data.events",
      "filters": { "labels": ["docs"] }
    },
    {
      "id": "browser-http",
      "type": "http-json",
      "enabled": true,
      "url": "$BASE_URL/browser",
      "filters": { "labels": ["browser"] }
    }
  ]
}
JSON

HEARTBEAT_SOURCES_CONFIG="$TMP_DIR/heartbeat.sources.json" node - <<'NODE' >/tmp/heartbeat-http-sources-first.out
import { pollHeartbeatSources } from "./scripts/heartbeat/source_registry.mjs";
const result = await pollHeartbeatSources();
console.log(JSON.stringify(result, null, 2));
NODE

grep -q '"sourceId": "ci-http"' /tmp/heartbeat-http-sources-first.out
grep -q '"sourceId": "docs-http"' /tmp/heartbeat-http-sources-first.out
grep -q '"sourceId": "browser-http"' /tmp/heartbeat-http-sources-first.out
grep -q '"type": "http-json"' /tmp/heartbeat-http-sources-first.out

node - <<'NODE'
const fs = require("fs");
const queue = JSON.parse(fs.readFileSync("queue/queue.json", "utf8"));
const processed = JSON.parse(fs.readFileSync("queue/processed-events.json", "utf8"));
const byId = Object.fromEntries(queue.tasks.map((task) => [task.taskId, task]));
for (const taskId of ["http-ci-smoke", "http-docs-smoke", "http-browser-smoke"]) {
  if (!byId[taskId]) throw new Error(`missing queued task ${taskId}`);
  if (!byId[taskId].requirement) throw new Error(`missing requirement ${taskId}`);
  if (!byId[taskId].acceptance) throw new Error(`missing acceptance ${taskId}`);
  if (!byId[taskId].source.startsWith("heartbeat:")) throw new Error(`missing source ${taskId}`);
}
if (queue.tasks.length !== 3) throw new Error(`expected 3 queued tasks, got ${queue.tasks.length}`);
if (processed.events.length !== 3) throw new Error(`expected 3 processed events, got ${processed.events.length}`);
NODE

HEARTBEAT_SOURCES_CONFIG="$TMP_DIR/heartbeat.sources.json" node - <<'NODE' >/tmp/heartbeat-http-sources-second.out
import { pollHeartbeatSources } from "./scripts/heartbeat/source_registry.mjs";
const result = await pollHeartbeatSources();
console.log(JSON.stringify(result, null, 2));
NODE

grep -q '^\[\]$' /tmp/heartbeat-http-sources-second.out
node - <<'NODE'
const fs = require("fs");
const queue = JSON.parse(fs.readFileSync("queue/queue.json", "utf8"));
const processed = JSON.parse(fs.readFileSync("queue/processed-events.json", "utf8"));
if (queue.tasks.length !== 3) throw new Error(`dedupe failed; expected 3 queued tasks, got ${queue.tasks.length}`);
if (processed.events.length !== 3) throw new Error(`dedupe failed; expected 3 processed events, got ${processed.events.length}`);
NODE

grep -q "heartbeat_source_polled source=ci-http type=http-json" logs/heartbeat.log
grep -q "heartbeat_source_polled source=docs-http type=http-json" logs/heartbeat.log
grep -q "heartbeat_source_polled source=browser-http type=http-json" logs/heartbeat.log

echo "VERIFY_HEARTBEAT_HTTP_SOURCES_OK"
