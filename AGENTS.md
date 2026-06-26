# Agent Loop System

## Scope

This directory defines a production-grade agent loop control system for CHUCHUTEA software delivery. It is separate from product source code. The loop system owns task intake, isolation, role routing, state tracking, and gate enforcement.

## Required Runtime Shape

Every task must move through this DAG:

`triage -> development -> review -> scoring -> gate_passed | returned_to_development | blocked`

## Role Boundary

- Triage Agent: classify, prioritize, assign, and register tasks only.
- Development Agent: change files only inside a task worktree.
- Review Agent: inspect outputs and produce findings only; read-only by default.
- Scoring Agent: score against acceptance criteria only; no code edits.

No agent may approve its own work. No agent may bypass skill files, state updates, worktree checks, or gates.

## Mandatory Reads

Before any role acts, it must read:

- `SKILLS/agent-roles.md`
- Its role-specific skill file:
  - Triage: `SKILLS/triage-rules.md`
  - Development: `SKILLS/code-standard.md` and `SKILLS/forbidden-list.md`
  - Review: `SKILLS/review-standard.md` and `SKILLS/forbidden-list.md`
  - Scoring: `SKILLS/review-standard.md`, `SKILLS/triage-rules.md`, and `SKILLS/forbidden-list.md`
- The task state file at `states/state_TASK_ID.md`

## Prompt Files

- Triage Agent: `prompts/agents/triage-agent.md`
- Development Agent: `prompts/agents/development-agent.md`
- Review Agent: `prompts/agents/review-agent.md`
- Scoring Agent: `prompts/agents/scoring-agent.md`
- Prototyper Agent: `prompts/agents/prototyper.md`
- Tester Agent: `prompts/agents/tester.md`

## Safety Rules

- Write operations are forbidden in the main repository worktree.
- High-risk actions must be marked `HUMAN_CONFIRMATION_REQUIRED`.
- Failed, timed-out, or completed task worktrees must be cleaned by `scripts/worktree/clean_worktree.sh`.
- State updates are mandatory at task creation, phase transition, step completion, failure, and closure.
