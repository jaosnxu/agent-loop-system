#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="review-return-smoke"
rm -f "states/state_$TASK_ID.md"
scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true

node scripts/state/create_state.mjs "$TASK_ID" "Review return smoke" --priority=P1 --type=development --requirement="Produce a correct example output." --acceptance="Review must block when Review Agent reports P1 missing requirement." >/tmp/review-return-state.out
scripts/worktree/create_worktree.sh "$TASK_ID" >/tmp/review-return-worktree.out
node scripts/state/update_stage.mjs "$TASK_ID" review "prepare review failure verification" >/tmp/review-return-stage.out
mkdir -p "logs/codex"
cat > "logs/codex/$TASK_ID.review.result.md" <<'REVIEW'
```yaml
role: review
task_id: review-return-smoke
gate_result: FAIL
findings:
  - severity: P1
    file: example-task-output.md
    issue: Missing required output file.
evidence_reviewed:
  - task state
next_stage: returned_to_development
```
REVIEW

set +e
node scripts/orchestrator/run_task.mjs "$TASK_ID" --type=example --interrupt-after=development >/tmp/review-return-run.out 2>/tmp/review-return-run.err
RC=$?
set -e

if [ "$RC" -ne 75 ]; then
  echo "VERIFY_REVIEW_RETURN_FAILED unexpected_rc=$RC"
  cat /tmp/review-return-run.err
  cat /tmp/review-return-run.out
  scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true
  exit 1
fi

grep -q "Current Stage: returned_to_development" "states/state_$TASK_ID.md"
grep -q "Review Agent blocked" "states/state_$TASK_ID.md"
grep -q "Review Gate: failed" "states/state_$TASK_ID.md"
grep -q "development wrote" "states/state_$TASK_ID.md"

scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true
rm -f "states/state_$TASK_ID.md" "logs/codex/$TASK_ID.review.result.md"
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_REVIEW_RETURN_OK"
