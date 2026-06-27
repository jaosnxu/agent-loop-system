#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="${1:-worktree-verify}"
WORKTREES_ROOT="$(cd "$ROOT/.." && pwd)/worktrees"
WORKTREE_PATH="$WORKTREES_ROOT/$TASK_ID"
BRANCH_NAME="task/$TASK_ID"

scripts/worktree/clean_worktree.sh "$TASK_ID" >/dev/null 2>&1 || true

scripts/worktree/create_worktree.sh "$TASK_ID" >/tmp/worktree-create.out
test -d "$WORKTREE_PATH"
git -C "$WORKTREE_PATH" rev-parse --is-inside-work-tree | grep -q '^true$'
git -C "$ROOT" branch --list "$BRANCH_NAME" | grep -q "$BRANCH_NAME"

if scripts/worktree/assert_worktree.sh >/tmp/worktree-main-assert.out 2>/tmp/worktree-main-assert.err; then
  echo "VERIFY_WORKTREE_FAILED main_workspace_assert_allowed"
  exit 1
fi

(cd "$WORKTREE_PATH" && "$ROOT/scripts/worktree/assert_worktree.sh") >/tmp/worktree-isolated-assert.out
grep -q "Worktree assertion passed" /tmp/worktree-isolated-assert.out

node scripts/mcp/mcp_tool.mjs development filesystem write "$WORKTREE_PATH/worktree-write.txt" "worktree verify" >/tmp/worktree-mcp-write.out
grep -q '"ok": true' /tmp/worktree-mcp-write.out

scripts/worktree/clean_worktree.sh "$TASK_ID" >/tmp/worktree-clean.out
test ! -d "$WORKTREE_PATH"
if git -C "$ROOT" branch --list "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
  echo "VERIFY_WORKTREE_FAILED branch_residue"
  exit 1
fi

echo "VERIFY_WORKTREE_OK"
