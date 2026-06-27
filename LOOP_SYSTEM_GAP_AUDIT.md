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

1. Sub-agents now have a provider-aware delegate runner, Codex as the default configured provider, structured result records, and review/scoring structured decision routing. Model delegation is still explicitly disabled unless `AGENT_LOOP_CODEX_ENABLED=1` or config enables it.
2. MCP browser testing has a Playwright/static fallback runner and a required-Playwright mode; GitHub read checks, write-intent human gate, and merge readiness gate are verified.
3. GitHub/MCP production flow is partly real: reads, approval blocking, approval resolution, read-only readiness decisions, and PR create/review/merge continuation dry-run/live-gate framework are proven. Actual live writes remain intentionally unexecuted in automated verification.
4. Heartbeat now has supervisor classification, stale-running remediation, no-progress termination, point-in-time status summary, JSONL metrics, trend reporting, source registry, GitHub polling, CI/docs/browser fixture ingestion, HTTP JSON live connector ingestion, and queue dispatch checks.
5. Skill enforcement uses standard `skills/*/SKILL.md` files, records role reads with sha256 evidence, and has a Skill drift fixture.
6. Human gate records actor, operation, reason, decision, gate id, durable approval requests, CLI approval report, local approval UI, operator RBAC, PR continuation, filesystem delete continuation, and notification continuation, but still needs production identity integration and broader critical-operation coverage.

## 1. Module Audit Summary

| Module | Current Grade | Current Reality | Production Gap |
|---|---:|---|---|
| Heartbeat | A- | Has heartbeat rules, config, once/daemon/cron scripts, supervisor classification, stale-running remediation, no-progress termination, status summary, JSONL metrics, trend report, source registry, GitHub fixture/API path, CI/docs/browser fixture sources, HTTP JSON connector sources, queue dispatch | Needs product-specific connector configs/credentials and longer operational dashboards |
| Worktree | A- | Has create/assert/clean, branch naming, orphan fallback, cleanup matrix verification, residue monitor | Needs mandatory assert coverage on every future write integration |
| Skill | A- | Uses standard `skills/*/SKILL.md`, role read logs, sha256 evidence, checksum verifier, and Skill drift fixture | Needs richer checksum drift reports across long-running tasks |
| Sub-agents | B | Has role prompts, stage names, provider-aware delegate runner, Codex default provider slot, structured result JSON, and review/scoring decision parsing | Needs explicit model-delegation enablement, provider-specific smoke tests beyond Codex, and stricter context minimization |
| MCP connector | A- | Has MCP wrapper, permissions, logs, filesystem/shell/GitHub/browser basics, required-Playwright mode, install/start/verify scripts, GitHub PR/CI read, write-intent human gate, merge readiness gate, and PR create/review/merge dry-run/live continuation framework | Needs live write verification in a safe staging repository |
| State / Memory spine | B+ | Has queue, state, board, logs, resume, counters, requirement/acceptance propagation, action journal, artifact hashes, no-progress accounting | Needs token budget tied to real provider usage and richer evidence schema |
| Human gate | A- | Has approve/reject scripts, pending_human, merge/prototype pause, durable approval queue, request-level approve/reject, report command, local approval UI, viewer/approver/admin RBAC, audit ledger, actor/reason/operation/gate id evidence, PR continuation, filesystem delete continuation, and notification continuation | Needs production identity provider integration and broader operation-specific execution continuations |

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
- `scripts/heartbeat/status_summary.mjs`
- `logs/heartbeat.log`

### What It Really Does Now

- Reads `HEARTBEAT.md`.
- Logs heartbeat start and no-op.
- Polls GitHub events via config or fixture.
- Polls registered heartbeat sources via `config/heartbeat.sources.json`.
- Supports fixture sources for CI/docs/browser event ingestion and dedupe verification.
- Supports live HTTP JSON connector sources with labels/title filters, nested `eventsPath`, environment-backed headers, queue creation, and dedupe verification.
- Scans `states/state_*.md` for `pending` and `returned_to_development`.
- Runs `scripts/queue/run_next.mjs`.
- Has daemon interval mode.
- Has cron install scripts.
- Reports state, queue, and approval counts without changing task state.
- Writes heartbeat/status metrics to `logs/heartbeat-metrics.jsonl`.
- Reports trends with `scripts/heartbeat/trend_report.mjs`.

### What Is Missing

- Generic HTTP JSON live connector ingestion exists. Product-specific CI/docs/browser endpoints, credentials, and event-field mappings still need deployment configuration.
- No dashboard or alerting surface for long-running operational metrics.

### Required Fixes

| Priority | Fix |
|---|---|
| P1 | Add product-specific CI/docs/browser connector configs, credentials, and event-field mappings for deployment |
| P1 | Add dashboard or alerting surface for heartbeat metrics |

### Acceptance

- `scripts/heartbeat/verify_heartbeat.sh` passes.
- Heartbeat can run without chat and dispatch one queued task.
- Human-gated task is not resumed automatically.
- Duplicate GitHub fixture event is ignored.
- `scripts/heartbeat/verify_metrics.sh` passes and `trend_report.mjs` summarizes JSONL metrics.
- `scripts/heartbeat/verify_source_registry.sh` passes and verifies CI/docs/browser fixture ingestion plus dedupe.
- `scripts/heartbeat/verify_http_sources.sh` passes and verifies live HTTP JSON polling, requirement/acceptance preservation, source tagging, and dedupe.

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
- Cleanup matrix now covers review failure, safety brake, changelog rejection, and prototype rejection. Future write integrations still need to be added to this matrix.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Keep all new write paths routed through MCP filesystem write or `assert_worktree.sh` |
| P1 | Keep expanding cleanup verification when new task types or write integrations are added |

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

- Checksum drift is recorded per role run; long-running aggregate reporting is still basic.

### Required Fixes

| Priority | Fix |
|---|---|
| P1 | Add richer checksum drift summary across long-running task iterations |

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
- Codex is the default configured provider, but delegated model execution is disabled by config unless explicitly enabled. Claude/Gemini/OpenCode slots exist but remain disabled until their local CLI contracts are verified.
- Failure feedback exists, but root-cause-to-fix-plan parsing is still partly script-driven and not fully schema-enforced.

### Required Fixes

| Priority | Fix |
|---|---|
| P1 | Add explicit Codex-enabled end-to-end smoke in a safe task and provider-specific smoke tests for Claude/OpenCode/Gemini after their local CLIs are installed |
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

- GitHub write operations such as PR creation/review/merge have a continuation framework with dry-run and second human gate, but automated verification does not execute live writes.
- CI governance is read-only verified through Actions runs and tied to merge readiness, but actual merge continuation is not executed automatically.
- Critical operation human gate is central, with PR continuation, filesystem delete continuation, and notification continuation fixtures in place. Future critical operations still need operation-specific continuations as they are added.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Add operation-specific human-gate continuation fixtures for remaining critical operations |
| P1 | Add safe staging-repo live verification for PR create, PR review, and merge continuations |
| P1 | Add branch protection and required-check policy mapping |

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
- `scripts/state/record_artifact_hash.mjs` records file/directory hashes in state and memory.
- Repeated unchanged artifact hashes increment `No Progress Count`.
- `scripts/state/verify_artifact_hash.sh` verifies changed vs unchanged output accounting.

### What Is Missing

- Evidence is free text, not structured.
- Queue-state-board consistency has no standalone verifier.
- Token budget is recorded but not connected to actual model/provider usage.
- Old bad state files may remain and confuse board.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Add `scripts/state/verify_spine.mjs` checking queue/state/board/log consistency |
| P0 | Add structured evidence format for artifact path, gate, role, result |
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
- Critical MCP operations create durable pending requests in `queue/human-approvals.json`.
- `scripts/human/list_pending.sh` and `scripts/human/report_approvals.mjs` expose pending approvals.
- `scripts/human/approval_server.mjs` provides a local browser UI for approval review and approve/reject actions.
- `scripts/human/approve_approval.sh` and `scripts/human/reject_approval.sh` resolve approval requests by approval id.
- Approved requests move task state to `human_approved`; rejected requests terminate the task and clean its worktree.

### What Is Missing

- Approval UI has local token auth plus viewer/approver/admin RBAC; it still has no production identity provider, SSO, or remote multi-operator deployment surface.
- Approval continuation fixtures cover task-level approve/reject, request-level approve/reject, PR/CI write intent blocking, PR create/review/merge continuation, filesystem delete continuation, and notification continuation, but not every future critical operation's actual execution.

### Required Fixes

| Priority | Fix |
|---|---|
| P1 | Add production identity-provider integration around the approval UI |
| P1 | Expand non-bypass fixtures for each remaining critical operation type |

### Acceptance

- High-risk operation creates pending approval record.
- Approve resumes from correct stage.
- Reject terminates and cleans worktree.
- Logs show actor, reason, operation, decision, and gate id.

## 9. Repair Priority Order

Do not jump directly to business tasks. Repair in this order:

1. Provider hardening: add live smoke tests for Claude/OpenCode/Gemini after local CLI contracts are verified.
2. Human gate continuation: add operation-specific execution continuations after request approval.
3. GitHub governance: add safe staging-repo live verification for post-approval PR create/review/merge continuations.
4. State evidence: convert remaining free-text evidence into stricter structured records.
5. Heartbeat observability: add product-specific connector deployment configs and dashboard/alert summary output.
6. Worktree coverage: keep adding cleanup/assert fixtures for new task types and write integrations.
7. Approval UI: add a dashboard beyond CLI pending/report commands.

## 10. Minimum Next Repair Batch

The smallest useful repair batch is:

1. Provider-specific smoke tests for non-Codex providers once those CLIs are installed and their argument contracts are verified.
2. Safe staging-repo live verification for PR create/update, PR review, and merge.
3. Operation-specific execution continuation fixtures for any new critical operation.
4. Structured evidence schema for gates, role outputs, root-cause analysis, and fix plans.
5. Product-specific heartbeat connector deployment configs and operational dashboard/alerts.

After the current batch, the system is a stronger local LOOP runtime with real isolation, state, gate, and approval evidence. It still should not be called a complete production autonomous software factory until model-backed sub-agent execution and real external integrations are proven end to end.
