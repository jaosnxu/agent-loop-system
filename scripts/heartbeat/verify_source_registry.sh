#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TMP_DIR="$(mktemp -d)"
QUEUE_FILE="queue/queue.json"
PROCESSED_FILE="queue/processed-events.json"
HAD_QUEUE=0
HAD_PROCESSED=0

cleanup() {
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

cat > "$TMP_DIR/events.json" <<'JSON'
{
  "events": [
    {
      "id": "ci-1001",
      "kind": "ci",
      "taskId": "connector-ci-smoke",
      "title": "CI failure: production smoke blocked",
      "priority": "P0",
      "type": "development",
      "labels": ["agent-loop", "ci"],
      "requirement": "CI source must create a development task with preserved requirements.",
      "acceptance": "The queued CI task includes source, dedupe, requirement, and acceptance."
    },
    {
      "id": "docs-2001",
      "kind": "docs",
      "taskId": "connector-docs-smoke",
      "title": "Docs review: operator runbook update",
      "priority": "P2",
      "type": "documentation",
      "labels": ["agent-loop", "docs"],
      "requirement": "Docs source must create a documentation task.",
      "acceptance": "The queued docs task keeps the docs acceptance criteria."
    },
    {
      "id": "browser-3001",
      "kind": "browser",
      "taskId": "connector-browser-smoke",
      "title": "Browser test: prototype regression signal",
      "priority": "P1",
      "type": "prototype",
      "labels": ["agent-loop", "browser"],
      "requirement": "Browser source must create a prototype testing task.",
      "acceptance": "The queued browser task requires an interaction report before approval."
    }
  ]
}
JSON

cat > "$TMP_DIR/heartbeat.sources.json" <<JSON
{
  "version": "0.1.0",
  "sources": [
    {
      "id": "ci-source",
      "type": "fixture",
      "enabled": true,
      "fixtureFile": "$TMP_DIR/events.json",
      "filters": { "labels": ["ci"] }
    },
    {
      "id": "docs-source",
      "type": "fixture",
      "enabled": true,
      "fixtureFile": "$TMP_DIR/events.json",
      "filters": { "labels": ["docs"] }
    },
    {
      "id": "browser-source",
      "type": "fixture",
      "enabled": true,
      "fixtureFile": "$TMP_DIR/events.json",
      "filters": { "labels": ["browser"] }
    }
  ]
}
JSON

HEARTBEAT_SOURCES_CONFIG="$TMP_DIR/heartbeat.sources.json" node - <<'NODE' >/tmp/heartbeat-source-registry-first.out
import { pollHeartbeatSources } from "./scripts/heartbeat/source_registry.mjs";
const result = await pollHeartbeatSources();
console.log(JSON.stringify(result, null, 2));
NODE

grep -q '"sourceId": "ci-source"' /tmp/heartbeat-source-registry-first.out
grep -q '"sourceId": "docs-source"' /tmp/heartbeat-source-registry-first.out
grep -q '"sourceId": "browser-source"' /tmp/heartbeat-source-registry-first.out
grep -q '"taskId": "connector-ci-smoke"' /tmp/heartbeat-source-registry-first.out
grep -q '"taskId": "connector-docs-smoke"' /tmp/heartbeat-source-registry-first.out
grep -q '"taskId": "connector-browser-smoke"' /tmp/heartbeat-source-registry-first.out

node - <<'NODE'
const fs = require("fs");
const queue = JSON.parse(fs.readFileSync("queue/queue.json", "utf8"));
const processed = JSON.parse(fs.readFileSync("queue/processed-events.json", "utf8"));
const byId = Object.fromEntries(queue.tasks.map((task) => [task.taskId, task]));
const required = ["connector-ci-smoke", "connector-docs-smoke", "connector-browser-smoke"];
for (const taskId of required) {
  if (!byId[taskId]) throw new Error(`missing queued task ${taskId}`);
  if (!byId[taskId].requirement) throw new Error(`missing requirement ${taskId}`);
  if (!byId[taskId].acceptance) throw new Error(`missing acceptance ${taskId}`);
  if (!byId[taskId].source.startsWith("heartbeat:")) throw new Error(`missing heartbeat source ${taskId}`);
}
if (queue.tasks.length !== 3) throw new Error(`expected 3 queued tasks, got ${queue.tasks.length}`);
if (processed.events.length !== 3) throw new Error(`expected 3 processed events, got ${processed.events.length}`);
NODE

HEARTBEAT_SOURCES_CONFIG="$TMP_DIR/heartbeat.sources.json" node - <<'NODE' >/tmp/heartbeat-source-registry-second.out
import { pollHeartbeatSources } from "./scripts/heartbeat/source_registry.mjs";
const result = await pollHeartbeatSources();
console.log(JSON.stringify(result, null, 2));
NODE

grep -q '^\[\]$' /tmp/heartbeat-source-registry-second.out
node - <<'NODE'
const fs = require("fs");
const queue = JSON.parse(fs.readFileSync("queue/queue.json", "utf8"));
const processed = JSON.parse(fs.readFileSync("queue/processed-events.json", "utf8"));
if (queue.tasks.length !== 3) throw new Error(`dedupe failed; expected 3 queued tasks, got ${queue.tasks.length}`);
if (processed.events.length !== 3) throw new Error(`dedupe failed; expected 3 processed events, got ${processed.events.length}`);
NODE

grep -q "heartbeat_source_polled source=ci-source" logs/heartbeat.log
grep -q "heartbeat_source_polled source=docs-source" logs/heartbeat.log
grep -q "heartbeat_source_polled source=browser-source" logs/heartbeat.log

echo "VERIFY_HEARTBEAT_SOURCE_REGISTRY_OK"
