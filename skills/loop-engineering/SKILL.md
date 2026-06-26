---
name: loop-engineering
description: Use for every Agent LOOP task that involves heartbeat, queue, worktree isolation, subagents, MCP tools, external memory, gates, retries, or human approval.
---

# Loop Engineering

## Required Reads

1. `states/state_TASK_ID.md`
2. `memory/tasks/TASK_ID.md`
3. Active role Skill under `skills/<role>/SKILL.md`
4. Active role prompt under `prompts/agents/`

## Operating Rules

1. State defines what to do.
2. External memory defines what already happened.
3. Write only inside `../worktrees/TASK_ID/`.
4. Record every meaningful action in Action Journal.
5. On failure, record root cause, fix plan, next checks, and retry ledger before retrying.
6. Retry at most 3 times for the same unresolved failure class.
7. Never skip review, scoring, state writes, memory writes, or human gates.

## Required Action Journal Events

- Skill, state, and memory reads.
- Worktree create or clean.
- Tool calls.
- File reads and writes.
- Gate runs.
- Review and scoring decisions.
- Failure, root cause, fix plan, and retry attempts.
- Human gate approval or rejection.

## Completion Gate

A LOOP task is complete only when state, memory, logs, gates, review, scoring, and cleanup all agree.
