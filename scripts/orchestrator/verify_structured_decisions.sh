#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

review_task="structured-review-smoke"
scoring_task="structured-scoring-smoke"

cleanup_task() {
  local task_id="$1"
  rm -f "states/state_${task_id}.md" "memory/tasks/${task_id}.md"
  rm -f "logs/codex/${task_id}."*
  scripts/worktree/clean_worktree.sh "$task_id" >/dev/null 2>&1 || true
}

cleanup_task "$review_task"
node scripts/state/create_state.mjs "$review_task" "Structured review smoke" --priority=P1 --type=example --requirement="Structured review result must drive routing." --acceptance="Review decision fail returns to development." >/dev/null
scripts/worktree/create_worktree.sh "$review_task" >/dev/null
node scripts/state/update_stage.mjs "$review_task" development "prepare structured review smoke" >/dev/null
node scripts/orchestrator/run_task.mjs "$review_task" --type=example --interrupt-after=development >/tmp/structured-review-dev.out 2>/tmp/structured-review-dev.err || true
node scripts/state/update_stage.mjs "$review_task" review "inject structured review failure" >/dev/null
mkdir -p logs/codex
cat > "logs/codex/$review_task.review.result.md" <<'TEXT'
gate_result: FAIL
severity: P1
next_stage: returned_to_development
TEXT
cat > "logs/codex/$review_task.review.result.json" <<JSON
{
  "schemaVersion": "agent-result/v1",
  "taskId": "$review_task",
  "role": "review",
  "provider": "test",
  "status": "completed",
  "statusCode": 0,
  "decision": "fail",
  "rawResultPath": "logs/codex/$review_task.review.result.md",
  "summary": "structured review failure",
  "createdAt": "2000-01-01T00:00:00.000Z"
}
JSON
AGENT_LOOP_CODEX_ENABLED=0 node scripts/orchestrator/run_task.mjs "$review_task" --type=example --skip-review=true --interrupt-after=review >/tmp/structured-review.out 2>/tmp/structured-review.err || true
grep -q "Current Stage: returned_to_development" "states/state_$review_task.md"
grep -q "structured review failure" "states/state_$review_task.md"
cleanup_task "$review_task"

cleanup_task "$scoring_task"
node scripts/state/create_state.mjs "$scoring_task" "Structured scoring smoke" --priority=P1 --type=example --requirement="Structured scoring result must drive routing." --acceptance="Scoring decision fail returns to development." >/dev/null
scripts/worktree/create_worktree.sh "$scoring_task" >/dev/null
node scripts/state/update_stage.mjs "$scoring_task" development "prepare structured scoring smoke" >/dev/null
node scripts/orchestrator/run_task.mjs "$scoring_task" --type=example --interrupt-after=development >/tmp/structured-scoring-dev.out 2>/tmp/structured-scoring-dev.err || true
node scripts/state/update_stage.mjs "$scoring_task" scoring "inject structured scoring failure" >/dev/null
cat > "logs/codex/$scoring_task.scoring.result.md" <<'TEXT'
gate_result: FAIL
score: 40
TEXT
cat > "logs/codex/$scoring_task.scoring.result.json" <<JSON
{
  "schemaVersion": "agent-result/v1",
  "taskId": "$scoring_task",
  "role": "scoring",
  "provider": "test",
  "status": "completed",
  "statusCode": 0,
  "decision": "fail",
  "rawResultPath": "logs/codex/$scoring_task.scoring.result.md",
  "summary": "structured scoring failure",
  "createdAt": "2000-01-01T00:00:00.000Z"
}
JSON
AGENT_LOOP_CODEX_ENABLED=0 node scripts/orchestrator/run_task.mjs "$scoring_task" --type=example --skip-scoring=true --interrupt-after=scoring >/tmp/structured-scoring.out 2>/tmp/structured-scoring.err || true
grep -q "Current Stage: returned_to_development" "states/state_$scoring_task.md"
grep -q "structured scoring failure" "states/state_$scoring_task.md"
cleanup_task "$scoring_task"

node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_STRUCTURED_DECISIONS_OK"
