#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

REQ="合同管理、任务协同、知识库、AI 审查、权限、多语言服务器绑定"
ACC="页面必须包含合同台账、合同上传、AI 合同审查、审批流、知识库、任务详情；默认俄语；管理员可切换服务器节点到中国节点后 UI 变中文；普通员工不可见服务器切换；原型不得出现奶茶点单、库存、菜单、门店收银；原型说明服务器切换为交互逻辑模拟，不是真实多节点部署"

cleanup_task() {
  local task_id="$1"
  rm -f "states/state_${task_id}.md"
  scripts/worktree/clean_worktree.sh "$task_id" >/dev/null 2>&1 || true
}

cleanup_task loop-verify-missing
if node scripts/orchestrator/run_task.mjs loop-verify-missing --title="Missing spec" --type=prototype >/tmp/loop-verify-missing.out 2>/tmp/loop-verify-missing.err; then
  echo "VERIFY_FAIL missing requirement was not blocked"
  exit 1
fi
grep -q "Task spec incomplete" /tmp/loop-verify-missing.err
cleanup_task loop-verify-missing
echo "VERIFY_PASS missing requirement blocked"

cleanup_task loop-verify-bad
rm -rf /tmp/loop-verify-bad-template
mkdir -p /tmp/loop-verify-bad-template/prototype
cat > /tmp/loop-verify-bad-template/prototype/index.html <<'HTML'
<!doctype html><html lang="ru"><body><h1>CHUCHUTEA Панель магазина</h1><button>Заказы</button><section>Склад</section></body></html>
HTML
node scripts/state/create_state.mjs loop-verify-bad "Bad template" --priority=P0 --type=prototype --requirement="$REQ" --acceptance="$ACC" >/tmp/loop-verify-bad-state.out
if node scripts/gate/acceptance_check.mjs loop-verify-bad /tmp/loop-verify-bad-template >/tmp/loop-verify-bad.out 2>/tmp/loop-verify-bad.err; then
  echo "VERIFY_FAIL wrong template was not blocked"
  exit 1
fi
grep -q "ACCEPTANCE_GATE_BLOCKED" /tmp/loop-verify-bad.out
cleanup_task loop-verify-bad
rm -rf /tmp/loop-verify-bad-template
echo "VERIFY_PASS wrong template blocked"

CONTRACT_TASK_ID="loop-verify-contract"
cleanup_task "$CONTRACT_TASK_ID"
set +e
node scripts/orchestrator/run_task.mjs "$CONTRACT_TASK_ID" --title="Contract system prototype gate test" --type=prototype --priority=P0 --requirement="$REQ" --acceptance="$ACC" >/tmp/loop-verify-contract.out 2>/tmp/loop-verify-contract.err
rc=$?
set -e
if [ "$rc" -ne 90 ]; then
  echo "VERIFY_FAIL contract prototype did not stop at human gate rc=$rc"
  cat /tmp/loop-verify-contract.err
  cat /tmp/loop-verify-contract.out
  exit 1
fi
grep -q "PENDING_HUMAN" /tmp/loop-verify-contract.out
grep -q "Passed: 24" "../worktrees/$CONTRACT_TASK_ID/reports/prototype-test-report.md"
grep -q "Failed: 0" "../worktrees/$CONTRACT_TASK_ID/reports/prototype-test-report.md"
cleanup_task "$CONTRACT_TASK_ID"
echo "VERIFY_PASS correct contract task reached human gate"

echo "VERIFY_REQUIREMENT_GATE_OK"
