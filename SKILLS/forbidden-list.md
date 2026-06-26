# Forbidden List

## Absolute Prohibitions

- Editing outside the task worktree.
- Deleting source files without explicit human confirmation.
- Committing secrets, tokens, passwords, cookies, or private keys.
- Modifying payment, payroll, inventory deduction, permission, or production deployment logic without high-risk gate marking.
- Bypassing lint, tests, review, scoring, or state writes.
- Merging to main without human confirmation.
- Sending external notifications without human confirmation unless explicitly allowlisted.

## Sensitive Paths

- `.env`
- `.env.*`
- `secrets/`
- `config/production*`
- deployment credentials
- database dumps
- private customer or employee data

## Required Marker

High-risk steps must write:

`HUMAN_CONFIRMATION_REQUIRED`
