#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="structured-evidence-smoke"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p states memory/tasks memory/evidence
rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md" "memory/evidence/$TASK_ID.jsonl"

node scripts/state/create_state.mjs "$TASK_ID" "Structured evidence smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Structured evidence must be machine-readable." \
  --acceptance="State, task memory, and JSONL evidence must contain create, action, diagnostic, failure, artifact, and gate entries." >/tmp/structured-evidence-create.out

node scripts/state/record_action.mjs "$TASK_ID" development "inspect skill and requirement" "states/state_$TASK_ID.md" "read" "write artifact and run gate" >/tmp/structured-evidence-action.out
node scripts/state/record_diagnostic.mjs "$TASK_ID" auto_gate 1 3 "Injected gate failure for structured evidence verification." >/tmp/structured-evidence-diagnostic.out
node scripts/state/record_failure.mjs "$TASK_ID" "Injected failure for structured evidence verification." >/tmp/structured-evidence-failure.out

printf "structured evidence artifact\n" >"$TMP_DIR/artifact.txt"
node scripts/state/record_artifact_hash.mjs "$TASK_ID" "$TMP_DIR" output >/tmp/structured-evidence-artifact.out
node scripts/state/record_structured_evidence.mjs "$TASK_ID" gate gate run_gate "scripts/gate/run_gate.mjs" passed "review must consume gate evidence" '{"gate":"tool","status":"passed"}' >/tmp/structured-evidence-gate.out

grep -q "## Structured Evidence" "states/state_$TASK_ID.md"
grep -q "## Structured Evidence" "memory/tasks/$TASK_ID.md"
grep -q "## Structured Evidence JSONL" "memory/tasks/$TASK_ID.md"
test -s "memory/evidence/$TASK_ID.jsonl"

node - "$TASK_ID" <<'NODE'
const fs = require("fs");
const taskId = process.argv[2];
const state = fs.readFileSync(`states/state_${taskId}.md`, "utf8");
const memory = fs.readFileSync(`memory/tasks/${taskId}.md`, "utf8");
const lines = fs.readFileSync(`memory/evidence/${taskId}.jsonl`, "utf8").trim().split("\n").filter(Boolean);
if (lines.length < 6) throw new Error(`expected at least 6 evidence entries, got ${lines.length}`);
const entries = lines.map((line) => JSON.parse(line));
const requiredTypes = new Set(["state_created", "action", "diagnostic", "failure", "artifact_hash", "gate"]);
for (const entry of entries) {
  if (entry.schemaVersion !== "structured-evidence/v1") throw new Error(`bad schema ${entry.schemaVersion}`);
  if (entry.taskId !== taskId) throw new Error(`bad task ${entry.taskId}`);
  if (!entry.evidenceId?.startsWith("ev-")) throw new Error("missing evidence id");
  if (!entry.createdAt) throw new Error("missing createdAt");
  if (!entry.type || !entry.actor || !entry.action) throw new Error("missing core fields");
  if (!state.includes(entry.evidenceId)) throw new Error(`state missing evidence id ${entry.evidenceId}`);
}
for (const type of requiredTypes) {
  if (!entries.some((entry) => entry.type === type)) throw new Error(`missing evidence type ${type}`);
}
if (!memory.includes('"schemaVersion":"structured-evidence/v1"')) throw new Error("memory missing JSONL evidence");
const artifact = entries.find((entry) => entry.type === "artifact_hash");
if (!artifact.details?.hash || !artifact.details?.files) throw new Error("artifact evidence missing hash details");
const diagnostic = entries.find((entry) => entry.type === "diagnostic");
if (!diagnostic.details?.rootCause?.includes("Injected gate failure")) throw new Error("diagnostic root cause missing");
NODE

echo "VERIFY_STRUCTURED_EVIDENCE_OK"
