#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

DIRECT_TASK="failure-diagnostics-smoke"
REVIEW_TASK="failure-review-smoke"

cleanup() {
  scripts/worktree/clean_worktree.sh "$REVIEW_TASK" >/dev/null 2>&1 || true
  rm -f \
    "states/state_$DIRECT_TASK.md" \
    "states/state_$REVIEW_TASK.md" \
    "memory/tasks/$DIRECT_TASK.md" \
    "memory/tasks/$REVIEW_TASK.md" \
    "memory/evidence/$DIRECT_TASK.jsonl" \
    "memory/evidence/$REVIEW_TASK.jsonl" \
    "logs/codex/$REVIEW_TASK.review.result.md" \
    "logs/codex/$REVIEW_TASK.review.result.json"
  node scripts/state/sync_board.mjs >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

node scripts/state/create_state.mjs "$DIRECT_TASK" "Failure diagnostics smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Failures must preserve root cause, fix plan, and next checks." \
  --acceptance="State, memory, and structured evidence must include machine-readable failure diagnostics." >/tmp/failure-diagnostics-create.out

node scripts/state/record_failure.mjs "$DIRECT_TASK" "Injected direct failure" \
  --label=auto_gate \
  --root-cause="Injected root cause from verifier." \
  --fix-plan="Apply one targeted fix from verifier." \
  --next-checks="Rerun verifier gate and inspect structured evidence." \
  >/tmp/failure-diagnostics-record.out

grep -q "Current Stage: returned_to_development" "states/state_$DIRECT_TASK.md"
grep -q "Injected root cause from verifier" "states/state_$DIRECT_TASK.md"
grep -q "Apply one targeted fix from verifier" "states/state_$DIRECT_TASK.md"
grep -q "Rerun verifier gate" "states/state_$DIRECT_TASK.md"
grep -q "Injected root cause from verifier" "memory/tasks/$DIRECT_TASK.md"

node --input-type=module - "$DIRECT_TASK" <<'NODE'
import fs from "node:fs";
const taskId = process.argv[2];
const lines = fs.readFileSync(`memory/evidence/${taskId}.jsonl`, "utf8").trim().split(/\n+/).filter(Boolean);
const failures = lines.map((line) => JSON.parse(line)).filter((entry) => entry.type === "failure");
if (failures.length !== 1) throw new Error(`expected one failure evidence entry, got ${failures.length}`);
const details = failures[0].details || {};
if (details.label !== "auto_gate") throw new Error("failure label missing");
if (!details.rootCause?.includes("Injected root cause")) throw new Error("rootCause missing");
if (!details.fixPlan?.includes("targeted fix")) throw new Error("fixPlan missing");
if (!details.nextChecks?.includes("Rerun verifier gate")) throw new Error("nextChecks missing");
NODE

node scripts/state/create_state.mjs "$REVIEW_TASK" "Failure review smoke" \
  --priority=P1 \
  --type=development \
  --requirement="Review failure must return to development with diagnostics." \
  --acceptance="Review Agent failure must produce root cause, fix plan, next checks, and failed Review Gate." >/tmp/failure-review-create.out
scripts/worktree/create_worktree.sh "$REVIEW_TASK" >/tmp/failure-review-worktree.out
node scripts/state/update_stage.mjs "$REVIEW_TASK" review "prepare review diagnostic verification" >/tmp/failure-review-stage.out

mkdir -p logs/codex
cat >"logs/codex/$REVIEW_TASK.review.result.md" <<'REVIEW'
```yaml
role: review
task_id: failure-review-smoke
gate_result: FAIL
findings:
  - severity: P1
    file: example-task-output.md
    issue: Missing required task id in output.
next_stage: returned_to_development
```
REVIEW

set +e
node scripts/orchestrator/run_task.mjs "$REVIEW_TASK" --type=example --skip-review=true --interrupt-after=review >/tmp/failure-review-run.out 2>/tmp/failure-review-run.err
RC=$?
set -e
if [ "$RC" -ne 75 ]; then
  echo "VERIFY_FAILURE_DIAGNOSTICS_FAILED unexpected_rc=$RC" >&2
  cat /tmp/failure-review-run.out >&2
  cat /tmp/failure-review-run.err >&2
  exit 1
fi

grep -q "Current Stage: returned_to_development" "states/state_$REVIEW_TASK.md"
grep -q "Review Gate: failed" "states/state_$REVIEW_TASK.md"
grep -q "Review Agent found a blocking issue" "states/state_$REVIEW_TASK.md"
grep -q "Development Agent must read the review result" "states/state_$REVIEW_TASK.md"
grep -q "Rerun review" "states/state_$REVIEW_TASK.md"
grep -q "Review Agent found a blocking issue" "memory/tasks/$REVIEW_TASK.md"

echo "VERIFY_FAILURE_DIAGNOSTICS_OK"
