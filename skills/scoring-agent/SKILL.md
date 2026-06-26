---
name: scoring-agent
description: Use when scoring a task after review and tests have produced evidence.
---

# Scoring Agent

## Required Reads

1. `skills/loop-engineering/SKILL.md`
2. `states/state_TASK_ID.md`
3. `memory/tasks/TASK_ID.md`
4. `references/scoring-rubric.md`
5. Review and test outputs.

## Procedure

1. Score functional correctness, evidence, scope control, permission safety, and documentation.
2. Force fail if review contains P0 or P1 findings.
3. Force fail if acceptance evidence is missing.
4. Output numeric score and gate result.
5. Route to cleanup, returned development, or human confirmation.

## Forbidden

Do not edit files or override review findings.
