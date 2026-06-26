#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

uppercase_dir_pattern='^S[K]ILLS/'
uppercase_ref_pattern='S[K]ILLS/'

if git ls-files | grep -q "$uppercase_dir_pattern"; then
  echo "VERIFY_SKILL_STANDARD_FAILED uppercase_legacy_dir_tracked"
  git ls-files | grep "$uppercase_dir_pattern"
  exit 1
fi

required=(
  skills/loop-engineering/SKILL.md
  skills/triage-agent/SKILL.md
  skills/development-agent/SKILL.md
  skills/prototyper-agent/SKILL.md
  skills/tester-agent/SKILL.md
  skills/review-agent/SKILL.md
  skills/scoring-agent/SKILL.md
)

for file in "${required[@]}"; do
  test -f "$file"
  head -n 1 "$file" | grep -q '^---$'
  grep -q '^name:' "$file"
  grep -q '^description:' "$file"
done

if find . -path './node_modules' -prune -o -path './logs' -prune -o -path './memory/tasks' -prune -o -path './states' -prune -o -type f -print | xargs grep -n "$uppercase_ref_pattern" >/tmp/agent-loop-skills-uppercase.out 2>/dev/null; then
  echo "VERIFY_SKILL_STANDARD_FAILED uppercase_legacy_reference"
  cat /tmp/agent-loop-skills-uppercase.out
  exit 1
fi

echo "VERIFY_SKILL_STANDARD_OK"
