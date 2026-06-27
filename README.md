# Agent Loop System

Production-grade Agent Loop control system for CHUCHUTEA delivery.

This system implements:

- Heartbeat trigger.
- Git worktree task isolation.
- Skill-based rules.
- MCP connector templates.
- Four separated agent roles.
- Markdown state spine.
- Automated gates, safety brakes, and traceable logs.

## Requirements

- macOS or Linux shell.
- `git`.
- `node` 18+.
- No npm install is required for the built-in scripts.

Check:

```bash
git --version
node --version
```

## One-Command Example

Run the full example workflow:

```bash
cd /Users/xuyongwenmacbookpro/Documents/1万gstack/agent-loop-system
scripts/orchestrator/run_example.sh
```

Expected final line:

```text
TASK_RESULT task=example-smoke stage=completed
```

The example runs:

`task creation -> triage -> worktree -> development -> auto gate -> review -> scoring -> cleanup -> state update -> board sync`

Temporary worktree path:

```text
/Users/xuyongwenmacbookpro/Documents/1万gstack/worktrees/example-smoke
```

It is removed automatically when the task completes.

## Manual Task

```bash
cd /Users/xuyongwenmacbookpro/Documents/1万gstack/agent-loop-system
scripts/orchestrator/submit_task.sh my-task-id "Describe the task"
```

Task IDs may use letters, numbers, dot, underscore, and hyphen.

## Heartbeat

Run one heartbeat tick:

```bash
node scripts/heartbeat/heartbeat_once.mjs
```

Read current heartbeat status without changing task state:

```bash
node scripts/heartbeat/status_summary.mjs
```

Read long-term heartbeat trend metrics:

```bash
node scripts/heartbeat/trend_report.mjs --last=200
```

Start background interval heartbeat:

```bash
scripts/heartbeat/start_heartbeat.sh
```

Stop background heartbeat:

```bash
scripts/heartbeat/stop_heartbeat.sh
```

Install cron heartbeat:

```bash
scripts/heartbeat/install_cron.sh "*/30 * * * *"
```

Remove cron heartbeat:

```bash
scripts/heartbeat/uninstall_cron.sh
```

Change interval:

```text
config/heartbeat.config.js
```

Default interval is 30 minutes.

## State And Logs

Task state files:

```text
states/state_TASK_ID.md
```

Structured machine-readable evidence:

```text
memory/evidence/TASK_ID.jsonl
```

Each structured evidence row uses `schemaVersion=structured-evidence/v1` and records `taskId`, `type`, `actor`, `action`, `target`, `result`, `nextCheck`, `details`, and `createdAt`. The latest evidence ids are also mirrored into the task state under `## Structured Evidence`, then synced into `memory/tasks/TASK_ID.md`.

Budget usage ledger:

```text
memory/budget/TASK_ID.jsonl
```

MCP calls and enabled model delegate calls update `Tool Call Count` and `Token Budget Used` in state, write `budget-usage/v1` rows, and sync the latest budget rows into `memory/tasks/TASK_ID.md`.

Failure diagnostics:

```bash
scripts/state/verify_failure_diagnostics.sh
```

Every blocking failure writes a failure record, root cause, fix plan, next checks, retry ledger entry, structured evidence row, and synced task memory. The next loop iteration must use this evidence before retrying.

Global board:

```text
task-board.md
```

Logs:

```text
logs/heartbeat.log
logs/heartbeat-metrics.jsonl
logs/orchestrator.log
logs/state.log
logs/gate.log
logs/tool-calls.log
logs/human-gate.log
```

Resume a task from state:

```bash
node scripts/orchestrator/run_task.mjs TASK_ID
```

Read checkpoint data:

```bash
node scripts/state/resume_state.mjs TASK_ID
```

Sync board:

```bash
node scripts/state/sync_board.mjs
```

## Verification Commands

Full example:

```bash
scripts/orchestrator/run_example.sh phase3-example
```

Breakpoint resume check:

```bash
scripts/orchestrator/verify_resume.sh resume-smoke
```

Safety brake check:

```bash
scripts/orchestrator/verify_safety_brake.sh brake-smoke
```

Auto gate:

```bash
node scripts/gate/run_gate.mjs TASK_ID .
```

Worktree isolation matrix:

```bash
scripts/worktree/verify_worktree.sh
scripts/worktree/monitor_residue.sh
```

Agent structured output:

```bash
scripts/agents/verify_agent_result_schema.sh
```

Human gate audit:

```bash
scripts/human/verify_human_gate_audit.sh
```

GitHub PR/CI human gate:

```bash
scripts/github/verify_pr_ci_gate.sh
```

Artifact hash and no-progress accounting:

```bash
scripts/state/verify_artifact_hash.sh
```

Structured evidence spine:

```bash
scripts/state/verify_structured_evidence.sh
```

Budget usage and safety brake:

```bash
scripts/state/verify_budget_usage.sh
```

Cleanup matrix:

```bash
scripts/worktree/verify_cleanup_matrix.sh
```

Skill drift fixture:

```bash
scripts/agents/verify_skill_drift.sh
```

## Worktree Scripts

Create isolated worktree:

```bash
scripts/worktree/create_worktree.sh TASK_ID
```

Clean isolated worktree:

```bash
scripts/worktree/clean_worktree.sh TASK_ID
```

Assert current path is an isolated worktree before writes:

```bash
scripts/worktree/assert_worktree.sh
```

Verify create/assert/write/clean behavior:

```bash
scripts/worktree/verify_worktree.sh
```

Check for task branch or worktree residue:

```bash
scripts/worktree/monitor_residue.sh
```

## Skills

Rules live in:

```text
skills/
```

Standard Skill directories:

- `skills/loop-engineering/SKILL.md`
- `skills/triage-agent/SKILL.md`
- `skills/development-agent/SKILL.md`
- `skills/prototyper-agent/SKILL.md`
- `skills/tester-agent/SKILL.md`
- `skills/review-agent/SKILL.md`
- `skills/scoring-agent/SKILL.md`

Longer standards live under each Skill's `references/` folder. Change these files to change agent behavior without changing code.

Each agent run records bytes and sha256 checksums for the mandatory prompt and Skill files into task state and task memory. Verify this with:

```bash
scripts/agents/verify_skill_checksums.sh
```

Verify that changed Skill content is read by the next role run:

```bash
scripts/agents/verify_skill_drift.sh
```

## Agent Prompts

Role prompts live in:

```text
prompts/agents/
```

Flow:

```text
triage -> development -> review -> scoring -> cleanup
```

No role may review or score its own work.

## Model Providers

Model provider configuration lives in:

```text
config/codex.config.json
```

Current default provider:

- `codex`

Provider routing is role-specific. For example, `review` can be routed to another verified provider while `development` stays on Codex:

```json
{
  "providerByRole": {
    "development": "codex",
    "review": "claude"
  }
}
```

Do not enable a non-Codex provider until its local CLI command, arguments, timeout, and structured output contract have a passing smoke test. Review and scoring providers remain read-only through the role sandbox and MCP permissions.

Reserved provider slots:

- `claude`
- `opencode`
- `gemini`

Reserved providers stay disabled until their local CLI command and argument contract are verified on this machine. Verify provider configuration with:

```bash
scripts/agents/verify_model_providers.sh
```

## MCP Configuration

Templates:

```text
config/mcp.config.json
config/tool-permissions.json
```

Token placeholders:

```bash
export GITHUB_TOKEN="..."
export GITHUB_OWNER="..."
export GITHUB_REPO="..."
```

Do not commit real tokens.

Bind a repository without storing a token:

```bash
scripts/mcp/bind_github_repo.sh OWNER REPO
```

This writes:

```text
config/github.local.env
```

Resolution order is:

```text
environment variables -> config/github.local.env -> git remote origin
```

If `GITHUB_TOKEN` is not set, the local MCP wrapper and `start_mcp.sh` try to use the existing GitHub CLI login from:

```bash
gh auth token
```

`GITHUB_OWNER` and `GITHUB_REPO` are required for repo-specific PR, issue, and CI workflows unless the project git remote points to GitHub. Without a configured repository, GitHub verification is limited to authenticated API connectivity.

Configured tool classes:

- Filesystem.
- Shell.
- GitHub.
- Browser test runner.

Review Agent is read-only. Development Agent can write code inside the task worktree.

## Codex Agent Runtime

Codex CLI can be used as the model runtime for each role:

```text
config/codex.config.json
```

Default:

```json
{
  "enabled": false
}
```

When disabled, the LOOP still packages the role prompt, Skill rules, and task state into:

```text
logs/codex/<taskId>.<role>.prompt.md
```

When enabled, `scripts/agents/run_agent.mjs` delegates to:

```bash
codex exec
```

Role sandbox rules:

```text
triage/review/scoring: read-only
development/prototyper/tester: workspace-write
```

Enable for a single run:

```bash
AGENT_LOOP_CODEX_ENABLED=1 node scripts/agents/run_agent.mjs development TASK_ID
```

Verify the connector without running a model:

```bash
scripts/agents/verify_codex_connector.sh
```

Verify a real Codex-enabled role execution:

```bash
scripts/agents/verify_codex_enabled_smoke.sh
```

This runs a safe read-only `triage` task through `codex exec`, then checks the prompt artifact, raw result, structured result JSON, state evidence, and budget ledger. It is the smoke test for proving that the sub-agent path is not only packaging prompts.

Model calls have a timeout. Override for one run when needed:

```bash
AGENT_LOOP_CODEX_TIMEOUT_MS=120000 scripts/agents/verify_codex_enabled_smoke.sh
```

Each role writes a structured result record:

```text
logs/codex/<taskId>.<role>.result.json
```

Verify the schema:

```bash
scripts/agents/verify_agent_result_schema.sh
```

Verify that review/scoring decisions are consumed from structured role results:

```bash
scripts/orchestrator/verify_structured_decisions.sh
```

Start MCP services:

```bash
scripts/mcp/start_mcp.sh
```

Stop MCP services:

```bash
scripts/mcp/stop_mcp.sh
```

Verify MCP configuration:

```bash
scripts/mcp/verify_mcp.sh
```

This verifies filesystem read/write inside a real temporary worktree, review write denial, shell execute, readonly shell denial, critical human-gate blocking, browser test entry, GitHub token status, and read-only GitHub repo/pulls/commits/actions-runs connectivity when a repository is configured.

Live GitHub staging verification is intentionally opt-in because it writes to GitHub. It creates temporary staging branches, opens a temporary PR, runs the second human gate, submits a review/comment, merges into the temporary base branch, and deletes the temporary branches. It never targets `main`.

```bash
AGENT_LOOP_GITHUB_LIVE_STAGING=1 node scripts/github/verify_live_staging_pr.mjs
```

Browser testing uses Playwright when installed. If Playwright is not installed, the browser test runner reports `static_fallback` mode instead of pretending that a real browser ran. Final prototype or UI acceptance should call browser testing with `--require-playwright` or payload `{"requirePlaywright":true}` so static fallback cannot pass as final UI evidence.

Install MCP dependencies:

```bash
scripts/mcp/install_deps.sh
```

Filesystem MCP is limited to the project directory and `../worktrees`.

## Heartbeat Source Registry

Configure:

```text
config/heartbeat.sources.json
config/github-events.config.json
```

Environment variables:

```bash
export GITHUB_TOKEN="..."
export GITHUB_OWNER="..."
export GITHUB_REPO="..."
```

The default source registry enables the GitHub source. Without GitHub variables, heartbeat uses the GitHub fixture:

```text
fixtures/github-events.sample.json
```

Fixture sources can model CI, docs, browser, or other external connector events for local verification:

```text
fixtures/heartbeat-sources.sample.json
```

HTTP JSON sources can poll live connector APIs that return an event array:

```json
{
  "id": "ci-http",
  "type": "http-json",
  "enabled": true,
  "url": "https://example.invalid/agent-loop/ci-events",
  "eventsPath": "events",
  "filters": { "labels": ["ci"] },
  "headersEnv": { "Authorization": "AGENT_LOOP_CI_EVENTS_AUTH" }
}
```

Each event may include `taskId`, `title`, `priority`, `type`, `labels`, `requirement`, and `acceptance`.

Run:

```bash
node scripts/heartbeat/heartbeat_once.mjs
```

Processed GitHub event IDs are stored in:

```text
queue/processed-events.json
```

Verify the source registry, multi-source fixture ingestion, and dedupe:

```bash
scripts/heartbeat/verify_source_registry.sh
scripts/heartbeat/verify_http_sources.sh
```

PR creation, PR update, merge, and other high-risk GitHub write actions must stop at the human gate. Verify the read checks and pending approval record with:

```bash
scripts/github/verify_pr_ci_gate.sh
```

After an approval request is approved, run merge readiness before any merge continuation:

```bash
node scripts/github/merge_readiness.mjs APPROVAL_ID task/TASK_ID main
```

The readiness gate is read-only. It verifies approval status, open PR evidence, and Actions evidence. Missing PR or missing/non-success CI blocks readiness and records the reason in task state.

Verify readiness blocking behavior:

```bash
scripts/github/verify_merge_readiness.sh
```

Run post-approval PR continuation in dry-run mode:

```bash
node scripts/github/continue_pr_operation.mjs APPROVAL_ID create --mode=dry-run
node scripts/github/continue_pr_operation.mjs APPROVAL_ID review --mode=dry-run
node scripts/github/continue_pr_operation.mjs APPROVAL_ID merge --mode=dry-run
```

Live mode never runs from the first approval alone. First it creates a second pending human approval:

```bash
node scripts/github/continue_pr_operation.mjs APPROVAL_ID create --mode=live
scripts/human/approve_approval.sh LIVE_APPROVAL_ID "approve live PR creation"
node scripts/github/continue_pr_operation.mjs APPROVAL_ID create --mode=live --live-approval-id=LIVE_APPROVAL_ID --confirm-live
```

Supported live actions are PR create, PR review, and PR merge. Merge still requires readiness evidence before execution.

Verify continuation dry-run and second-gate behavior:

```bash
scripts/github/verify_pr_continuation.sh
```

Post-approval filesystem delete continuation also uses dry-run first, then a second live approval:

```bash
node scripts/mcp/continue_filesystem_delete.mjs APPROVAL_ID --mode=dry-run
node scripts/mcp/continue_filesystem_delete.mjs APPROVAL_ID --mode=live
scripts/human/approve_approval.sh LIVE_APPROVAL_ID "approve live filesystem delete"
node scripts/mcp/continue_filesystem_delete.mjs APPROVAL_ID --mode=live --live-approval-id=LIVE_APPROVAL_ID --confirm-live
```

The delete target must be inside the matching `../worktrees/TASK_ID/` directory. Main workspace, system paths, and symlink-resolved escapes are blocked.

Verify filesystem delete continuation behavior:

```bash
scripts/mcp/verify_filesystem_delete_continuation.sh
```

Post-approval external notification continuation also uses dry-run first, then a second live approval:

```bash
node scripts/notifications/continue_notification.mjs APPROVAL_ID --mode=dry-run
node scripts/notifications/continue_notification.mjs APPROVAL_ID --mode=live --webhook-url=https://example.invalid/webhook
scripts/human/approve_approval.sh LIVE_APPROVAL_ID "approve live notification"
node scripts/notifications/continue_notification.mjs APPROVAL_ID --mode=live --webhook-url=https://example.invalid/webhook --live-approval-id=LIVE_APPROVAL_ID --confirm-live
```

Live notification sends a JSON `POST` to the configured webhook URL only after the second approval and `--confirm-live`.

Verify notification continuation behavior with a local webhook fixture:

```bash
scripts/notifications/verify_notification_continuation.sh
```

## Queue Operations

Add task:

```bash
node scripts/queue/add_task.mjs \
  --id task-id \
  --title "Task title" \
  --priority P1 \
  --type prototype \
  --requirement "What the task must build" \
  --acceptance "Concrete checks that must pass"
```

List queue:

```bash
node scripts/queue/list_queue.mjs
```

Cancel task:

```bash
node scripts/queue/cancel_task.mjs task-id
```

Clean completed tasks:

```bash
node scripts/queue/clean_completed.mjs
```

Run next queued task:

```bash
node scripts/queue/run_next.mjs 1
```

Queue data:

```text
queue/queue.json
```

## Human Gates

High-risk operations such as merge-to-main pause at `pending_human`.

Approve:

```bash
scripts/human/approve_task.sh TASK_ID changelog
```

Reject:

```bash
scripts/human/reject_task.sh TASK_ID "reason"
```

Human gate decisions are recorded in state files and logs.

Durable pending requests are stored in:

```text
queue/human-approvals.json
```

List pending approvals:

```bash
scripts/human/list_pending.sh
```

Generate an approval report:

```bash
node scripts/human/report_approvals.mjs
```

Start the local Human Gate approval UI:

```bash
node scripts/human/approval_server.mjs --host=127.0.0.1 --port=8787
```

The server prints a local URL, token, and `open_url`. Without an operator config, the startup token acts as a local approver token.

For operator RBAC, copy `config/human-gate.operators.example.json` to a local ignored config and provide tokens by environment variable:

```bash
export HUMAN_GATE_VIEWER_TOKEN="viewer-secret"
export HUMAN_GATE_APPROVER_TOKEN="approver-secret"
node scripts/human/approval_server.mjs \
  --host=127.0.0.1 \
  --port=8787 \
  --operators=config/human-gate.operators.local.json
```

Viewer operators can inspect approvals. `approver` and `admin` operators can approve or reject. The UI reads `queue/human-approvals.json` and resolves approvals through `scripts/human/resolve_approval.mjs`, so approve/reject actions still update state, logs, and cleanup paths.

Read approval queue JSON from the UI server:

```bash
curl "http://127.0.0.1:8787/api/approvals?token=YOUR_OPERATOR_TOKEN"
```

Approve a durable approval request by approval id:

```bash
scripts/human/approve_approval.sh APPROVAL_ID "reason"
```

Reject a durable approval request by approval id:

```bash
scripts/human/reject_approval.sh APPROVAL_ID "reason"
```

Approving a request changes the task stage from `pending_human` to `human_approved` and records the decision. Rejecting a request terminates the task and cleans its worktree.

Audit log:

```text
logs/human-gate.log
```

Verify audit behavior:

```bash
scripts/human/verify_human_gate_audit.sh
scripts/human/verify_approval_queue.sh
scripts/human/verify_approval_ui.sh
```

Heartbeat metrics:

```bash
scripts/heartbeat/verify_metrics.sh
node scripts/heartbeat/trend_report.mjs --last=200
```

## Prototype Tasks

Run a prototype task:

```bash
node scripts/orchestrator/run_task.mjs prototype-task \
  --title="Contract system prototype" \
  --type=prototype \
  --requirement="合同管理、任务协同、知识库、AI 审查、权限、多语言服务器绑定" \
  --acceptance="页面必须包含合同台账、合同上传、AI 合同审查、审批流、知识库、任务详情；默认俄语；管理员可切换服务器节点到中国节点后 UI 变中文；普通员工不可见服务器切换；原型不得出现奶茶点单、库存、菜单、门店收银；原型说明服务器切换为交互逻辑模拟，不是真实多节点部署"
```

The task creates:

```text
../worktrees/prototype-task/prototype/index.html
../worktrees/prototype-task/testcases/prototype-basic.md
../worktrees/prototype-task/reports/prototype-test-report.md
```

The prototype pauses at `pending_human` after automated tests.

Approve prototype:

```bash
scripts/human/approve_task.sh prototype-task prototype
```

Reject prototype:

```bash
scripts/human/reject_task.sh prototype-task "reason"
```

Write test cases using:

```text
templates/testcase_TEMPLATE.md
```

## Retries And Error Logs

Default retry limit is 3.

Override:

```bash
AGENT_LOOP_RETRIES=5 node scripts/orchestrator/run_task.mjs TASK_ID
```

Error log:

```text
logs/error.log
```

## Safety Brakes

Defaults:

- Max iterations: 10.
- Max no-progress iterations: 3.
- Max tool calls: 200.
- Max token budget: 200000.

Override for one command:

```bash
MAX_ITERATIONS=3 node scripts/gate/safety_brake.mjs TASK_ID
```

If a brake triggers, the task is marked `terminated`, and worktree cleanup runs.

Repeated identical artifact hashes increase `No Progress Count`. Verify this behavior with:

```bash
scripts/state/verify_artifact_hash.sh
```

Verify cleanup after review failure, safety brake, changelog rejection, and prototype rejection:

```bash
scripts/worktree/verify_cleanup_matrix.sh
```

## Troubleshooting

### Script has no execute permission

```bash
chmod +x scripts/**/*.sh scripts/**/*.mjs
```

### Heartbeat does not trigger

Check:

```bash
cat logs/heartbeat.log
cat logs/heartbeat.pid
node scripts/heartbeat/heartbeat_once.mjs
```

Confirm `config/heartbeat.config.js` points to valid paths.

### Gate keeps failing

Run:

```bash
node scripts/gate/auto_check.mjs .
cat logs/gate.log
cat logs/tool-calls.log
```

Fix syntax, JSON, or trailing whitespace issues in the task worktree.

### Worktree cleanup fails

Run:

```bash
git worktree list
scripts/worktree/clean_worktree.sh TASK_ID
git worktree prune
```

### Task state looks wrong

Run:

```bash
node scripts/state/resume_state.mjs TASK_ID
node scripts/state/sync_board.mjs
cat task-board.md
```

### Cron not installed

Run:

```bash
crontab -l
scripts/heartbeat/install_cron.sh "*/30 * * * *"
```

## Phase 3 Acceptance

These commands must pass:

```bash
scripts/orchestrator/run_example.sh phase3-example
scripts/orchestrator/verify_resume.sh phase3-resume
scripts/orchestrator/verify_safety_brake.sh phase3-brake
```

## Current LOOP Verification

These commands check the repaired LOOP requirements chain:

```bash
scripts/orchestrator/verify_requirement_gate.sh
scripts/heartbeat/verify_heartbeat.sh
scripts/heartbeat/verify_status_summary.sh
node scripts/state/verify_spine.mjs
scripts/mcp/verify_mcp.sh
scripts/human/list_pending.sh
scripts/human/verify_approval_queue.sh
scripts/agents/verify_skill_drift.sh
scripts/orchestrator/verify_structured_decisions.sh
scripts/state/verify_artifact_hash.sh
scripts/state/verify_structured_evidence.sh
scripts/state/verify_budget_usage.sh
scripts/github/verify_pr_ci_gate.sh
scripts/github/verify_merge_readiness.sh
scripts/github/verify_pr_continuation.sh
scripts/worktree/verify_cleanup_matrix.sh
```
