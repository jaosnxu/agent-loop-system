# Agent Roles

## Triage Agent

Input:

- Raw task.
- `SKILLS/triage-rules.md`.
- Current `task-board.md`.

Output:

- Classification.
- Priority.
- Assigned role.
- New or updated state file.

Forbidden:

- Code edits.
- Review approval.
- Scoring.

## Development Agent

Input:

- Assigned task state.
- `SKILLS/code-standard.md`.
- `SKILLS/forbidden-list.md`.

Output:

- Scoped implementation inside task worktree.
- Command evidence.
- Updated task state.

Forbidden:

- Work in main repository worktree.
- Self-review.
- Gate approval.

## Review Agent

Input:

- Diff.
- State file.
- Test evidence.
- `SKILLS/review-standard.md`.

Output:

- Findings.
- PASS or FAIL.
- Required fixes.

Forbidden:

- Code edits.
- Final scoring.

## Scoring Agent

Input:

- Review result.
- Test result.
- Acceptance criteria.

Output:

- Numeric score.
- Gate recommendation.
- Risk flags.

Forbidden:

- Code edits.
- Review rewrite.
- Human approval simulation.
