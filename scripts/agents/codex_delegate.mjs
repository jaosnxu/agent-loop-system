#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { appendLog, appendSectionItem, ensureDir, nowIso, readState, setField, systemRoot, validateTaskId, writeState } from "../lib/common.mjs";
import { syncBoard } from "../state/sync_board_lib.mjs";

const [role, taskId, promptFileArg = ""] = process.argv.slice(2);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(systemRoot, relativePath), "utf8"));
}

function codexEnabled(config) {
  if (process.env.AGENT_LOOP_CODEX_ENABLED === "1") return true;
  if (process.env.AGENT_LOOP_CODEX_ENABLED === "0") return false;
  return config.enabled === true;
}

function activeProvider(config) {
  const name = process.env.AGENT_LOOP_PROVIDER || config.activeProvider || "codex";
  const provider = config.providers?.[name] || {
    type: "codex-exec",
    command: config.command || "codex",
    enabled: true,
    model: config.model || ""
  };
  return { name, provider };
}

function worktreePath(taskId) {
  return path.resolve(systemRoot, "..", "worktrees", taskId);
}

function executionCwd(taskId) {
  const wt = worktreePath(taskId);
  return fs.existsSync(wt) ? wt : systemRoot;
}

function trimPrompt(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[TRUNCATED_BY_AGENT_LOOP_SYSTEM]\n`;
}

function buildPrompt(stateText, promptText) {
  return [
    promptText,
    "",
    "## Loop Task State",
    stateText,
    "",
    "## Execution Contract",
    "- Read the task state, role prompt, and referenced Skill rules before acting.",
    "- Stay inside the role boundary. Do not self-review or self-score unless the role is review or scoring.",
    "- For write roles, only modify files inside the task worktree.",
    "- For read-only roles, do not modify files.",
    "- End with a concise result summary and any blockers."
  ].join("\n");
}

function runProvider({ config, providerName, provider, taskId, role, prompt, resultOut }) {
  if (provider.enabled === false) {
    throw new Error(`Provider disabled: ${providerName}`);
  }
  const command = provider.command || config.command || "codex";
  const sandbox = config.sandboxByRole?.[role] || "read-only";
  if (provider.type === "codex-exec") {
    const args = ["exec", "-C", executionCwd(taskId), "-s", sandbox, "-o", resultOut];
    const model = provider.model || config.model;
    if (model) args.push("-m", model);
    args.push("-");
    return spawnSync(command, args, { cwd: systemRoot, input: prompt, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  }
  if (provider.type === "generic-stdin") {
    const args = provider.args || [];
    const result = spawnSync(command, args, { cwd: executionCwd(taskId), input: prompt, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    if (result.status === 0) {
      fs.writeFileSync(resultOut, result.stdout || "");
    }
    return result;
  }
  throw new Error(`Unsupported provider type: ${provider.type}`);
}

function recordCodexResult(taskId, role, resultOut) {
  let text = readState(taskId);
  const resultText = fs.existsSync(resultOut) ? fs.readFileSync(resultOut, "utf8").slice(0, 600).replace(/\s+/g, " ").trim() : "";
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Action Journal", `${nowIso()} actor=codex-${role} action="execute delegated Codex subtask" target=${JSON.stringify(resultOut)} result=${JSON.stringify(resultText)} next_check="orchestrator must parse role result and route next stage"`);
  text = appendSectionItem(text, "Evidence", `${nowIso()} codex role=${role} result=${resultOut} summary=${JSON.stringify(resultText)}`);
  writeState(taskId, text);
  syncBoard();
  spawnSync(process.execPath, ["scripts/memory/sync_task_memory.mjs", taskId], { cwd: systemRoot, encoding: "utf8" });
}

try {
  if (!role) throw new Error("Missing role");
  validateTaskId(taskId);
  const config = readJson("config/codex.config.json");
  const stateText = readState(taskId);
  const promptFile = promptFileArg || `prompts/agents/${role}-agent.md`;
  const promptPath = path.join(systemRoot, promptFile);
  if (!fs.existsSync(promptPath)) throw new Error(`Missing prompt file: ${promptFile}`);

  const prompt = trimPrompt(buildPrompt(stateText, fs.readFileSync(promptPath, "utf8")), Number(config.promptMaxChars || 24000));
  const outDir = path.join(systemRoot, config.outputDir || "logs/codex");
  ensureDir(outDir);
  const promptOut = path.join(outDir, `${taskId}.${role}.prompt.md`);
  const resultOut = path.join(outDir, `${taskId}.${role}.result.md`);
  fs.writeFileSync(promptOut, prompt);

  if (!codexEnabled(config)) {
    appendLog("logs/orchestrator.log", `codex_delegate_disabled role=${role} task=${taskId} prompt=${promptOut}`);
    console.log(`CODEX_DELEGATE_DISABLED role=${role} task=${taskId} prompt=${promptOut}`);
    process.exit(0);
  }

  const { name: providerName, provider } = activeProvider(config);
  const result = runProvider({ config, providerName, provider, taskId, role, prompt, resultOut });
  appendLog("logs/orchestrator.log", `codex_delegate role=${role} task=${taskId} provider=${providerName} status=${result.status} cwd=${executionCwd(taskId)}`);
  if (result.stdout.trim()) appendLog("logs/orchestrator.log", `codex_stdout ${JSON.stringify(result.stdout.slice(0, 800))}`);
  if (result.stderr.trim()) appendLog("logs/orchestrator.log", `codex_stderr ${JSON.stringify(result.stderr.slice(0, 800))}`);
  if (result.status !== 0) throw new Error(`Codex delegate failed role=${role} status=${result.status}: ${result.stderr || result.stdout}`);

  recordCodexResult(taskId, role, resultOut);
  console.log(`CODEX_DELEGATE_OK role=${role} task=${taskId} result=${resultOut}`);
} catch (error) {
  appendLog("logs/error.log", `codex_delegate_failed role=${role || "unset"} task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`CODEX_DELEGATE_FAILED: ${error.message}`);
  process.exit(1);
}
