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
/Users/xuyongwenmacbookpro/Documents/worktrees/example-smoke
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

Global board:

```text
task-board.md
```

Logs:

```text
logs/heartbeat.log
logs/orchestrator.log
logs/state.log
logs/gate.log
logs/tool-calls.log
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

This verifies filesystem read/write inside a real temporary worktree, review write denial, shell execute, readonly shell denial, critical human-gate blocking, browser test entry, and GitHub token status.

Browser testing uses Playwright when installed. If Playwright is not installed, the browser test runner reports `static_fallback` mode instead of pretending that a real browser ran.

Install MCP dependencies:

```bash
scripts/mcp/install_deps.sh
```

Filesystem MCP is limited to the project directory and `../worktrees`.

## GitHub Event Polling

Configure:

```text
config/github-events.config.json
```

Environment variables:

```bash
export GITHUB_TOKEN="..."
export GITHUB_OWNER="..."
export GITHUB_REPO="..."
```

Without these variables, heartbeat uses:

```text
fixtures/github-events.sample.json
```

Run:

```bash
node scripts/heartbeat/heartbeat_once.mjs
```

Processed GitHub event IDs are stored in:

```text
queue/processed-events.json
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
node scripts/state/verify_spine.mjs
scripts/mcp/verify_mcp.sh
scripts/human/list_pending.sh
```
