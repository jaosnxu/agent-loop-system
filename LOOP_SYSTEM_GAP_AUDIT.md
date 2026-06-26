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

1. Sub-agents now have a Codex delegate runner, but role isolation and result parsing still need stronger production hardening.
2. MCP browser testing has a Playwright/static fallback runner, but production browser evidence and GitHub write/CI flows need more hardening.
3. GitHub/MCP production flow is only partly real.
4. Heartbeat dispatch is basic and not yet a robust autonomous supervisor.
5. Skill enforcement now uses standard `skills/*/SKILL.md` files and records role reads, but still needs version/checksum evidence.
6. Human gate exists, but approval audit details are thin.

## 1. Module Audit Summary

| Module | Current Grade | Current Reality | Production Gap |
|---|---:|---|---|
| Heartbeat | B- | Has heartbeat rules, config, once/daemon/cron scripts, GitHub polling fixture/API path, queue dispatch | Needs stronger supervisor behavior, recovery policy, external connector matrix, no-progress detection, and heartbeat verification suite |
| Worktree | B | Has create/assert/clean, branch naming, orphan fallback, cleanup | Needs mandatory assert before every write path, cleanup verification on all failure branches, branch/worktree residue monitor |
| Skill | B | Uses standard `skills/*/SKILL.md` files and agent prompts | Needs version/checksum logs and broader skill verification fixtures |
| Sub-agents | C | Has role prompts and stage names | Needs real isolated runner per role, model invocation, role-specific context passing, independent review/test/score outputs |
| MCP connector | B- | Has MCP wrapper, permissions, logs, filesystem/shell/GitHub/browser basics, install/start/verify scripts | Needs stronger GitHub PR/CI workflows, guaranteed real-browser mode, and broader operation fixtures |
| State / Memory spine | B | Has queue, state, board, logs, resume, counters, requirement/acceptance propagation | Needs stronger no-progress accounting, queue-board-state consistency checks, richer evidence schema, artifact links |
| Human gate | B- | Has approve/reject scripts, pending_human, merge/prototype pause | Needs actor/reason audit, operation-specific approvals, non-bypass tests, UI/queue for approvals |

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

### What It Really Does Now

- Creates `../worktrees/TASK_ID`.
- Creates `task/TASK_ID` branch.
- Supports orphan worktree for empty repos.
- Asserts current path contains `/worktrees/`.
- Cleans worktree and branch.

### What Is Missing

- Not every write path calls `assert_worktree.sh` first.
- MCP filesystem write enforces allowed path, but not always git worktree identity.
- No residue verification command for all task branches/directories.
- Cleanup is called in orchestrator catch paths, but needs a complete matrix test.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Enforce worktree assertion inside filesystem write tool for task writes |
| P0 | Add `scripts/worktree/verify_worktree.sh` covering create/assert-main-fails/assert-worktree-passes/clean |
| P1 | Add residue monitor for `task/*` branches and `../worktrees/*` |

### Acceptance

- Main workspace write attempt is blocked.
- Worktree write attempt is allowed only inside task worktree.
- Cleanup removes branch and directory.

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
- `scripts/gate/skill_check.mjs`

### What It Really Does Now

- Standard Skill directories exist with YAML frontmatter.
- Role docs and prompts tell agents what to read.
- `scripts/agents/run_agent.mjs` reads `skills/loop-engineering/SKILL.md` and the role-specific Skill before delegation.
- Role runs write Skill-read evidence into task state Action Journal and Evidence.
- `scripts/gate/skill_check.mjs` blocks when required Skill files are missing.
- `scripts/agents/verify_skills_standard.sh` verifies the standard layout and blocks legacy uppercase Skill paths.
- Design standard contains Russian/default/server binding rules.
- Prompt files now require requirement/acceptance.

### What Is Missing

- No Skill version/checksum logging.
- No dedicated fixture proving a changed Skill changes subsequent task behavior.
- No checksum drift report in task evidence.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Log Skill checksum/version per role |
| P1 | Add a fixture proving changed Skill content is read on the next role run |
| P1 | Include Skill checksum drift in task memory evidence |

### Acceptance

- Every role run records Skill files read and their checksums.
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
- `config/codex.config.json`
- `scripts/orchestrator/run_task.mjs`

### What It Really Does Now

- Stages exist in the orchestrator.
- Prompt files describe role boundaries.
- `scripts/agents/run_agent.mjs` prepares role-specific context and mandatory Skill reads.
- `scripts/agents/codex_delegate.mjs` can invoke Codex per role and store separate prompt/result artifacts under `logs/codex/`.
- Review/scoring gates exist as scripted stages and can consume delegated role outputs.
- Prototype/test stages exist.

### What Is Missing

- Context isolation still needs stronger per-role evidence and stricter artifact parsing.
- Only Codex is wired as a live model provider; Claude/Gemini/OpenCode provider switching is not implemented.
- Role outputs are stored under `logs/codex/`, but not yet normalized into a structured artifact schema.
- Failure feedback exists, but root-cause-to-fix-plan parsing is still partly script-driven.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Normalize role outputs under `states/artifacts/TASK_ID/ROLE.md` or task worktree `reports/` |
| P0 | Make review and scoring parse structured developer output, gate output, and acceptance |
| P1 | Add model provider config for Codex/Claude/OpenCode |
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
- Role permissions exist.
- Review write is blocked by permissions.
- Readonly shell blocks mutating command patterns.
- Critical operations return `HUMAN_GATE_REQUIRED` before execution.
- Tool calls are logged.

### What Is Missing

- GitHub PR creation/review/CI flow is not fully exercised.
- Browser runner can fall back to static checks when Playwright is unavailable; production proof should require real Playwright mode for UI tasks.
- Verify script needs broader GitHub write-operation and CI evidence.
- Critical operation human gate is central, but approval continuation needs more operation-specific fixtures.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Require real Playwright mode for prototype/UI acceptance tasks or mark static fallback as non-final |
| P0 | Add operation-specific human-gate continuation fixtures |
| P1 | Expand GitHub operations: issue read, PR create, PR review, CI status |
| P1 | Expand `verify_mcp.sh` to prove GitHub write/CI flows and approval continuation |

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
- state `Human Gate`
- orchestrator `pending_human`

### What It Really Does Now

- Prototype testing success can stop at `pending_human`.
- Changelog merge can require approval.
- Approve resumes task.
- Reject terminates and cleans worktree.

### What Is Missing

- No actor identity capture.
- Approval reason is optional and thin.
- Human gate is not enforced centrally for all critical tool operations.
- No approval queue/report command.
- No test proving a critical MCP operation pauses instead of executing.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Add approval metadata: actor, reason, operation, requestedAt, decidedAt |
| P0 | Enforce human gate from MCP critical operations |
| P1 | Add `scripts/human/list_pending.sh` |
| P1 | Add `scripts/human/verify_human_gate.sh` |

### Acceptance

- High-risk operation creates pending approval record.
- Approve resumes from correct stage.
- Reject terminates and cleans worktree.
- Logs show actor, reason, and operation.

## 9. Repair Priority Order

Do not jump directly to business tasks. Repair in this order:

1. Skill: add formal `loop-engineering` Skill and skill-read gate.
2. Sub-agents: add real role runner and output artifacts.
3. MCP: add browser testing and central human-gate enforcement.
4. State: add spine consistency verifier and structured evidence.
5. Heartbeat: add heartbeat verification and stale task policy.
6. Worktree: enforce worktree assertion in all write paths.
7. Human gate: add approval metadata and pending list.

## 10. Minimum Next Repair Batch

The smallest useful repair batch is:

1. `skills/loop-engineering/SKILL.md`
2. `scripts/gate/skill_check.mjs`
3. `scripts/agents/run_agent.mjs`
4. `scripts/mcp/browser_test.mjs` or Playwright MCP bridge
5. `scripts/state/verify_spine.mjs`
6. `scripts/heartbeat/verify_heartbeat.sh`
7. `scripts/human/list_pending.sh`

After those exist and pass, the system can be called a stronger local LOOP runtime. It still should not be called a complete production autonomous software factory until model-backed sub-agent execution and real external integrations are proven.
