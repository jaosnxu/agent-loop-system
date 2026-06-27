#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="human-gate-audit-smoke"
rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true

node scripts/state/create_state.mjs "$TASK_ID" "Human gate audit smoke" \
  --priority=P1 \
  --type=changelog \
  --requirement="Human gate decisions must be audited." \
  --acceptance="State, memory, and logs contain actor, operation, reason, decision, and gate id." >/dev/null
scripts/worktree/create_worktree.sh "$TASK_ID" >/dev/null

node scripts/human/record_gate.mjs "$TASK_ID" pending "merge_to_main" "verifier" "smoke pending" >/tmp/human-gate-pending.out
grep -q "decision=pending" /tmp/human-gate-pending.out
grep -q "Current Stage: pending_human" "states/state_$TASK_ID.md"
grep -q "Human Gate: pending" "states/state_$TASK_ID.md"
grep -q "actor=\\\"verifier\\\"" "states/state_$TASK_ID.md"
grep -q "gate_id=human-" "states/state_$TASK_ID.md"
grep -q "task=$TASK_ID" logs/human-gate.log
scripts/human/list_pending.sh >/tmp/human-gate-list.out
grep -q "PENDING_HUMAN task=$TASK_ID" /tmp/human-gate-list.out
node scripts/human/report_approvals.mjs /tmp/human-approval-report.md >/tmp/human-approval-report.out
grep -q "Human Approval Report" /tmp/human-approval-report.out

HUMAN_GATE_ACTOR=verifier scripts/human/reject_task.sh "$TASK_ID" "smoke rejection" >/tmp/human-gate-reject.out
grep -q "TASK_REJECTED $TASK_ID" /tmp/human-gate-reject.out
grep -q "Current Stage: terminated" "states/state_$TASK_ID.md"
grep -q "Human Gate: rejected" "states/state_$TASK_ID.md"
grep -q "smoke rejection" "states/state_$TASK_ID.md"
test ! -d "$(cd "$ROOT/.." && pwd)/worktrees/$TASK_ID"

rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_HUMAN_GATE_AUDIT_OK"
