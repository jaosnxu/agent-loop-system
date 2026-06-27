#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="budget-usage-smoke"
WORKTREE_PATH="$(cd "$ROOT/.." && pwd)/worktrees/$TASK_ID"

cleanup() {
  scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md" "memory/evidence/$TASK_ID.jsonl" "memory/budget/$TASK_ID.jsonl"
node scripts/state/create_state.mjs "$TASK_ID" "Budget usage smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Tool and token budgets must be updated by real tool calls." \
  --acceptance="MCP calls update Tool Call Count, Token Budget Used, memory budget JSONL, and safety brake blocks when the configured tool limit is reached." >/tmp/budget-usage-create.out

scripts/worktree/create_worktree.sh "$TASK_ID" >/tmp/budget-usage-worktree.out

node scripts/mcp/mcp_tool.mjs development filesystem write "$WORKTREE_PATH/budget.txt" "budget verifier artifact" >/tmp/budget-usage-write.out
node scripts/mcp/mcp_tool.mjs review filesystem read "$WORKTREE_PATH/budget.txt" >/tmp/budget-usage-read.out

node - "$TASK_ID" <<'NODE'
const fs = require("fs");
const taskId = process.argv[2];
const state = fs.readFileSync(`states/state_${taskId}.md`, "utf8");
const token = Number((state.match(/^- Token Budget Used: (\d+)$/m) || [])[1] || 0);
const calls = Number((state.match(/^- Tool Call Count: (\d+)$/m) || [])[1] || 0);
if (token <= 0) throw new Error(`expected token budget to increase, got ${token}`);
if (calls < 2) throw new Error(`expected at least 2 tool calls, got ${calls}`);
if (!state.includes("type=budget_usage")) throw new Error("state missing budget structured evidence");
const budgetLines = fs.readFileSync(`memory/budget/${taskId}.jsonl`, "utf8").trim().split("\n").filter(Boolean);
if (budgetLines.length < 2) throw new Error(`expected at least 2 budget entries, got ${budgetLines.length}`);
const entries = budgetLines.map((line) => JSON.parse(line));
for (const entry of entries) {
  if (entry.schemaVersion !== "budget-usage/v1") throw new Error("bad budget schema");
  if (entry.taskId !== taskId) throw new Error("bad budget task");
  if (entry.source !== "mcp_tool") throw new Error(`unexpected budget source ${entry.source}`);
  if (entry.toolCalls !== 1) throw new Error("tool call delta must be 1");
  if (entry.tokenEstimate <= 0) throw new Error("token estimate must be positive");
}
const memory = fs.readFileSync(`memory/tasks/${taskId}.md`, "utf8");
if (!memory.includes("## Budget Usage JSONL")) throw new Error("task memory missing budget JSONL section");
if (!memory.includes('"schemaVersion":"budget-usage/v1"')) throw new Error("task memory missing budget rows");
NODE

CURRENT_CALLS="$(node - "$TASK_ID" <<'NODE'
const fs = require("fs");
const state = fs.readFileSync(`states/state_${process.argv[2]}.md`, "utf8");
console.log((state.match(/^- Tool Call Count: (\d+)$/m) || [])[1] || "0");
NODE
)"

if MAX_TOOL_CALLS="$CURRENT_CALLS" node scripts/gate/safety_brake.mjs "$TASK_ID" >/tmp/budget-usage-brake.out 2>/tmp/budget-usage-brake.err; then
  echo "Expected safety brake to block at current tool-call limit." >&2
  exit 1
fi
grep -q "tool_call_limit" /tmp/budget-usage-brake.out

echo "VERIFY_BUDGET_USAGE_OK"
