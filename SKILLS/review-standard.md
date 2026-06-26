# Review Standard

## Purpose

Rules for Review Agent and Scoring Agent quality gates.

## Severity Levels

- P0: Blocks all progress. Security, data loss, production breakage, permission bypass, or destructive behavior.
- P1: Blocks merge. Broken core flow, missing required test, incorrect business rule, or unsafe migration.
- P2: Must be fixed before release unless explicitly deferred.
- P3: Non-blocking improvement.

## Review Rules

- Review Agent is read-only.
- Review Agent must not edit files.
- Review Agent must inspect the diff, task state, relevant skill files, and verification output.
- Any P0 or P1 finding returns the task to Development Agent.
- Missing evidence is a blocking issue.

## Required Review Output

- Gate result: `PASS` or `FAIL`.
- Findings by severity.
- Evidence reviewed.
- Required next action.
