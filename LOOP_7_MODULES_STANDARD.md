# LOOP 7 Modules Standard

Status: standard draft
Date: 2026-06-26
Scope: Heartbeat, Worktree, Skill, Sub-agents, MCP connector, State / Memory spine, Human gate

This document defines the target standard for a production-grade LOOP system. It is not an implementation report. It is the standard used to audit and repair `agent-loop-system`.

## 0. Source Basis

The standard is based on public loop engineering and agent harness practices:

- Addy Osmani, Loop Engineering: heartbeat, worktree isolation, skills, sub-agents, MCP/tool connectors, state, and human gates.
- Addy Osmani, Agent Harness Engineering: harness structure, system prompts, AGENTS files, skills, MCP servers, browser tooling, orchestration, logs, traces, and cost control.
- TrueFoundry, Enterprise Loop Engineering: enterprise agent runtime should find tasks, assign work, check results, record state, and decide next steps.
- MindStudio, Heartbeat Pattern: proactive agents need timed wake-up, context collection, and autonomous follow-up.
- Lenny's Newsletter, Agent Loops: reliable loops need worktrees, skills, connectors/plugins, subagents, and state tracking.

References:

- https://addyosmani.com/blog/loop-engineering/
- https://addyosmani.com/blog/agent-harness-engineering/
- https://www.truefoundry.com/blog/loop-engineering-enterprise-agent-runtime
- https://www.mindstudio.ai/blog/agentic-os-heartbeat-pattern-proactive-ai-agent
- https://www.lennysnewsletter.com/p/how-to-design-ai-agent-loops-schedules

## 1. Heartbeat

### Goal

The system wakes itself on a schedule, scans configured sources, resumes interrupted tasks, dispatches queued tasks, records no-op runs, and exits safely when there is no work.

### Required Files

- `HEARTBEAT.md`: human-readable inspection rules and source filters.
- `config/heartbeat.config.js`: interval, cron, paths, concurrency, safety limits.
- `scripts/heartbeat/heartbeat_once.*`: one bounded run.
- `scripts/heartbeat/heartbeat_daemon.*`: long-running interval mode.
- `scripts/heartbeat/start_heartbeat.*` and `stop_heartbeat.*`: lifecycle control.
- `scripts/heartbeat/install_cron.*` and `uninstall_cron.*`: cron mode.
- `logs/heartbeat.log`: timestamped run log.

### Required Behavior

- Load heartbeat config and heartbeat rules every run.
- Scan local queue, pending state files, returned tasks, and external events.
- Poll GitHub Issues/PRs or configured connectors when enabled.
- Deduplicate external events.
- Dispatch only up to configured concurrency.
- Resume interrupted tasks from state, not from memory or chat.
- If no work exists, log no-op and exit zero.
- If a task is waiting for human approval, do not bypass it.
- If a task hits safety limits, terminate and log the reason.

### Logs

Each heartbeat run must log:

- start timestamp
- config loaded
- sources scanned
- number of events created
- number of tasks dispatched
- no-op result if no work
- failure reason if blocked

### Acceptance

- A single command can run one heartbeat pass.
- A daemon or cron can run without opening a chat.
- A pending task is dispatched.
- No pending task produces a timestamped no-op.
- A human-gated task remains paused.
- Duplicate GitHub events do not create duplicate tasks.

### Incomplete If

- It only runs when a human opens a chat.
- It scans only one source and ignores queue/state.
- It cannot resume interrupted tasks.
- It does not log no-op runs.
- It can bypass human approval.

## 2. Worktree

### Goal

Every task runs in an isolated git worktree and branch. Main workspace writes are blocked. Cleanup happens after completion, failure, timeout, or rejection.

### Required Files

- `scripts/worktree/create_worktree.sh`
- `scripts/worktree/assert_worktree.sh`
- `scripts/worktree/clean_worktree.sh`
- state field: `Worktree Path`
- state field: `Branch`
- tool permission rule requiring write targets under task worktree

### Required Behavior

- Create `../worktrees/TASK_ID/`.
- Create branch `task/TASK_ID`.
- Support empty repo bootstrap when no initial commit exists.
- Deny write operations outside the task worktree.
- Deny write operations in the main worktree.
- Record worktree path and branch in state.
- Clean worktree and branch after completed, failed, terminated, timed out, or human rejected tasks.

### Logs

Worktree actions must log:

- created path
- branch
- cleanup status
- failed cleanup reason
- blocked main-worktree write attempt

### Acceptance

- Creating a task creates an isolated worktree.
- Write assertion passes inside worktree.
- Write assertion fails in main workspace.
- Cleanup removes worktree and branch.
- Failed task also cleans resources.

### Incomplete If

- It creates folders but no real git worktree.
- It does not block main workspace writes.
- Cleanup is manual only.
- Failed tasks leave branches or directories behind.

## 3. Skill

### Goal

Rules, role boundaries, coding standards, review rules, forbidden actions, product rules, and acceptance rules live in files that every agent reads before acting.

### Required Files

- `skills/loop-engineering/SKILL.md`
- `skills/development-agent/SKILL.md`
- `skills/review-agent/SKILL.md`
- `skills/triage-agent/SKILL.md`
- `skills/loop-engineering/references/forbidden-list.md`
- product/design skills such as `skills/prototyper-agent/SKILL.md`

### Required Behavior

- Each role reads its required Skill files before acting.
- Skill files define task format, acceptance handling, forbidden actions, and gate rules.
- Updating a Skill file changes future behavior without editing code.
- LOOP task entry must preserve PRD, scope, requirement, acceptance, forbidden scope, and test expectations.
- Skills must say what to do when requirements are missing: block, do not guess.

### Logs

Each role run must log:

- skill files read
- task state file read
- missing required skill
- version or checksum if available

### Acceptance

- A task can prove which Skill files were read.
- Missing required Skill blocks the role.
- A changed Skill changes next run behavior.
- Agent output references requirement and acceptance from state.

### Incomplete If

- Skills exist but are not read.
- Role prompts mention standards but scripts ignore them.
- Rules are hardcoded only in scripts.
- Agents can run with empty requirement or acceptance.

## 4. Sub-agents

### Goal

Responsibilities are separated. The same role cannot write, review, test, score, and approve its own work.

### Required Roles

- Main runner / orchestrator
- Triage agent
- Developer agent
- Prototyper agent
- Tester agent
- Review agent
- Scoring agent
- Human approver

### Required Behavior

- Main runner only coordinates state, worktree, tools, retries, gates.
- Triage classifies and routes tasks.
- Developer writes code only inside task worktree.
- Prototyper produces prototype only from task requirement.
- Tester runs tests from acceptance criteria.
- Review is read-only and checks against requirement and acceptance.
- Scoring scores each acceptance criterion and cannot edit code.
- A failed review or score returns to development/prototyping.

### Logs

Each role must log:

- role name
- task id
- input context summary
- tools used
- output artifact
- pass/fail decision

### Acceptance

- Development and review are separate tool permissions.
- Review cannot write files.
- Tester cannot edit prototype source.
- Score fails if acceptance evidence is missing.
- A wrong-domain artifact is blocked even if generic smoke tests pass.

### Incomplete If

- Roles are only Markdown prompts and never invoked separately.
- The developer self-approves.
- Review has write access.
- Scoring ignores acceptance.
- Gate only checks syntax or clickability.

## 5. MCP Connector

### Goal

Agents interact with real tools through controlled connectors. Tool calls are permissioned, logged, and gated.

### Required Tool Classes

- Filesystem: read/write inside allowed paths.
- Shell: command execution with role restrictions.
- GitHub: issues, PRs, commits, reviews, CI status.
- Browser/testing: open page, click, type, assert UI, screenshot.
- Optional: docs, database, Slack/Telegram, deployment, CI.

### Required Files

- `config/mcp.config.json`
- `config/tool-permissions.json`
- `scripts/mcp/start_mcp.sh`
- `scripts/mcp/stop_mcp.sh`
- `scripts/mcp/verify_mcp.sh`
- `scripts/mcp/mcp_tool.*` or real MCP client wrapper
- `logs/tool-calls.log`
- `logs/mcp-*.log`

### Required Behavior

- Role-based tool permissions.
- Review role is read-only.
- Developer may write only in task worktree or allowed target.
- Browser tester can run real interaction tests.
- GitHub token is read from env, never hardcoded.
- All tool calls are logged.
- Critical operations require human gate.

### Logs

Each tool call must log:

- role
- tool
- operation
- target
- result
- error reason if blocked

### Acceptance

- Verify script performs real file read/write, shell execution, GitHub read, and browser test if configured.
- Review write attempt is blocked.
- Out-of-scope file path is blocked.
- Tool call logs prove every action.

### Incomplete If

- MCP config exists but tools are simulated only.
- Verify checks only process existence.
- Browser testing is not available.
- Permissions are documented but not enforced.
- Tool calls are not logged.

## 6. State / Memory Spine

### Goal

The LOOP survives interruption. State records what happened, what failed, what is next, budget counters, evidence, and gate status.

### Required Files

- `queue/queue.json`
- `states/state_TASK_ID.md`
- `task-board.md`
- `logs/state.log`
- `logs/queue.log`
- `logs/orchestrator.log`
- `logs/gate.log`
- `logs/error.log`
- `templates/state_TEMPLATE.md`

### Required State Fields

- Task ID
- Current Stage
- Task Type
- Priority
- PRD
- Scope
- Requirement
- Acceptance
- Created At
- Updated At
- Iteration Count
- No Progress Count
- Token Budget Used
- Tool Call Count
- Risk Level
- Assigned Role
- Worktree Path
- Branch
- Completed Steps
- Failure Records
- Next Action
- Gate Status
- Evidence

### Required Behavior

- Task creation writes a state file.
- Every stage transition updates state.
- Every failure appends a failure record.
- Every gate result is written.
- Resume reads state, not chat history.
- Queue and board stay synchronized.
- No-progress, iteration, token, and tool-call limits are enforced.

### Logs

State logs must include:

- state created
- state resumed
- stage updated
- failure recorded
- task completed
- task terminated
- board synced

### Acceptance

- Kill and rerun resumes from last completed stage.
- A failed task records failure and next action.
- Queue status and board status match state.
- Safety brake terminates with reason.
- Requirement and acceptance survive from queue to state to gate.

### Incomplete If

- State only stores task id/title.
- Resume repeats completed steps.
- Failure reasons are overwritten.
- Queue and board disagree.
- Requirement/acceptance are lost.

## 7. Human Gate

### Goal

High-risk actions pause automatically and require explicit human approval or rejection. Approval decisions are logged and stateful.

### High-risk Actions

- Merge to main
- Delete files or branches outside cleanup policy
- Deploy to production
- Send external notifications
- Modify permissions
- Access or export sensitive data
- Approve business prototype
- Apply legal/financial final decision

### Required Files

- `scripts/human/approve_task.sh`
- `scripts/human/reject_task.sh`
- state field: `Human Gate`
- logs: `state.log`, `orchestrator.log`, `tool-calls.log`

### Required Behavior

- High-risk action sets `Current Stage: pending_human`.
- State records operation waiting for approval.
- Approve continues from the correct next stage.
- Reject terminates and cleans worktree.
- Approval/rejection writes actor, time, reason, and result where possible.
- No script may bypass pending human gate.

### Acceptance

- Prototype task stops before formal development.
- Merge task stops before merge.
- Approve resumes.
- Reject terminates.
- Logs and state prove who/what/when/why.

### Incomplete If

- Human gate is just a note in README.
- Task continues after pending approval.
- Approval does not resume from state.
- Rejection does not clean resources.
- No approval audit trail exists.

## 8. Production LOOP Definition

A LOOP system is production-ready only when all are true:

1. Heartbeat can wake, scan, dispatch, and no-op without chat.
2. Worktree isolation is enforced before writes.
3. Skills are mandatory inputs, not optional docs.
4. Sub-agents are role-separated with separate permissions and outputs.
5. MCP connectors execute real tools with logs and role permissions.
6. State spine can resume from interruption and prove every step.
7. Human gate cannot be bypassed.
8. Requirement and acceptance flow from task entry to final gate.
9. Wrong-domain outputs fail even if generic tests pass.
10. Verification commands exist for each module.
