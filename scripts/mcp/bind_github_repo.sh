#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OWNER="${1:-}"
REPO="${2:-}"

if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
  REMOTE="$(git -C "$ROOT/.." remote get-url origin 2>/dev/null || true)"
  if [[ "$REMOTE" =~ github.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    OWNER="${BASH_REMATCH[1]}"
    REPO="${BASH_REMATCH[2]}"
  fi
fi

if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
  echo "Usage: scripts/mcp/bind_github_repo.sh OWNER REPO" >&2
  echo "No GitHub origin remote was found, so owner/repo cannot be inferred." >&2
  exit 2
fi

cat > "$ROOT/config/github.local.env" <<EOF
GITHUB_OWNER=$OWNER
GITHUB_REPO=$REPO
EOF

echo "GITHUB_REPO_BOUND owner=$OWNER repo=$REPO file=config/github.local.env"
