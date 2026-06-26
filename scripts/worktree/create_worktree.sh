#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 TASK_ID" >&2
  exit 64
fi

TASK_ID="$1"

if [[ ! "$TASK_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid TASK_ID: use letters, numbers, dot, underscore, or hyphen only." >&2
  exit 65
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "Not inside a git repository." >&2
  exit 66
fi

WORKTREES_ROOT="$(cd "$REPO_ROOT/.." && pwd)/worktrees"
WORKTREE_PATH="$WORKTREES_ROOT/$TASK_ID"
BRANCH_NAME="task/$TASK_ID"

mkdir -p "$WORKTREES_ROOT"

if [ -e "$WORKTREE_PATH" ]; then
  echo "Worktree path already exists: $WORKTREE_PATH" >&2
  exit 67
fi

if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  echo "Branch already exists: $BRANCH_NAME" >&2
  exit 68
fi

if git -C "$REPO_ROOT" rev-parse --verify --quiet HEAD >/dev/null; then
  git -C "$REPO_ROOT" worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" HEAD
else
  git -C "$REPO_ROOT" worktree add --orphan -b "$BRANCH_NAME" "$WORKTREE_PATH"
fi

echo "Created worktree"
echo "Task ID: $TASK_ID"
echo "Branch: $BRANCH_NAME"
echo "Path: $WORKTREE_PATH"
