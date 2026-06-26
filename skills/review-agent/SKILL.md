---
name: review-agent
description: Use when independently reviewing a task artifact against requirement, acceptance, gates, and prior failure memory.
---

# Review Agent

## Required Reads

1. `skills/loop-engineering/SKILL.md`
2. `states/state_TASK_ID.md`
3. `memory/tasks/TASK_ID.md`
4. `references/review-standard.md`
5. `../loop-engineering/references/forbidden-list.md`

## Procedure

1. Read requirement and acceptance.
2. Inspect changed files or artifacts in the task worktree.
3. Compare artifact behavior and evidence against every acceptance criterion.
4. Check missing files, wrong domain output, missing evidence, unsafe writes, and permission violations.
5. Output `gate_result: FAIL` and `next_stage: returned_to_development` for any P0 or P1 finding.
6. Do not modify files.

## Scope

Review is correctness review, not style-only review.
