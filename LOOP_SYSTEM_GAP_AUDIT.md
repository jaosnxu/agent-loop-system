# LOOP System Gap Audit

Status: production governance update
Date: 2026-06-27
System: `/Users/xuyongwenmacbookpro/Documents/1万gstack/agent-loop-system`
Standard: `LOOP_7_MODULES_STANDARD.md`

## 0. Gate Conclusion

Current status:

`PRODUCTION_GOVERNANCE_READY / BUSINESS_CONNECTORS_PENDING`

Plain conclusion:

The system is not fake-empty. It has a real LOOP runtime with heartbeat scripts, worktree isolation, standard Skill files, state and memory evidence, queue management, MCP wrappers, sub-agent routing, gates, and human approval scripts.

It is now strong enough for protected-branch development flow, but it is not a complete unattended software factory for every business system. The remaining gaps are product connector configuration, broader live-provider coverage, and operational dashboards.

1. Sub-agents now have a provider-aware delegate runner, role-specific provider routing, Codex as the default configured provider, Claude enabled and smoke-verified for review/scoring, model-call timeouts, structured result records, review/scoring structured decision routing, failure diagnostics with root-cause/fix-plan/next-check evidence, a Codex-enabled read-only smoke verifier, and external provider CLI contract verification.
2. MCP browser testing has a Playwright/static fallback runner and a required-Playwright mode; GitHub read checks, write-intent human gate, merge readiness gate, and branch-protection policy mapping are verified.
3. GitHub/MCP production flow is real for governance: reads, approval blocking, approval resolution, read-only readiness decisions, PR create/review/merge continuation dry-run/live-gate framework, opt-in live staging PR verification, required-check workflow, and production `main` branch protection have been verified. Live staging writes only to temporary branches and temporary PRs.
4. Heartbeat now has supervisor classification, stale-running remediation, no-progress termination, point-in-time status summary, JSONL metrics, trend reporting, source registry, GitHub polling, CI/docs/browser fixture ingestion, HTTP JSON live connector ingestion, and queue dispatch checks.
5. Skill enforcement uses standard `skills/*/SKILL.md` files, records role reads with sha256 evidence, and has a Skill drift fixture.
6. Human gate records actor, operation, reason, decision, gate id, durable approval requests, CLI approval report, local approval UI, operator RBAC, trusted-header identity proxy support, PR continuation, filesystem delete continuation, and notification continuation, but still needs broader critical-operation coverage.

## 1. Module Audit Summary

| Module | Current Grade | Current Reality | Production Gap |
|---|---:|---|---|
| Heartbeat | A- | Has heartbeat rules, config, once/daemon/cron scripts, supervisor classification, stale-running remediation, no-progress termination, status summary, JSONL metrics, trend report, source registry, GitHub fixture/API path, CI/docs/browser fixture sources, HTTP JSON connector sources, queue dispatch | Needs product-specific connector configs/credentials and longer operational dashboards |
| Worktree | A- | Has create/assert/clean, branch naming, orphan fallback, cleanup matrix verification, residue monitor | Needs mandatory assert coverage on every future write integration |
| Skill | A- | Uses standard `skills/*/SKILL.md`, role read logs, sha256 evidence, checksum verifier, and Skill drift fixture | Needs richer checksum drift reports across long-running tasks |
| Sub-agents | A | Has role prompts, stage names, provider-aware delegate runner, per-role provider routing, timeout-bounded model calls, Codex default provider slot, Claude review/scoring provider, Codex-enabled read-only smoke verification, Claude review/scoring smoke verification, external provider CLI contract verification, structured result JSON, review/scoring decision parsing, and diagnostic-driven return-to-development evidence | Needs stricter context minimization and optional full task-execution smoke tests for other providers |
| MCP connector | A | Has MCP wrapper, permissions, logs, filesystem/shell/GitHub/browser basics, required-Playwright mode, install/start/verify scripts, GitHub PR/CI read, write-intent human gate, merge readiness gate, branch-protection policy mapping, required-check workflow, PR create/review/merge dry-run/live continuation framework, opt-in live staging write verification, and production `main` branch protection verified | Needs product-specific GitHub workflow rollout per downstream repo |
| State / Memory spine | A- | Has queue, state, board, logs, resume, counters, requirement/acceptance propagation, action journal, artifact hashes, no-progress accounting, structured failure diagnostics, structured evidence JSONL, state/memory evidence mirrors, MCP budget usage ledger, and model-delegate budget hooks | Needs official provider token metrics when available and broader structured coverage for future direct state writers |
| Human gate | A | Has approve/reject scripts, pending_human, merge/prototype pause, durable approval queue, request-level approve/reject, report command, local approval UI, viewer/approver/admin RBAC, trusted-header identity proxy support, audit ledger, actor/reason/operation/gate id evidence, PR continuation, filesystem delete continuation, and notification continuation | Needs broader operation-specific execution continuations |

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
- `scripts/agents/verify_codex_enabled_smoke.sh`
- `scripts/agents/verify_claude_provider_smoke.sh`
- `scripts/state/verify_failure_diagnostics.sh`
- `config/codex.config.json`
- `scripts/orchestrator/run_task.mjs`

### What It Really Does Now

- Stages exist in the orchestrator.
- Prompt files describe role boundaries.
- `scripts/agents/run_agent.mjs` prepares role-specific context and mandatory Skill reads.
- `scripts/agents/codex_delegate.mjs` can invoke the active provider per role, enforce model-call timeouts, and store separate prompt/result artifacts under `logs/codex/`.
- Each delegate run writes `logs/codex/TASK.ROLE.result.json` with `schemaVersion`, `taskId`, `role`, `provider`, `status`, `decision`, and raw result path.
- `scripts/agents/verify_codex_enabled_smoke.sh` runs a safe read-only `triage` role through real `codex exec` and verifies prompt, raw result, structured result, state evidence, and budget usage.
- `scripts/agents/verify_claude_provider_smoke.sh` runs review and scoring through the verified local Claude CLI path and verifies structured results, provider identity, budget evidence, and state evidence.
- `scripts/agents/verify_provider_contracts.mjs` verifies configured CLI/version contracts for `codex`, `claude`, `opencode`, and `gemini`.
- `config/codex.config.json` declares provider slots for `codex`, `claude`, `opencode`, and `gemini`, plus `providerByRole`; `review` and `scoring` route to verified Claude while implementation roles stay on Codex.
- Blocking failures write root cause, fix plan, next checks, retry ledger, and structured evidence through `scripts/state/record_failure.mjs`.
- `scripts/state/verify_failure_diagnostics.sh` verifies direct failure diagnostics and Review Agent return-to-development diagnostics.
- Review/scoring gates exist as scripted stages and can consume delegated role outputs.
- Prototype/test stages exist.

### What Is Missing

- Context isolation still needs stricter role-specific context minimization.
- Codex and Claude have explicit smoke tests. Gemini/OpenCode slots exist but remain disabled until their invocation contracts are approved.
- Failure feedback now writes root cause, fix plan, and next checks to state/memory/structured evidence, but model-native failure schemas are still not enforced across every provider.

### Required Fixes

| Priority | Fix |
|---|---|
| P1 | Add full task-execution smoke tests for OpenCode/Gemini after their invocation contracts are approved |
| P1 | Enforce model-native failure schemas across every provider, not only state-level diagnostics |

### Acceptance

- Development and review are separate executions.
- `scripts/agents/verify_codex_enabled_smoke.sh` passes and proves at least one real Codex-backed sub-agent execution.
- `scripts/agents/verify_claude_provider_smoke.sh` passes and proves review/scoring can use a second local model provider.
- `node scripts/agents/verify_provider_contracts.mjs` passes and proves configured provider CLI/version contracts are valid.
- `scripts/state/verify_failure_diagnostics.sh` passes and proves failure return has root cause, fix plan, next checks, and structured evidence.
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
- `scripts/github/verify_live_staging_pr.mjs`
- `config/github-branch-protection.config.json`
- `.github/workflows/required-checks.yml`
- `scripts/github/branch_protection_policy.mjs`
- `scripts/github/verify_branch_protection_policy.sh`
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
- Required GitHub Actions check names exist: `lint`, `typecheck`, `test`, `build-smoke`, and `audit`.
- Production `main` branch protection has been applied and read back from GitHub.

### What Is Missing

- Downstream business repositories still need their own branch-protection rollout and required-check workflows.
- GitHub write operations such as PR creation/review/merge have a continuation framework with dry-run, second human gate, and opt-in live staging verification against temporary branches; future GitHub write types still need their own continuation fixtures.
- CI governance is tied to merge readiness, required-check policy is mapped in `config/github-branch-protection.config.json`, and production `main` protection is verified for this repository.
- Critical operation human gate is central, with PR continuation, filesystem delete continuation, and notification continuation fixtures in place. Future critical operations still need operation-specific continuations as they are added.

### Required Fixes

| Priority | Fix |
|---|---|
| P0 | Add operation-specific human-gate continuation fixtures for remaining critical operations |
| P1 | Roll out equivalent required-check workflow and branch protection to each downstream business repository |

### Acceptance

- Browser test opens prototype with Playwright for final UI acceptance, clicks, types, asserts, and reports mode.
- Review role write is blocked.
- Shell readonly cannot mutate files.
- Critical operation returns pending_human instead of executing.
- `AGENT_LOOP_GITHUB_LIVE_STAGING=1 node scripts/github/verify_live_staging_pr.mjs` passes and proves live PR create/review/merge against temporary staging branches.
- `scripts/github/verify_branch_protection_policy.sh` passes and proves required-check policy mapping plus temporary branch-protection apply/readback/cleanup.
- `node scripts/github/branch_protection_policy.mjs check main` passes and proves production `main` matches the configured policy.

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
- `scripts/state/verify_spine.mjs` checks queue/state/board consistency.
- Safety brake checks counters.
- Gate logs acceptance checks.
- `scripts/state/record_artifact_hash.mjs` records file/directory hashes in state and memory.
- Repeated unchanged artifact hashes increment `No Progress Count`.
- `scripts/state/verify_artifact_hash.sh` verifies changed vs unchanged output accounting.
- `scripts/state/record_structured_evidence.mjs` and `scripts/state/structured_evidence_lib.mjs` write machine-readable `structured-evidence/v1` JSONL under `memory/evidence/TASK_ID.jsonl`.
- State files mirror evidence ids in `## Structured Evidence`, and `memory/tasks/TASK_ID.md` syncs both the state mirror and JSONL evidence tail.
- Create, stage transition, action, failure, diagnostic, artifact hash, role read, and delegated agent result paths now write structured evidence.
- `scripts/state/verify_structured_evidence.sh` verifies state, memory, JSONL schema, required evidence types, artifact hash details, and diagnostic root cause details.
- `scripts/state/budget_lib.mjs` writes `budget-usage/v1` rows under `memory/budget/TASK_ID.jsonl`.
- MCP tool calls update `Tool Call Count`, estimated `Token Budget Used`, structured evidence, and task memory budget tails when the call is tied to a task state.
- Enabled model delegate calls update budget counters from prompt/result size estimates; disabled delegates do not fake provider usage.
- `scripts/state/verify_budget_usage.sh` verifies MCP-driven budget updates and proves the safety brake blocks at the configured tool-call limit.

### What Is Missing

- Budget accounting uses deterministic token estimates from real prompt/result/tool payload bytes; it does not yet ingest official provider token metrics.
- Old bad state files may remain and confuse board.
- Some future direct state writers may still need structured evidence calls as new operations are added.

### Required Fixes

| Priority | Fix |
|---|---|
| P1 | Keep expanding structured evidence coverage for new direct state writers |
| P1 | Replace deterministic token estimates with official provider token metrics when the local provider exposes them |

### Acceptance

- A killed task resumes from last stage.
- A failed task records failure and next action.
- Queue, state, and board agree.
- Repeated no-progress terminates.
- `scripts/state/verify_structured_evidence.sh` passes and proves new tasks write machine-readable evidence to state, memory, and JSONL.
- `scripts/state/verify_budget_usage.sh` passes and proves real MCP calls update budget counters and safety brake enforcement.

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

- Approval UI has local token auth, viewer/approver/admin RBAC, and trusted-header identity proxy support for deployment behind an OIDC/SSO gateway.
- Approval continuation fixtures cover task-level approve/reject, request-level approve/reject, PR/CI write intent blocking, PR create/review/merge continuation, filesystem delete continuation, and notification continuation, but not every future critical operation's actual execution.

### Required Fixes

| Priority | Fix |
|---|---|
| P1 | Expand non-bypass fixtures for each remaining critical operation type |

### Acceptance

- High-risk operation creates pending approval record.
- Approve resumes from correct stage.
- Reject terminates and cleans worktree.
- Logs show actor, reason, operation, decision, and gate id.
- `scripts/human/verify_approval_identity.sh` passes and proves trusted identity headers map users/groups to viewer/approver RBAC.

## 9. Repair Priority Order

Do not jump directly to business tasks. Repair in this order:

1. Provider hardening: add live smoke tests for OpenCode/Gemini after local CLI contracts are verified.
2. Human gate continuation: add operation-specific execution continuations after request approval.
3. GitHub governance: roll out required-check workflow and branch protection to downstream business repositories.
4. State evidence: keep expanding structured evidence coverage for any newly added direct state writers.
5. Heartbeat observability: add product-specific connector deployment configs and dashboard/alert summary output.
6. Worktree coverage: keep adding cleanup/assert fixtures for new task types and write integrations.
7. Approval UI: add a dashboard beyond CLI pending/report commands.

## 10. Minimum Next Repair Batch

The smallest useful repair batch is:

1. Provider-specific smoke tests for OpenCode/Gemini once those CLIs are installed and their argument contracts are verified.
2. Branch-protection rollout tasks for downstream business repositories.
3. Operation-specific execution continuation fixtures for any new critical operation.
4. Official provider token metrics ingestion when available from local model runtimes.
5. Product-specific heartbeat connector deployment configs and operational dashboard/alerts.

After the current batch, the system is a protected LOOP runtime with real isolation, state, gate, approval evidence, second-model review/scoring, and GitHub governance. It still should not be called a complete unattended software factory for every business until product-specific connectors, dashboards, and downstream repository policies are deployed.
