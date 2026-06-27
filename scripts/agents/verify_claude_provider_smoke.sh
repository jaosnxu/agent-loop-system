#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="claude-provider-smoke"
STATE_FILE="states/state_$TASK_ID.md"
REVIEW_JSON="logs/codex/$TASK_ID.review.result.json"
REVIEW_MD="logs/codex/$TASK_ID.review.result.md"
SCORING_JSON="logs/codex/$TASK_ID.scoring.result.json"
SCORING_MD="logs/codex/$TASK_ID.scoring.result.md"
BUDGET_FILE="memory/budget/$TASK_ID.jsonl"

cleanup() {
  rm -f "$STATE_FILE" "memory/tasks/$TASK_ID.md" "memory/evidence/$TASK_ID.jsonl" "$BUDGET_FILE"
  rm -f "logs/codex/$TASK_ID.review.prompt.md" "$REVIEW_MD" "$REVIEW_JSON"
  rm -f "logs/codex/$TASK_ID.scoring.prompt.md" "$SCORING_MD" "$SCORING_JSON"
  node scripts/state/sync_board.mjs >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

claude --version >/tmp/agent-loop-claude-provider-version.out
scripts/agents/verify_model_providers.sh >/tmp/agent-loop-claude-provider-config.out

node scripts/state/create_state.mjs "$TASK_ID" "Claude review and scoring provider smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Review and scoring roles must execute through the verified Claude provider, separate from Codex development." \
  --acceptance="Review and scoring runs must produce completed structured agent-result records with provider=claude and budget evidence." \
  >/tmp/agent-loop-claude-provider-state.out

AGENT_LOOP_CODEX_ENABLED=1 AGENT_LOOP_CODEX_SMOKE=1 AGENT_LOOP_PROVIDER_REVIEW=claude AGENT_LOOP_CODEX_TIMEOUT_MS=120000 \
  node scripts/agents/run_agent.mjs review "$TASK_ID" \
  >/tmp/agent-loop-claude-provider-review.out

AGENT_LOOP_CODEX_ENABLED=1 AGENT_LOOP_CODEX_SMOKE=1 AGENT_LOOP_PROVIDER_SCORING=claude AGENT_LOOP_CODEX_TIMEOUT_MS=120000 \
  node scripts/agents/run_agent.mjs scoring "$TASK_ID" \
  >/tmp/agent-loop-claude-provider-scoring.out

grep -q "AGENT_READY role=review task=$TASK_ID" /tmp/agent-loop-claude-provider-review.out
grep -q "AGENT_READY role=scoring task=$TASK_ID" /tmp/agent-loop-claude-provider-scoring.out
test -s "$REVIEW_MD"
test -s "$REVIEW_JSON"
test -s "$SCORING_MD"
test -s "$SCORING_JSON"

node --input-type=module - "$REVIEW_JSON" "$SCORING_JSON" "$BUDGET_FILE" <<'NODE'
import fs from "node:fs";
const [reviewJson, scoringJson, budgetFile] = process.argv.slice(2);
for (const [file, role] of [[reviewJson, "review"], [scoringJson, "scoring"]]) {
  const result = JSON.parse(fs.readFileSync(file, "utf8"));
  if (result.schemaVersion !== "agent-result/v1") throw new Error(`schema mismatch: ${file}`);
  if (result.taskId !== "claude-provider-smoke") throw new Error(`task mismatch: ${file}`);
  if (result.role !== role) throw new Error(`role mismatch: ${file}`);
  if (result.provider !== "claude") throw new Error(`provider mismatch: ${file}`);
  if (result.status !== "completed") throw new Error(`status mismatch: ${file}`);
  if (!result.rawResultPath || !fs.existsSync(result.rawResultPath)) throw new Error(`missing raw result: ${file}`);
}
if (!fs.existsSync(budgetFile)) throw new Error("missing budget file");
const entries = fs.readFileSync(budgetFile, "utf8").trim().split(/\n+/).map((line) => JSON.parse(line));
for (const role of ["review", "scoring"]) {
  if (!entries.some((entry) => entry.source === "codex_delegate" && entry.details?.role === role && entry.details?.provider === "claude" && entry.result === "completed")) {
    throw new Error(`missing budget entry for ${role}`);
  }
}
NODE

grep -q "agent_result role=review provider=claude status=completed" "$STATE_FILE"
grep -q "agent_result role=scoring provider=claude status=completed" "$STATE_FILE"
grep -q "budget_usage" "$STATE_FILE"

echo "VERIFY_CLAUDE_PROVIDER_SMOKE_OK version=$(cat /tmp/agent-loop-claude-provider-version.out)"
