#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

WORKTREES_ROOT="$(cd "$ROOT/.." && pwd)/worktrees"
mkdir -p "$WORKTREES_ROOT"

residue=0

while IFS= read -r branch; do
  task_id="${branch#task/}"
  state_file="states/state_${task_id}.md"
  if [ ! -f "$state_file" ]; then
    echo "WORKTREE_RESIDUE branch_without_state $branch"
    residue=1
  fi
done < <(git branch --format='%(refname:short)' | grep '^task/' || true)

while IFS= read -r dir; do
  [ -z "$dir" ] && continue
  task_id="$(basename "$dir")"
  state_file="states/state_${task_id}.md"
  if [ ! -f "$state_file" ]; then
    echo "WORKTREE_RESIDUE directory_without_state $dir"
    residue=1
  fi
done < <(find "$WORKTREES_ROOT" -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null || true)

if [ "$residue" -ne 0 ]; then
  echo "WORKTREE_RESIDUE_FOUND"
  exit 2
fi

echo "WORKTREE_RESIDUE_OK"
