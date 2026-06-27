#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

node --input-type=module <<'NODE'
import fs from "node:fs";
const config = JSON.parse(fs.readFileSync("config/codex.config.json", "utf8"));
if (!config.activeProvider) throw new Error("activeProvider missing");
if (!config.providers || typeof config.providers !== "object") throw new Error("providers registry missing");
if (!config.providers[config.activeProvider]) throw new Error(`activeProvider not found: ${config.activeProvider}`);
if (!config.timeoutMs || Number(config.timeoutMs) <= 0) throw new Error("timeoutMs must be positive");
for (const name of ["codex", "claude", "opencode", "gemini"]) {
  const provider = config.providers[name];
  if (!provider) throw new Error(`provider missing: ${name}`);
  if (!provider.type) throw new Error(`provider type missing: ${name}`);
  if (!provider.command) throw new Error(`provider command missing: ${name}`);
  if (provider.timeoutMs !== undefined && Number(provider.timeoutMs) <= 0) throw new Error(`provider timeoutMs must be positive: ${name}`);
}
if (config.providers.codex.type !== "codex-exec") throw new Error("codex provider must use codex-exec");
if (!Array.isArray(config.providers.codex.args)) throw new Error("codex provider args must be explicit");
const requiredRoles = ["triage", "development", "prototyper", "tester", "review", "scoring"];
if (!config.providerByRole || typeof config.providerByRole !== "object") throw new Error("providerByRole missing");
for (const role of requiredRoles) {
  const providerName = config.providerByRole[role];
  if (!providerName) throw new Error(`providerByRole missing role: ${role}`);
  if (!config.providers[providerName]) throw new Error(`providerByRole ${role} points to unknown provider: ${providerName}`);
}
for (const name of ["claude", "opencode", "gemini"]) {
  if (config.providers[name].enabled === true) {
    throw new Error(`${name} must not be enabled until its local CLI contract is verified`);
  }
}
NODE

command -v codex >/dev/null

echo "VERIFY_MODEL_PROVIDERS_OK activeProvider=$(node -e "console.log(require('./config/codex.config.json').activeProvider)") reviewProvider=$(node -e "console.log(require('./config/codex.config.json').providerByRole.review)")"
