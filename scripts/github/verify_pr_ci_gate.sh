#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="github-pr-ci-gate-smoke"
rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
rm -f queue/human-approvals.json

node scripts/state/create_state.mjs "$TASK_ID" "GitHub PR CI gate smoke" \
  --priority=P1 \
  --type=development \
  --requirement="GitHub PR and CI flow must stop at human gate before write operations." \
  --acceptance="Repo, PR, and Actions read checks succeed; PR write creates a pending human approval request." >/dev/null

node scripts/github/prepare_pr_gate.mjs "$TASK_ID" "task/$TASK_ID" "Smoke PR gate" >/tmp/github-pr-ci-gate.out
grep -q "GITHUB_PR_CI_GATE_PENDING task=$TASK_ID" /tmp/github-pr-ci-gate.out
grep -q "Current Stage: pending_human" "states/state_$TASK_ID.md"
grep -q "github_pr_ci_gate" "states/state_$TASK_ID.md"
grep -q "github_pr_create_update" "states/state_$TASK_ID.md"
test -f queue/human-approvals.json
grep -q "\"taskId\": \"$TASK_ID\"" queue/human-approvals.json
grep -q "\"operation\": \"pull_requests:write\"" queue/human-approvals.json
scripts/human/list_pending.sh >/tmp/github-pr-ci-list.out
grep -q "PENDING_APPROVAL" /tmp/github-pr-ci-list.out

rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md" queue/human-approvals.json
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_GITHUB_PR_CI_GATE_OK"
