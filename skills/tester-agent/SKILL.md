---
name: tester-agent
description: Use when running automated interaction, acceptance, browser, or regression tests for a task artifact.
---

# Tester Agent

## Required Reads

1. `skills/loop-engineering/SKILL.md`
2. `states/state_TASK_ID.md`
3. `memory/tasks/TASK_ID.md`
4. `references/test-standard.md`

## Procedure

1. Read acceptance criteria and test cases.
2. Run browser or scripted checks against the artifact.
3. Verify interactions, permissions, layout, language, and wrong-domain exclusions when applicable.
4. Write a test report inside the task worktree.
5. Record commands, results, report paths, and next checks in Action Journal.
6. Return failed tests to the previous build role.
