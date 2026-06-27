#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="codex-enabled-smoke"
STATE_FILE="states/state_$TASK_ID.md"
RESULT_JSON="logs/codex/$TASK_ID.triage.result.json"
RESULT_MD="logs/codex/$TASK_ID.triage.result.md"
PROMPT_MD="logs/codex/$TASK_ID.triage.prompt.md"
BUDGET_FILE="memory/budget/$TASK_ID.jsonl"

cleanup() {
  rm -f "$STATE_FILE" "memory/tasks/$TASK_ID.md" "memory/evidence/$TASK_ID.jsonl" "$BUDGET_FILE"
  node scripts/state/sync_board.mjs >/dev/null 2>&1 || true
}

cleanup

command -v codex >/dev/null
codex --version >/tmp/agent-loop-codex-enabled-version.out
node -e "JSON.parse(require('fs').readFileSync('config/codex.config.json','utf8'))"

node scripts/state/create_state.mjs "$TASK_ID" "Codex enabled triage smoke" \
  --priority=P2 \
  --type=development \
  --requirement="Run a safe read-only triage role through the real Codex provider." \
  --acceptance="The triage agent must execute through codex exec, write a completed structured result, update state evidence, and record budget usage." \
  >/tmp/agent-loop-codex-enabled-state.out

AGENT_LOOP_CODEX_ENABLED=1 AGENT_LOOP_PROVIDER=codex AGENT_LOOP_CODEX_SMOKE=1 AGENT_LOOP_CODEX_TIMEOUT_MS=120000 \
  node scripts/agents/run_agent.mjs triage "$TASK_ID" \
  >/tmp/agent-loop-codex-enabled-run.out

grep -q "AGENT_READY role=triage task=$TASK_ID" /tmp/agent-loop-codex-enabled-run.out
test -s "$PROMPT_MD"
test -s "$RESULT_MD"
test -s "$RESULT_JSON"
! grep -q "CODEX_DELEGATE_DISABLED" "$RESULT_MD"
grep -q "role: triage" "$RESULT_MD"
grep -q "task_id: codex-enabled-smoke" "$RESULT_MD"

node --input-type=module - "$RESULT_JSON" <<'NODE'
import fs from "node:fs";
const [file] = process.argv.slice(2);
const result = JSON.parse(fs.readFileSync(file, "utf8"));
const required = {
  schemaVersion: "agent-result/v1",
  taskId: "codex-enabled-smoke",
  role: "triage",
  provider: "codex",
  status: "completed"
};
for (const [key, value] of Object.entries(required)) {
  if (result[key] !== value) {
    throw new Error(`Expected ${key}=${value}, got ${result[key]}`);
  }
}
if (!result.rawResultPath || !fs.existsSync(result.rawResultPath)) {
  throw new Error("Missing raw result path");
}
if (!result.promptPath || !fs.existsSync(result.promptPath)) {
  throw new Error("Missing prompt path");
}
NODE

grep -q "agent_result role=triage provider=codex status=completed" "$STATE_FILE"
grep -q "budget_usage" "$STATE_FILE"

node --input-type=module - "$STATE_FILE" "$BUDGET_FILE" <<'NODE'
import fs from "node:fs";
const [stateFile, budgetFile] = process.argv.slice(2);
const state = fs.readFileSync(stateFile, "utf8");
const field = (name) => {
  const match = state.match(new RegExp(`- ${name}:\\s*(.*)`));
  return match ? match[1].trim() : "";
};
if (Number(field("Token Budget Used")) <= 0) {
  throw new Error("Token Budget Used was not incremented");
}
if (Number(field("Tool Call Count")) <= 0) {
  throw new Error("Tool Call Count was not incremented");
}
if (!fs.existsSync(budgetFile)) {
  throw new Error("Missing budget ledger");
}
const entries = fs.readFileSync(budgetFile, "utf8").trim().split(/\n+/).map((line) => JSON.parse(line));
if (!entries.some((entry) => entry.source === "codex_delegate" && entry.tool === "model" && entry.result === "completed")) {
  throw new Error("Missing completed codex_delegate budget entry");
}
NODE

cleanup

echo "CODEX_ENABLED_SMOKE_PASSED version=$(cat /tmp/agent-loop-codex-enabled-version.out)"
