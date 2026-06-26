#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKTREES_ROOT="$(cd "$ROOT/.." && pwd)/worktrees"
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
if node --input-type=module -e "await import('playwright')" >/tmp/mcp-playwright-check.out 2>/tmp/mcp-playwright-check.err; then
  node "$ROOT/scripts/mcp/mcp_tool.mjs" tester browser test "$VERIFY_HTML" "{\"reportPath\":\"$VERIFY_BROWSER_REPORT.real.md\",\"requirePlaywright\":true}" >/tmp/mcp-browser-real.out
  grep -q '"ok": true' /tmp/mcp-browser-real.out
  node -e "const outer=JSON.parse(require('fs').readFileSync('/tmp/mcp-browser-real.out','utf8')); const inner=JSON.parse(outer.stdout); if (inner.mode !== 'playwright') process.exit(1);"
  BROWSER_REAL_STATUS="playwright_required_passed"
else
  if node "$ROOT/scripts/mcp/mcp_tool.mjs" tester browser test "$VERIFY_HTML" "{\"reportPath\":\"$VERIFY_BROWSER_REPORT.real.md\",\"requirePlaywright\":true}" >/tmp/mcp-browser-real-deny.out 2>/dev/null; then
    echo "MCP_VERIFY browser_require_playwright_failed"
    exit 1
  fi
  BROWSER_REAL_STATUS="playwright_not_installed_require_mode_blocks"
fi
GITHUB_VERIFY_JSON="$(node "$ROOT/scripts/mcp/mcp_tool.mjs" triage github issues:read "https://api.github.com/rate_limit" || true)"
echo "$GITHUB_VERIFY_JSON" >/tmp/mcp-github.json
GITHUB_REPO_JSON="$(node --input-type=module -e "import { githubRepoConfig } from './scripts/lib/github_config.mjs'; console.log(JSON.stringify(githubRepoConfig()))" 2>/dev/null || echo '{"owner":"","repo":"","source":"none"}')"
GITHUB_OWNER_RESOLVED="$(node -e "const x=JSON.parse(process.argv[1]); console.log(x.owner || 'unset')" "$GITHUB_REPO_JSON")"
GITHUB_REPO_RESOLVED="$(node -e "const x=JSON.parse(process.argv[1]); console.log(x.repo || 'unset')" "$GITHUB_REPO_JSON")"
GITHUB_REPO_SOURCE="$(node -e "const x=JSON.parse(process.argv[1]); console.log(x.source || 'none')" "$GITHUB_REPO_JSON")"
GITHUB_REPO_STATUS="repo_unset"
GITHUB_PRS_STATUS="repo_unset"
GITHUB_COMMITS_STATUS="repo_unset"
GITHUB_CI_STATUS="repo_unset"
if [[ "$GITHUB_OWNER_RESOLVED" != "unset" && "$GITHUB_REPO_RESOLVED" != "unset" ]]; then
  GITHUB_API_BASE="https://api.github.com/repos/$GITHUB_OWNER_RESOLVED/$GITHUB_REPO_RESOLVED"
  node "$ROOT/scripts/mcp/mcp_tool.mjs" review github contents:read "$GITHUB_API_BASE" >/tmp/mcp-github-repo.json
  grep -q '"ok": true' /tmp/mcp-github-repo.json
  GITHUB_REPO_STATUS="passed"
  node "$ROOT/scripts/mcp/mcp_tool.mjs" review github pull_requests:read "$GITHUB_API_BASE/pulls?state=open&per_page=5" >/tmp/mcp-github-pulls.json
  grep -q '"ok": true' /tmp/mcp-github-pulls.json
  GITHUB_PRS_STATUS="passed"
  node "$ROOT/scripts/mcp/mcp_tool.mjs" review github contents:read "$GITHUB_API_BASE/commits?per_page=1" >/tmp/mcp-github-commits.json
  grep -q '"ok": true' /tmp/mcp-github-commits.json
  GITHUB_COMMITS_STATUS="passed"
  node "$ROOT/scripts/mcp/mcp_tool.mjs" review github pull_requests:read "$GITHUB_API_BASE/actions/runs?per_page=1" >/tmp/mcp-github-actions.json
  grep -q '"ok": true' /tmp/mcp-github-actions.json
  GITHUB_CI_STATUS="passed"
fi

echo "MCP_VERIFY filesystem read_write=passed"
echo "MCP_VERIFY permission review_write_blocked=passed"
echo "MCP_VERIFY shell execute=passed"
echo "MCP_VERIFY shell readonly=passed"
echo "MCP_VERIFY critical human_gate_block=passed"
echo "MCP_VERIFY browser test=passed report=$VERIFY_BROWSER_REPORT"
echo "MCP_VERIFY browser real_mode=$BROWSER_REAL_STATUS"
if echo "$GITHUB_VERIFY_JSON" | grep -q '"authSource": "env"'; then
  echo "MCP_VERIFY github query=token_present source=env owner=$GITHUB_OWNER_RESOLVED repo=$GITHUB_REPO_RESOLVED repo_source=$GITHUB_REPO_SOURCE"
elif echo "$GITHUB_VERIFY_JSON" | grep -q '"authSource": "gh"'; then
  echo "MCP_VERIFY github query=token_present source=gh owner=$GITHUB_OWNER_RESOLVED repo=$GITHUB_REPO_RESOLVED repo_source=$GITHUB_REPO_SOURCE"
else
  echo "MCP_VERIFY github query=no_token_public_rate_limit_only"
fi
echo "MCP_VERIFY github repo_read=$GITHUB_REPO_STATUS pulls_read=$GITHUB_PRS_STATUS commits_read=$GITHUB_COMMITS_STATUS actions_runs_read=$GITHUB_CI_STATUS"
echo "MCP_VERIFY_PASSED"
