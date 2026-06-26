#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

command -v node >/dev/null
command -v npm >/dev/null

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "MCP_DEPS_FAILED node>=18 required, current=$(node --version)"
  exit 1
fi

npm install --no-save @modelcontextprotocol/server-filesystem @modelcontextprotocol/server-github

FS_VERSION="$(npm view @modelcontextprotocol/server-filesystem version)"
GH_VERSION="$(npm view @modelcontextprotocol/server-github version)"

echo "MCP_DEPS_INSTALLED filesystem=$FS_VERSION github=$GH_VERSION"
echo "MCP_DEPS_NOTE shell official npm package @modelcontextprotocol/server-shell is not published; local MCP-compatible shell server is used."
scripts/mcp/verify_mcp.sh
