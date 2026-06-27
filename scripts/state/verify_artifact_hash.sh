#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TASK_ID="artifact-hash-smoke"
ARTIFACT_DIR="/tmp/agent-loop-artifact-hash-smoke"
rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR"
echo "first" > "$ARTIFACT_DIR/output.txt"

node scripts/state/create_state.mjs "$TASK_ID" "Artifact hash smoke" \
  --priority=P1 \
  --type=example \
  --requirement="Record artifact hashes and no-progress changes." \
  --acceptance="Repeated unchanged artifact hash increments No Progress Count and memory includes Artifact Hashes." >/dev/null

node scripts/state/record_artifact_hash.mjs "$TASK_ID" "$ARTIFACT_DIR" output >/tmp/artifact-hash-1.out
grep -q "status=changed" /tmp/artifact-hash-1.out
grep -q "No Progress Count: 0" "states/state_$TASK_ID.md"

node scripts/state/record_artifact_hash.mjs "$TASK_ID" "$ARTIFACT_DIR" output >/tmp/artifact-hash-2.out
grep -q "status=unchanged" /tmp/artifact-hash-2.out
grep -q "No Progress Count: 1" "states/state_$TASK_ID.md"
grep -q "## Artifact Hashes" "memory/tasks/$TASK_ID.md"

echo "second" > "$ARTIFACT_DIR/output.txt"
node scripts/state/record_artifact_hash.mjs "$TASK_ID" "$ARTIFACT_DIR" output >/tmp/artifact-hash-3.out
grep -q "status=changed" /tmp/artifact-hash-3.out
grep -q "No Progress Count: 0" "states/state_$TASK_ID.md"

rm -f "states/state_$TASK_ID.md" "memory/tasks/$TASK_ID.md"
rm -rf "$ARTIFACT_DIR"
node scripts/state/sync_board.mjs >/dev/null

echo "VERIFY_ARTIFACT_HASH_OK"
