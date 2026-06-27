#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { appendLog, systemRoot } from "../lib/common.mjs";

const config = JSON.parse(fs.readFileSync("config/codex.config.json", "utf8"));
const requiredProviders = ["codex", "claude", "opencode", "gemini"];

function run(command, args, timeoutMs = 15000) {
  return spawnSync(command, args, {
    cwd: systemRoot,
    encoding: "utf8",
    stdio: "pipe",
    timeout: timeoutMs,
    killSignal: "SIGTERM"
  });
}

function versionArgsFor(name, provider) {
  if (Array.isArray(provider.versionArgs)) return provider.versionArgs;
  return ["--version"];
}

function summarizeOutput(result) {
  return `${result.stdout || result.stderr || ""}`.trim().replace(/\s+/g, " ").slice(0, 240);
}

const results = [];
const failures = [];

for (const name of requiredProviders) {
  const provider = config.providers?.[name];
  if (!provider) {
    failures.push(`provider_missing:${name}`);
    continue;
  }
  if (!provider.command) {
    failures.push(`provider_command_missing:${name}`);
    continue;
  }
  const versionArgs = versionArgsFor(name, provider);
  const result = run(provider.command, versionArgs);
  const record = {
    provider: name,
    command: provider.command,
    versionArgs,
    status: result.status,
    signal: result.signal,
    output: summarizeOutput(result),
    enabled: provider.enabled === true
  };
  results.push(record);
  if (result.error) failures.push(`provider_version_error:${name}:${result.error.code || result.error.message}`);
  else if (result.status !== 0) failures.push(`provider_version_failed:${name}:status_${result.status}`);
  else if (!record.output) failures.push(`provider_version_empty:${name}`);
  if (name !== "codex" && provider.enabled === true && process.env.AGENT_LOOP_ALLOW_EXTERNAL_PROVIDER_ENABLED !== "1") {
    failures.push(`external_provider_enabled_without_override:${name}`);
  }
}

appendLog("logs/orchestrator.log", `provider_contracts results=${JSON.stringify(results)} failures=${JSON.stringify(failures)}`);

if (failures.length) {
  console.log(`VERIFY_PROVIDER_CONTRACTS_BLOCKED ${JSON.stringify({ ok: false, failures, results })}`);
  process.exit(2);
}

console.log(`VERIFY_PROVIDER_CONTRACTS_OK ${JSON.stringify({ ok: true, results })}`);
