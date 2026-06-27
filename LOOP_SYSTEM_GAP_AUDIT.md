# LOOP System Gap Audit

Status: audit draft  
Date: 2026-06-26  
System: `/Users/xuyongwenmacbookpro/Documents/1万gstack/agent-loop-system`  
Standard: `LOOP_7_MODULES_STANDARD.md`  

## 0. Gate Conclusion

Current status:

`PARTIAL_LOOP_RUNTIME / NOT_PRODUCTION_READY`

Plain conclusion:

The system is not fake-empty. It has a real local LOOP skeleton with heartbeat scripts, worktree scripts, Skill files, state files, queue, MCP wrapper, gates, and human approval scripts.

But it is not yet a complete production LOOP system. The biggest gaps are:

1. Sub-agents now have a provider-aware delegate runner, Codex active by default, and structured result records, but role result parsing still needs stronger production hardening.
2. MCP browser testing has a Playwright/static fallback runner and a required-Playwright mode, but GitHub write/CI governance still needs hardening.
3. GitHub/MCP production flow is only partly real.
4. Heartbeat now has supervisor classification, but recovery policy is still conservative.
5. Skill enforcement now uses standard `skills/*/SKILL.md` files and records role reads with sha256 evidence.
6. Human gate now records actor, operation, reason, decision, and gate id, but still needs a richer approval queue UI.

## 1. Module Audit Summary

| Module | Current Grade | Current Reality | Production Gap |
|---|---:|---|---|
| Heartbeat | B | Has heartbeat rules, config, once/daemon/cron scripts, supervisor classification, GitHub polling fixture/API path, queue dispatch | Needs stronger recovery policy, external connector matrix, and no-progress remediation |
| Worktree | B+ | Has create/assert/clean, branch naming, orphan fallback, cleanup, matrix verification, residue monitor | Needs mandatory assert coverage on every future write integration |
| Skill | B+ | Uses standard `skills/*/SKILL.md` files, agent prompts, role read logs, and sha256 evidence | Needs stronger changed-Skill behavior fixture and checksum drift reporting |
| Sub-agents | B- | Has role prompts, stage names, provider-aware delegate runner, Codex active provider, and structured result JSON | Needs provider-specific smoke tests beyond Codex and stronger review/test/score parsing |
| MCP connector | B | Has MCP wrapper, permissions, logs, filesystem/shell/GitHub/browser basics, required-Playwright mode, install/start/verify scripts | Needs stronger GitHub write/PR/CI governance and approval continuation fixtures |
| State / Memory spine | B | Has queue, state, board, logs, resume, counters, requirement/acceptance propagation | Needs stronger no-progress accounting, queue-board-state consistency checks, richer evidence schema, artifact links |
| Human gate | B | Has approve/reject scripts, pending_human, merge/prototype pause, audit ledger, actor/reason/operation/gate id evidence | Needs richer approval queue/report UI and broader non-bypass fixture matrix |

## 2. Heartbeat Audit

### Existing Files

- `HEARTBEAT.md`
- `config/heartbeat.config.js`
- `scripts/heartbeat/heartbeat_once.mjs`
- `scripts/heartbeat/heartbeat_daemon.mjs`
- `scripts/heartbeat/start_heartbeat.sh`
- `scripts/heartbeat/stop_heartbeat.sh`
- `scripts/heartbeat/install_cron.sh`
- `scripts/heartbeat/uninstall_cron.sh`
- `scripts/heartbeat/github_events.mjs`
- `logs/heartbeat.log`

### What It Really Does Now

- Reads `HEARTBEAT.md`.
- Logs heartbeat start and no-op.
- Polls GitHub events via config or fixture.
- Scans `states/state_*.md` for `pending` and `returned_to_development`.
- Runs `scripts/queue/run_next.mjs`.
- Has daemon interval mode.
- Has cron install scripts.

### What Is Missing

- No full supervisor model: it does not deeply classify stuck/running/pending_human/failed tasks.
- No heartbeat-specific regression script that proves no-op, queue dispatch, GitHub dedupe, and human gate skip in one command.
- No clear stale-running detection.
- No robust external connector matrix beyond GitHub fixture/API.
- No heartbeat metrics summary.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Add `scripts/heartbeat/verify_heartbeat.sh` covering no-op, queued task dispatch, GitHub fixture dedupe, and pending_human skip |
| P0 | Add stale task detection and log `heartbeat_stale_running` without unsafe continuation |
| P1 | Add connector source registry for GitHub/CI/docs/browser queue events |
| P1 | Add heartbeat status summary command |

### Acceptance

- `scripts/heartbeat/verify_heartbeat.sh` passes.
- Heartbeat can run without chat and dispatch one queued task.
- Human-gated task is not resumed automatically.
- Duplicate GitHub fixture event is ignored.

## 3. Worktree Audit

### Existing Files

- `scripts/worktree/create_worktree.sh`
- `scripts/worktree/assert_worktree.sh`
- `scripts/worktree/clean_worktree.sh`
- `scripts/worktree/verify_worktree.sh`
- `scripts/worktree/monitor_residue.sh`

### What It Really Does Now

- Creates `../worktrees/TASK_ID`.
- Creates `task/TASK_ID` branch.
- Supports orphan worktree for empty repos.
- Asserts current path contains `/worktrees/`.
- Cleans worktree and branch.
- Verifies create/assert-main-fails/assert-worktree-passes/MCP write/clean in one command.
- Monitors task branches and worktree directories without state files.

### What Is Missing

- Not every future write integration is guaranteed to call the same assertion path.
- Cleanup is called in orchestrator catch paths, but needs a broader failure matrix over every task type.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Keep all new write paths routed through MCP filesystem write or `assert_worktree.sh` |
| P1 | Expand cleanup verification across prototype, changelog, failed review, safety brake, and rejection |

### Acceptance

- Main workspace write attempt is blocked.
- Worktree write attempt is allowed only inside task worktree.
- Cleanup removes branch and directory.
- Residue monitor reports no orphan task branch or task worktree.

## 4. Skill Audit

### Existing Files

- `skills/loop-engineering/SKILL.md`
- `skills/development-agent/SKILL.md`
- `skills/review-agent/SKILL.md`
- `skills/triage-agent/SKILL.md`
- `skills/loop-engineering/references/forbidden-list.md`
- `skills/prototyper-agent/SKILL.md`
- `skills/tester-agent/SKILL.md`
- `skills/scoring-agent/SKILL.md`
- `prompts/agents/*.md`
- `scripts/agents/verify_skills_standard.sh`
- `scripts/agents/verify_skill_checksums.sh`
- `scripts/gate/skill_check.mjs`

### What It Really Does Now

- Standard Skill directories exist with YAML frontmatter.
- Role docs and prompts tell agents what to read.
- `scripts/agents/run_agent.mjs` reads `skills/loop-engineering/SKILL.md` and the role-specific Skill before delegation.
- Role runs write Skill-read evidence with bytes and sha256 into task state Action Journal and Evidence.
- `scripts/gate/skill_check.mjs` blocks when required Skill files are missing.
- `scripts/agents/verify_skills_standard.sh` verifies the standard layout and blocks legacy uppercase Skill paths.
- `scripts/agents/verify_skill_checksums.sh` proves checksum evidence reaches state and task memory.
- Design standard contains Russian/default/server binding rules.
- Prompt files now require requirement/acceptance.

### What Is Missing

- No dedicated fixture proving a changed Skill changes subsequent task behavior.
- No checksum drift comparison report across task iterations.

### Required Fixes

| Priority | Fix |
|---|---|
| P1 | Add a fixture proving changed Skill content is read on the next role run |
| P1 | Include Skill checksum drift comparison in task memory evidence |

### Acceptance

- Every role run records Skill files read and their sha256 checksums.
- Missing `skills/loop-engineering/SKILL.md` blocks execution.
- Updating Skill changes subsequent task behavior.

## 5. Sub-agents Audit

### Existing Files

- `prompts/agents/triage-agent.md`
- `prompts/agents/development-agent.md`
- `prompts/agents/prototyper.md`
- `prompts/agents/tester.md`
- `prompts/agents/review-agent.md`
- `prompts/agents/scoring-agent.md`
- `scripts/agents/run_agent.mjs`
- `scripts/agents/codex_delegate.mjs`
- `scripts/agents/verify_agent_result_schema.sh`
- `scripts/agents/verify_model_providers.sh`
- `config/codex.config.json`
- `scripts/orchestrator/run_task.mjs`

### What It Really Does Now

- Stages exist in the orchestrator.
- Prompt files describe role boundaries.
- `scripts/agents/run_agent.mjs` prepares role-specific context and mandatory Skill reads.
- `scripts/agents/codex_delegate.mjs` can invoke the active provider per role and store separate prompt/result artifacts under `logs/codex/`.
- Each delegate run writes `logs/codex/TASK.ROLE.result.json` with `schemaVersion`, `taskId`, `role`, `provider`, `status`, `decision`, and raw result path.
- `config/codex.config.json` declares provider slots for `codex`, `claude`, `opencode`, and `gemini`; only Codex is enabled by default.
- Review/scoring gates exist as scripted stages and can consume delegated role outputs.
- Prototype/test stages exist.

### What Is Missing

- Context isolation still needs stricter role-specific context minimization.
- Only Codex is verified as a live model provider; Claude/Gemini/OpenCode slots exist but remain disabled until their local CLI contracts are verified.
- Failure feedback exists, but root-cause-to-fix-plan parsing is still partly script-driven and not fully schema-enforced.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Make review and scoring consume structured result JSON plus gate output and acceptance |
| P1 | Add provider-specific smoke tests for Claude/OpenCode/Gemini after their local CLIs are installed |
| P1 | Strengthen retry loop so root cause, fix plan, and next checks are parsed from each failed role result |

### Acceptance

- Development and review are separate executions.
- Review cannot write files.
- Tester output is a real report.
- Scoring lists each acceptance criterion.
- Same role cannot self-approve.

## 6. MCP Connector Audit

### Existing Files

- `config/mcp.config.json`
- `config/tool-permissions.json`
- `scripts/mcp/install_deps.sh`
- `scripts/mcp/start_mcp.sh`
- `scripts/mcp/stop_mcp.sh`
- `scripts/mcp/verify_mcp.sh`
- `scripts/mcp/mcp_tool.mjs`
- `scripts/mcp/shell_server.mjs`
- `scripts/mcp/browser_test.mjs`
- `logs/tool-calls.log`
- `logs/mcp-filesystem.log`
- `logs/mcp-shell.log`

### What It Really Does Now

- Filesystem read/write wrapper exists.
- Shell execution wrapper exists.
- GitHub read operation exists.
- Browser test operation exists and uses Playwright when installed, otherwise explicit `static_fallback`.
- Browser test supports required-Playwright mode for final UI acceptance.
- Role permissions exist.
- Review write is blocked by permissions.
- Readonly shell blocks mutating command patterns.
- Critical operations return `HUMAN_GATE_REQUIRED` before execution.
- Tool calls are logged.

### What Is Missing

- GitHub write operations such as PR creation/review are not executed in automated verification because they are high-risk and should route through human gate.
- CI governance is read-only verified through Actions runs, but not yet tied to merge approval policy.
- Critical operation human gate is central, but approval continuation needs more operation-specific fixtures.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Add operation-specific human-gate continuation fixtures |
| P1 | Expand GitHub write operations behind human gate: PR create, PR review, merge readiness |
| P1 | Tie CI read evidence to approval and merge gates |

### Acceptance

- Browser test opens prototype with Playwright for final UI acceptance, clicks, types, asserts, and reports mode.
- Review role write is blocked.
- Shell readonly cannot mutate files.
- Critical operation returns pending_human instead of executing.

## 7. State / Memory Spine Audit

### Existing Files

- `queue/queue.json`
- `scripts/queue/*.mjs`
- `states/state_*.md`
- `templates/state_TEMPLATE.md`
- `task-board.md`
- `scripts/state/*.mjs`
- `logs/state.log`
- `logs/queue.log`
- `logs/orchestrator.log`
- `logs/gate.log`
- `logs/error.log`

### What It Really Does Now

- Queue exists.
- Queue add supports PRD/scope/requirement/acceptance.
- State files include PRD/scope/requirement/acceptance.
- Stage updates append completed steps.
- Resume state returns fields.
- Board sync exists.
- Safety brake checks counters.
- Gate logs acceptance checks.

### What Is Missing

- No-progress count is not deeply calculated from artifact diffs or repeated failure signatures.
- Evidence is free text, not structured.
- Queue-state-board consistency has no standalone verifier.
- Token budget is recorded but not connected to actual model/provider usage.
- Old bad state files may remain and confuse board.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Add `scripts/state/verify_spine.mjs` checking queue/state/board/log consistency |
| P0 | Add structured evidence format for artifact path, gate, role, result |
| P1 | Implement real no-progress detection based on repeated failure and unchanged artifact hash |
| P1 | Connect token/tool budget to real provider/tool usage |

### Acceptance

- A killed task resumes from last stage.
- A failed task records failure and next action.
- Queue, state, and board agree.
- Repeated no-progress terminates.

## 8. Human Gate Audit

### Existing Files

- `scripts/human/approve_task.sh`
- `scripts/human/reject_task.sh`
- `scripts/human/record_gate.mjs`
- `scripts/human/verify_human_gate_audit.sh`
- `scripts/human/list_pending.sh`
- state `Human Gate`
- orchestrator `pending_human`
- `logs/human-gate.log`

### What It Really Does Now

- Prototype testing success can stop at `pending_human`.
- Changelog merge can require approval.
- Approve resumes task.
- Reject terminates and cleans worktree.
- Pending, approved, and rejected decisions record actor, operation, reason, decision, and gate id.
- Human gate audit is written to state, memory, and `logs/human-gate.log`.
- Critical MCP operations return `HUMAN_GATE_REQUIRED` instead of executing.

### What Is Missing

- Approval queue is CLI-only; no UI.
- Approval continuation fixtures cover changelog/rejection but not every future critical operation.
- Critical MCP operations are blocked centrally, but do not yet create a durable approval request record automatically for every operation.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Convert every MCP critical operation block into a durable approval request |
| P1 | Add approval queue/report UI beyond `list_pending.sh` |
| P1 | Expand non-bypass fixtures for each critical operation type |

### Acceptance

- High-risk operation creates pending approval record.
- Approve resumes from correct stage.
- Reject terminates and cleans worktree.
- Logs show actor, reason, operation, decision, and gate id.

## 9. Repair Priority Order

Do not jump directly to business tasks. Repair in this order:

1. Sub-agents: make review/scoring consume structured result JSON and gate evidence.
2. GitHub: add PR create/update/CI decision flow behind human gate.
3. Heartbeat: add recovery policy for stale running and repeated no-progress tasks.
4. Human gate: add approval queue/report UI and fixtures for each critical operation type.
5. State: add artifact hash drift and no-progress detection based on unchanged outputs.
6. Worktree: expand cleanup verification across every task type and failure branch.
7. Skill: add changed-Skill behavior fixture and checksum drift comparison.

## 10. Minimum Next Repair Batch

The smallest useful repair batch is:

1. Structured review/scoring parser over `logs/codex/TASK.ROLE.result.json`.
2. GitHub PR create and CI read flow that stops at human approval before merge.
3. Stale task remediation policy in heartbeat supervisor.
4. Human approval report for `queue/human-approvals.json`.
5. Artifact hash and no-progress verifier.
6. Cleanup matrix for prototype, changelog, review failure, safety brake, and rejection.
7. Changed-Skill behavior smoke test.

After those exist and pass, the system can be called a stronger local LOOP runtime. It still should not be called a complete production autonomous software factory until model-backed sub-agent execution and real external integrations are proven.
