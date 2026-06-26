# Heartbeat Inspection Rules

## Purpose

The heartbeat finds pending work without requiring a human to open a chat session. It reads this file, scans task sources, starts triage when work exists, and logs a no-op when no work exists.

## Scan Sources

Phase 1 defines the contract only. Later phases must implement these sources:

- `task-board.md` pending rows.
- `states/state_*.md` files with `Current Stage: pending` or `Current Stage: returned_to_development`.
- External events from MCP connectors, including GitHub Issues, PR comments, CI failures, and document review queues.
- GitHub Issues and PRs configured in `config/github-events.config.json`.

## GitHub Event Filters

GitHub巡检规则：

- `issueLabels`: 只接收匹配标签的 Issue / PR；空数组表示不过滤标签。
- `titleKeywords`: 只接收标题包含关键词的 Issue / PR；空数组表示不过滤标题。
- `includeIssues`: 是否巡检 Issue。
- `includePullRequests`: 是否巡检 PR。
- 已处理事件写入 `queue/processed-events.json`，不会重复创建任务。

## Fixed Execution Logic

1. Load `config/heartbeat.config.js`.
2. Append a timestamped start event to `logs/heartbeat.log`.
3. Read this file before scanning.
4. Scan all configured task sources.
5. If tasks exist, trigger triage for each eligible task.
6. If no tasks exist, append a timestamped no-op event and exit zero.
7. If a scan or dispatch fails, append a timestamped failure event and exit non-zero.

## Stop Conditions

- Missing configuration.
- Missing required skill files.
- Missing state directory.
- Budget, iteration, or no-progress circuit breaker opened.
- Human confirmation required.
