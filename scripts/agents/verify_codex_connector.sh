#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

command -v codex >/dev/null
codex --version >/tmp/agent-loop-codex-version.out
node -e "JSON.parse(require('fs').readFileSync('config/codex.config.json','utf8'))"

TASK_ID="codex-connector-smoke"
rm -f "states/state_$TASK_ID.md"
node scripts/state/create_state.mjs "$TASK_ID" "Codex connector smoke" --priority=P2 --type=development --requirement="Verify Codex delegate packaging only." --acceptance="Connector must create a prompt file without running a model when disabled." >/tmp/agent-loop-codex-state.out
AGENT_LOOP_CODEX_ENABLED=0 node scripts/agents/run_agent.mjs development "$TASK_ID" >/tmp/agent-loop-codex-run.out
grep -q "AGENT_READY role=development task=$TASK_ID" /tmp/agent-loop-codex-run.out
test -f "logs/codex/$TASK_ID.development.prompt.md"
rm -f "states/state_$TASK_ID.md"
node scripts/state/sync_board.mjs >/dev/null

echo "CODEX_CONNECTOR_VERIFY_PASSED version=$(cat /tmp/agent-loop-codex-version.out)"
