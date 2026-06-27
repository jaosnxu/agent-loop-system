#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="agent-result-schema-smoke"
rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
rm -f "logs/codex/$TASK_ID.triage.prompt.md" "logs/codex/$TASK_ID.triage.result.md" "logs/codex/$TASK_ID.triage.result.json"

node scripts/state/create_state.mjs "$TASK_ID" "Agent result schema smoke" \
  --priority=P2 \
  --type=example \
  --requirement="Agent result must be structured." \
  --acceptance="logs/codex contains result.json with schemaVersion, taskId, role, provider, status, decision, and rawResultPath." >/dev/null

AGENT_LOOP_CODEX_ENABLED=0 node scripts/agents/run_agent.mjs triage "$TASK_ID" >/tmp/agent-result-schema.out

RESULT_JSON="logs/codex/$TASK_ID.triage.result.json"
test -f "$RESULT_JSON"
node --input-type=module - "$RESULT_JSON" <<'NODE'
import fs from "node:fs";
const file = process.argv[2];
const result = JSON.parse(fs.readFileSync(file, "utf8"));
for (const field of ["schemaVersion", "taskId", "role", "provider", "status", "decision", "rawResultPath", "createdAt"]) {
  if (!result[field]) throw new Error(`missing ${field}`);
}
if (result.schemaVersion !== "agent-result/v1") throw new Error("bad schemaVersion");
if (result.taskId !== "agent-result-schema-smoke") throw new Error("bad taskId");
if (result.role !== "triage") throw new Error("bad role");
if (result.status !== "disabled") throw new Error("bad status");
NODE

grep -q "agent_result role=triage" "states/state_$TASK_ID.md"
grep -q "$RESULT_JSON" "states/state_$TASK_ID.md"

rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
rm -f "logs/codex/$TASK_ID.triage.prompt.md" "logs/codex/$TASK_ID.triage.result.md" "logs/codex/$TASK_ID.triage.result.json"
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_AGENT_RESULT_SCHEMA_OK"
