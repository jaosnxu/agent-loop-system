#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="skill-checksum-smoke"
rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
rm -f "logs/codex/$TASK_ID.triage.prompt.md" "logs/codex/$TASK_ID.triage.result.md"

node scripts/state/create_state.mjs "$TASK_ID" "Skill checksum smoke" \
  --priority=P2 \
  --type=example \
  --requirement="Record Skill checksums before agent delegation." \
  --acceptance="State and memory contain sha256 evidence for required Skill files." >/dev/null

AGENT_LOOP_CODEX_ENABLED=0 node scripts/agents/run_agent.mjs triage "$TASK_ID" >/tmp/agent-loop-skill-checksum.out

grep -q 'skills/loop-engineering/SKILL.md:bytes=' "states/state_$TASK_ID.md"
grep -q 'skills/triage-agent/SKILL.md:bytes=' "states/state_$TASK_ID.md"
grep -q 'sha256=' "states/state_$TASK_ID.md"
node scripts/memory/sync_task_memory.mjs "$TASK_ID" >/dev/null
grep -q 'sha256=' "memory/tasks/$TASK_ID.md"

rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
rm -f "logs/codex/$TASK_ID.triage.prompt.md" "logs/codex/$TASK_ID.triage.result.md"
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_SKILL_CHECKSUMS_OK"
