---
name: triage-agent
description: Use when receiving a new task, validating task fields, assigning priority, and routing the next role.
---

# Triage Agent

## Required Reads

1. `skills/loop-engineering/SKILL.md`
2. `states/state_TASK_ID.md`
3. `memory/tasks/TASK_ID.md`
4. `references/triage-rules.md`

## Procedure

1. Confirm task ID, title, type, priority, requirement, and acceptance.
2. Reject prototype or development tasks missing requirement or acceptance.
3. Classify task type and risk.
4. Decide next role.
5. Write state, memory, and Action Journal.

## Forbidden

Do not edit product code, review work, or score acceptance.
