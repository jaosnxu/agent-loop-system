#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKTREES_ROOT="$(cd "$ROOT/../.." && pwd)/worktrees"
PROJECT_ROOT="$(cd "$ROOT/.." && pwd)"

mkdir -p "$WORKTREES_ROOT"

command -v node >/dev/null
command -v npx >/dev/null

node -e "JSON.parse(require('fs').readFileSync('$ROOT/config/mcp.config.json','utf8')); JSON.parse(require('fs').readFileSync('$ROOT/config/tool-permissions.json','utf8'));"
test -d "$WORKTREES_ROOT"
test -d "$PROJECT_ROOT"

TASK_ID="mcp-verify"
"$ROOT/scripts/worktree/clean_worktree.sh" "$TASK_ID" >/dev/null 2>&1 || true
"$ROOT/scripts/worktree/create_worktree.sh" "$TASK_ID" >/dev/null
trap '"$ROOT/scripts/worktree/clean_worktree.sh" "$TASK_ID" >/dev/null 2>&1 || true' EXIT

VERIFY_FILE="$WORKTREES_ROOT/$TASK_ID/mcp-verify.txt"
VERIFY_HTML="$WORKTREES_ROOT/$TASK_ID/prototype/index.html"
VERIFY_BROWSER_REPORT="$WORKTREES_ROOT/$TASK_ID/reports/browser-test-report.md"
node "$ROOT/scripts/mcp/mcp_tool.mjs" development filesystem write "$VERIFY_FILE" "mcp verify" >/dev/null
node "$ROOT/scripts/mcp/mcp_tool.mjs" review filesystem read "$VERIFY_FILE" >/dev/null
if node "$ROOT/scripts/mcp/mcp_tool.mjs" review filesystem write "$VERIFY_FILE" "blocked" >/tmp/mcp-deny.out 2>/dev/null; then
  echo "MCP_VERIFY permission_denial_failed"
  exit 1
fi
node "$ROOT/scripts/mcp/mcp_tool.mjs" development shell execute "$ROOT" "pwd" >/dev/null
node "$ROOT/scripts/mcp/mcp_tool.mjs" review shell execute_readonly "$ROOT" "pwd" >/dev/null
if node "$ROOT/scripts/mcp/mcp_tool.mjs" review shell execute_readonly "$ROOT" "touch /tmp/agent-loop-readonly-deny" >/tmp/mcp-readonly.out 2>/dev/null; then
  echo "MCP_VERIFY readonly_shell_failed"
  exit 1
fi
if node "$ROOT/scripts/mcp/mcp_tool.mjs" development filesystem delete "$VERIFY_FILE" "" >/tmp/mcp-human-gate.out 2>/dev/null; then
  echo "MCP_VERIFY critical_human_gate_failed"
  exit 1
fi
mkdir -p "$(dirname "$VERIFY_HTML")"
cat > "$VERIFY_HTML" <<'HTML'
<!doctype html>
<html lang="ru">
<body>
  <button data-testid="open">Открыть</button>
  <script>document.querySelector('[data-testid="open"]').addEventListener('click', () => {});</script>
</body>
</html>
HTML
node "$ROOT/scripts/mcp/mcp_tool.mjs" tester browser test "$VERIFY_HTML" "$VERIFY_BROWSER_REPORT" >/tmp/mcp-browser.out
grep -q '"ok": true' /tmp/mcp-browser.out
GITHUB_VERIFY_JSON="$(node "$ROOT/scripts/mcp/mcp_tool.mjs" triage github issues:read "https://api.github.com/rate_limit" || true)"
echo "$GITHUB_VERIFY_JSON" >/tmp/mcp-github.json
GITHUB_REPO_JSON="$(node --input-type=module -e "import { githubRepoConfig } from './scripts/lib/github_config.mjs'; console.log(JSON.stringify(githubRepoConfig()))" 2>/dev/null || echo '{"owner":"","repo":"","source":"none"}')"
GITHUB_OWNER_RESOLVED="$(node -e "const x=JSON.parse(process.argv[1]); console.log(x.owner || 'unset')" "$GITHUB_REPO_JSON")"
GITHUB_REPO_RESOLVED="$(node -e "const x=JSON.parse(process.argv[1]); console.log(x.repo || 'unset')" "$GITHUB_REPO_JSON")"
GITHUB_REPO_SOURCE="$(node -e "const x=JSON.parse(process.argv[1]); console.log(x.source || 'none')" "$GITHUB_REPO_JSON")"

echo "MCP_VERIFY filesystem read_write=passed"
echo "MCP_VERIFY permission review_write_blocked=passed"
echo "MCP_VERIFY shell execute=passed"
echo "MCP_VERIFY shell readonly=passed"
echo "MCP_VERIFY critical human_gate_block=passed"
echo "MCP_VERIFY browser test=passed report=$VERIFY_BROWSER_REPORT"
if echo "$GITHUB_VERIFY_JSON" | grep -q '"authSource": "env"'; then
  echo "MCP_VERIFY github query=token_present source=env owner=$GITHUB_OWNER_RESOLVED repo=$GITHUB_REPO_RESOLVED repo_source=$GITHUB_REPO_SOURCE"
elif echo "$GITHUB_VERIFY_JSON" | grep -q '"authSource": "gh"'; then
  echo "MCP_VERIFY github query=token_present source=gh owner=$GITHUB_OWNER_RESOLVED repo=$GITHUB_REPO_RESOLVED repo_source=$GITHUB_REPO_SOURCE"
else
  echo "MCP_VERIFY github query=no_token_public_rate_limit_only"
fi
echo "MCP_VERIFY_PASSED"
