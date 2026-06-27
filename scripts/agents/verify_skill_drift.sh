#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="skill-drift-smoke"
SKILL_FILE="skills/triage-agent/SKILL.md"
BACKUP="$(mktemp)"
cp "$SKILL_FILE" "$BACKUP"

cleanup() {
  cp "$BACKUP" "$SKILL_FILE"
  rm -f "$BACKUP"
  rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
  rm -f "logs/codex/$TASK_ID.triage.prompt.md" "logs/codex/$TASK_ID.triage.result.md" "logs/codex/$TASK_ID.triage.result.json"
  node scripts/state/sync_board.mjs >/dev/null 2>&1 || true
}
trap cleanup EXIT

original_hash="$(shasum -a 256 "$SKILL_FILE" | awk '{print $1}')"
printf '\n<!-- skill drift smoke %s -->\n' "$(date -u +%Y%m%dT%H%M%SZ)" >> "$SKILL_FILE"
changed_hash="$(shasum -a 256 "$SKILL_FILE" | awk '{print $1}')"

if [ "$original_hash" = "$changed_hash" ]; then
  echo "VERIFY_SKILL_DRIFT_FAILED hash_unchanged_after_edit"
  exit 1
fi

node scripts/state/create_state.mjs "$TASK_ID" "Skill drift smoke" \
  --priority=P2 \
  --type=example \
  --requirement="Changed Skill file must affect next agent-read evidence." \
  --acceptance="State evidence contains the changed Skill sha256." >/dev/null

AGENT_LOOP_CODEX_ENABLED=0 node scripts/agents/run_agent.mjs triage "$TASK_ID" >/tmp/skill-drift-run.out
grep -q "skills/triage-agent/SKILL.md:bytes=" "states/state_$TASK_ID.md"
grep -q "sha256=$changed_hash" "states/state_$TASK_ID.md"
grep -q "sha256=$changed_hash" "memory/tasks/$TASK_ID.md"

echo "VERIFY_SKILL_DRIFT_OK"
