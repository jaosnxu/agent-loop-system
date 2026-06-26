# Loop Engineering Skill

## Purpose

This is the highest-level rule file for `agent-loop-system`. A LOOP task is not a chat request. It is a stateful production workflow driven by task fields, isolated worktrees, role-separated agents, MCP tools, gates, logs, and human approval.

## Canonical Modules

Every LOOP run must preserve these seven modules:

1. Heartbeat: scheduled wake-up, queue/state/event scan, dispatch, no-op logs.
2. Worktree: one task per isolated git worktree and branch.
3. Skill: rules, standards, forbidden actions, acceptance, and role boundaries live in files.
4. Sub-agents: runner, triage, development, prototyper, tester, review, scoring, and human approval are separate responsibilities.
5. MCP connector: tools are permissioned, logged, and gated.
6. State / Memory spine: queue, state, board, logs, evidence, counters, failures, and next action survive restarts.
7. Human gate: high-risk actions pause until approved or rejected.

## Required Task Fields

Prototype and development tasks must include:

- Task ID
- Title
- Type
- Priority
- PRD
- Scope
- Requirement
- Acceptance

If `Requirement` or `Acceptance` is empty for a prototype or development task, stop. Do not use a default template.

## Role Rules

- Triage reads `SKILLS/triage-rules.md`.
- Development reads `SKILLS/code-standard.md` and `SKILLS/forbidden-list.md`.
- Prototyper reads `SKILLS/design-standard.md` and this file.
- Tester reads test cases, acceptance, and this file.
- Review reads `SKILLS/review-standard.md`, `SKILLS/forbidden-list.md`, and this file.
- Scoring reads `SKILLS/review-standard.md`, `SKILLS/triage-rules.md`, and this file.

Every role must record Skill-read evidence in the task state before acting.

## Gate Rules

- Generic syntax checks are not enough.
- Acceptance criteria must be checked one by one.
- Wrong-domain artifacts fail even when they are clickable.
- Missing Skill files fail.
- Missing requirement or acceptance fails.
- Human-gated tasks cannot continue automatically.

## Forbidden

- Writing in the main worktree.
- Using a fixed template that does not match the task requirement.
- Letting the same role develop and approve its own output.
- Calling a high-risk tool operation without human gate.
- Declaring production readiness without real external integration evidence.

## Completion Definition

A task is complete only when:

- Its state file contains the full task context.
- Work happened inside the task worktree.
- Required Skills were read.
- Tool calls were logged.
- Acceptance checks passed.
- Review and scoring passed.
- Required human gates were approved.
- Cleanup ran when required.
