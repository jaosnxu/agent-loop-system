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

function recordCodexResult(taskId, role, resultOut) {
  let text = readState(taskId);
  const resultText = fs.existsSync(resultOut) ? fs.readFileSync(resultOut, "utf8").slice(0, 600).replace(/\s+/g, " ").trim() : "";
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Evidence", `${nowIso()} codex role=${role} result=${resultOut} summary=${JSON.stringify(resultText)}`);
  writeState(taskId, text);
  syncBoard();
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

  const sandbox = config.sandboxByRole?.[role] || "read-only";
  const args = ["exec", "-C", executionCwd(taskId), "-s", sandbox, "-o", resultOut];
  if (config.model) args.push("-m", config.model);
  args.push("-");

  const result = spawnSync(config.command || "codex", args, { cwd: systemRoot, input: prompt, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  appendLog("logs/orchestrator.log", `codex_delegate role=${role} task=${taskId} status=${result.status} sandbox=${sandbox} cwd=${executionCwd(taskId)}`);
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
