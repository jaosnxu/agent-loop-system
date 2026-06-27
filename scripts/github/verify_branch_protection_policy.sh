#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

node --check scripts/github/branch_protection_policy.mjs
node --input-type=module <<'NODE'
import fs from "node:fs";
const config = JSON.parse(fs.readFileSync("config/github-branch-protection.config.json", "utf8"));
const required = ["lint", "typecheck", "test", "build-smoke", "audit"];
for (const check of required) {
  if (!config.requiredChecks.includes(check)) throw new Error(`missing required check mapping: ${check}`);
}
if (config.branch !== "main") throw new Error("default protected branch must be main");
if (config.requiredApprovingReviewCount !== 1) throw new Error("requiredApprovingReviewCount must be 1");
if (config.requireBranchesUpToDate !== true) throw new Error("requireBranchesUpToDate must be true");
if (config.enforceAdmins !== true) throw new Error("enforceAdmins must be true");
if (config.allowForcePushes !== false) throw new Error("allowForcePushes must be false");
if (config.allowDeletions !== false) throw new Error("allowDeletions must be false");
NODE

set +e
node scripts/github/branch_protection_policy.mjs check main >/tmp/branch-protection-main.out 2>/tmp/branch-protection-main.err
check_rc=$?
set -e
if [ "$check_rc" -ne 0 ] && [ "$check_rc" -ne 2 ]; then
  echo "VERIFY_BRANCH_PROTECTION_POLICY_FAILED check_rc=$check_rc"
  cat /tmp/branch-protection-main.err
  cat /tmp/branch-protection-main.out
  exit 1
fi
grep -Eq "BRANCH_PROTECTION_(OK|BLOCKED)" /tmp/branch-protection-main.out

AGENT_LOOP_GITHUB_BRANCH_PROTECTION_STAGING=1 node scripts/github/branch_protection_policy.mjs verify-staging >/tmp/branch-protection-staging.out
grep -q "VERIFY_BRANCH_PROTECTION_STAGING_OK" /tmp/branch-protection-staging.out

if gh api repos/jaosnxu/agent-loop-system/branches --paginate --jq '.[].name' | grep -q '^agent-loop-protection-'; then
  echo "VERIFY_BRANCH_PROTECTION_POLICY_FAILED staging_branch_residue"
  exit 1
fi

echo "VERIFY_BRANCH_PROTECTION_POLICY_OK"
