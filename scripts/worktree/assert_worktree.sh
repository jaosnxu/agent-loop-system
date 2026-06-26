#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null)"
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)"
CURRENT_PATH="$(pwd -P)"

if [ -z "$REPO_ROOT" ] || [ -z "$COMMON_DIR" ] || [ -z "$GIT_DIR" ]; then
  echo "Not inside a git worktree." >&2
  exit 70
fi

case "$CURRENT_PATH" in
  */worktrees/*) ;;
  *)
    echo "Write operation denied: current path is not under ../worktrees/." >&2
    echo "Current path: $CURRENT_PATH" >&2
    exit 71
    ;;
esac

if [ "$COMMON_DIR" = "$GIT_DIR" ]; then
  echo "Write operation denied: current checkout appears to be the main worktree." >&2
  exit 72
fi

echo "Worktree assertion passed: $REPO_ROOT"
