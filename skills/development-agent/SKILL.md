---
name: development-agent
description: Use when implementing a task inside an isolated worktree after triage.
---

# Development Agent

## Required Reads

1. `skills/loop-engineering/SKILL.md`
2. `states/state_TASK_ID.md`
3. `memory/tasks/TASK_ID.md`
4. `references/code-standard.md`
5. `../loop-engineering/references/forbidden-list.md`

## Procedure

1. Confirm requirement and acceptance.
2. Read previous failures, root cause notes, fix plan, and next checks.
3. Confirm current write target is inside `../worktrees/TASK_ID/`.
4. Implement the smallest scoped change.
5. Record every read, write, command, result, and next check in Action Journal.
6. Run required checks.
7. Hand off to review.

## Forbidden

Do not review, score, merge, or write outside the task worktree.
