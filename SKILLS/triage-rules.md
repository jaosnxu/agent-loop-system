# Triage Rules

## Purpose

Rules for classifying, prioritizing, and routing tasks.

## Task Classes

- PRD_GAP: Product requirement or specification is missing or inconsistent.
- DEV: Implementation task.
- BUG: Behavior is broken.
- TEST: Test coverage, regression, or QA issue.
- SECURITY_PERMISSION: Authentication, authorization, secrets, privacy, or access-control task.
- RELEASE_GATE: Staging, production, smoke test, rollback, or deployment decision.
- OPS_DOCS: Documentation, process, or operations material.

## Priority Levels

- P0: Production or data safety risk.
- P1: Blocks core delivery.
- P2: Important but not blocking current release.
- P3: Cleanup or improvement.

## Triage Output

- Task ID.
- Class.
- Priority.
- Assigned next role.
- Required skill files.
- Required tools.
- Risk flags.
- Initial state file path.
