#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

cleanup_task() {
  local task_id="$1"
  rm -f "states/state_${task_id}.md" "memory/tasks/${task_id}.md"
  rm -f "logs/codex/${task_id}."*
  scripts/worktree/clean_worktree.sh "$task_id" >/dev/null 2>&1 || true
}

scripts/orchestrator/verify_review_return.sh >/tmp/cleanup-matrix-review.out
scripts/orchestrator/verify_safety_brake.sh cleanup-brake-smoke >/tmp/cleanup-matrix-brake.out

changelog_task="cleanup-changelog-smoke"
cleanup_task "$changelog_task"
set +e
node scripts/orchestrator/run_task.mjs "$changelog_task" --title="Cleanup changelog smoke" --type=changelog >/tmp/cleanup-matrix-changelog.out 2>/tmp/cleanup-matrix-changelog.err
rc=$?
set -e
if [ "$rc" -ne 90 ]; then
  echo "VERIFY_CLEANUP_MATRIX_FAILED changelog_pending rc=$rc"
  cat /tmp/cleanup-matrix-changelog.err
  cat /tmp/cleanup-matrix-changelog.out
  exit 1
fi
scripts/human/reject_task.sh "$changelog_task" "cleanup matrix rejection" >/tmp/cleanup-matrix-changelog-reject.out
test ! -d "../worktrees/$changelog_task"
cleanup_task "$changelog_task"

prototype_task="cleanup-prototype-smoke"
REQ="合同管理、任务协同、知识库、AI 审查、权限、多语言服务器绑定"
ACC="页面必须包含合同台账、合同上传、AI 合同审查、审批流、知识库、任务详情；默认俄语；管理员可切换服务器节点到中国节点后 UI 变中文；普通员工不可见服务器切换；原型不得出现奶茶点单、库存、菜单、门店收银；原型说明服务器切换为交互逻辑模拟，不是真实多节点部署"
cleanup_task "$prototype_task"
set +e
node scripts/orchestrator/run_task.mjs "$prototype_task" --title="Cleanup prototype smoke" --type=prototype --priority=P1 --requirement="$REQ" --acceptance="$ACC" >/tmp/cleanup-matrix-prototype.out 2>/tmp/cleanup-matrix-prototype.err
rc=$?
set -e
if [ "$rc" -ne 90 ]; then
  echo "VERIFY_CLEANUP_MATRIX_FAILED prototype_pending rc=$rc"
  cat /tmp/cleanup-matrix-prototype.err
  cat /tmp/cleanup-matrix-prototype.out
  exit 1
fi
scripts/human/reject_task.sh "$prototype_task" "cleanup matrix rejection" >/tmp/cleanup-matrix-prototype-reject.out
test ! -d "../worktrees/$prototype_task"
cleanup_task "$prototype_task"

scripts/worktree/monitor_residue.sh >/tmp/cleanup-matrix-residue.out
grep -q "WORKTREE_RESIDUE_OK" /tmp/cleanup-matrix-residue.out

echo "VERIFY_CLEANUP_MATRIX_OK"
