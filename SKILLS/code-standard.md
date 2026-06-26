# Code Standard

## Purpose

Rules for Development Agent code changes.

## Mandatory Rules

- Read `SKILLS/agent-roles.md` and `SKILLS/forbidden-list.md` before editing.
- Edit only inside the task worktree path `../worktrees/TASK_ID/`.
- Preserve existing architecture and naming conventions.
- Keep changes scoped to the assigned task.
- Add or update tests when behavior changes.
- Do not install dependencies unless the task state explicitly marks dependency approval.
- Do not modify production secrets, credentials, generated lockfiles, or deployment settings unless explicitly assigned and gated.

## Output Format

Development Agent must report:

- Files changed.
- Commands run.
- Test result.
- Remaining risks.
- State update written.
