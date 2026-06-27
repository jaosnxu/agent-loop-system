#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { appendLog, appendSectionItem, ensureDir, nowIso, readState, setField, systemRoot, validateTaskId, writeState } from "../lib/common.mjs";
import { syncBoard } from "../state/sync_board_lib.mjs";
import { recordStructuredEvidence } from "../state/structured_evidence_lib.mjs";
import { estimateTokensFromText, recordBudgetUsage } from "../state/budget_lib.mjs";

const [role, taskId, promptFileArg = ""] = process.argv.slice(2);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(systemRoot, relativePath), "utf8"));
}

function codexEnabled(config) {
  if (process.env.AGENT_LOOP_CODEX_ENABLED === "1") return true;
  if (process.env.AGENT_LOOP_CODEX_ENABLED === "0") return false;
  return config.enabled === true;
}

function roleProviderOverride(role) {
  const key = `AGENT_LOOP_PROVIDER_${role.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  return process.env[key];
}

function activeProvider(config, role) {
  const name = roleProviderOverride(role) || process.env.AGENT_LOOP_PROVIDER || config.providerByRole?.[role] || config.activeProvider || "codex";
  const provider = config.providers?.[name] || {
    type: "codex-exec",
    command: config.command || "codex",
    enabled: true,
    model: config.model || ""
  };
  return { name, provider };
}

function providerTimeoutMs(config, provider) {
  const raw = process.env.AGENT_LOOP_CODEX_TIMEOUT_MS || provider.timeoutMs || config.timeoutMs || 300000;
  const timeoutMs = Number(raw);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined;
  return timeoutMs;
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

function buildPrompt(stateText, promptText, { role, taskId }) {
  const parts = [
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
  ];
  if (process.env.AGENT_LOOP_CODEX_SMOKE === "1") {
    parts.push(
      "",
      "## Smoke Mode Contract",
      "- This is a connector smoke test, not a product task.",
      "- Do not call tools.",
      "- Do not modify files.",
      "- Return only the YAML role result for this task.",
      `- task_id must be ${taskId}.`,
      `- role must be ${role}.`
    );
  }
  return parts.join("\n");
}

function runProvider({ config, providerName, provider, taskId, role, prompt, resultOut }) {
  if (provider.enabled === false) {
    throw new Error(`Provider disabled: ${providerName}`);
  }
  const command = provider.command || config.command || "codex";
  const sandbox = config.sandboxByRole?.[role] || "read-only";
  const timeout = providerTimeoutMs(config, provider);
  const spawnOptions = { cwd: systemRoot, input: prompt, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout, killSignal: "SIGTERM" };
  if (provider.type === "codex-exec") {
    const args = ["exec", "-C", executionCwd(taskId), "-s", sandbox, "-o", resultOut];
    const model = provider.model || config.model;
    if (model) args.push("-m", model);
    if (Array.isArray(provider.args)) args.push(...provider.args);
    args.push("-");
    return spawnSync(command, args, spawnOptions);
  }
  if (provider.type === "generic-stdin") {
    const args = provider.args || [];
    const result = spawnSync(command, args, { ...spawnOptions, cwd: executionCwd(taskId) });
    if (result.status === 0) {
      fs.writeFileSync(resultOut, result.stdout || "");
    }
    return result;
  }
  throw new Error(`Unsupported provider type: ${provider.type}`);
}

function inferDecision(role, resultText) {
  if (/gate_result:\s*FAIL\b/i.test(resultText) || /next_stage:\s*returned_to_development\b/i.test(resultText)) return "fail";
  if (/gate_result:\s*PASS\b/i.test(resultText) || /next_stage:\s*scoring\b/i.test(resultText)) return "pass";
  if (role === "review" || role === "scoring") return "undetermined";
  return "completed";
}

function writeStructuredResult({ taskId, role, providerName, promptOut, resultOut, status, statusCode, summary }) {
  const structuredOut = path.join(path.dirname(resultOut), `${taskId}.${role}.result.json`);
  const body = {
    schemaVersion: "agent-result/v1",
    taskId,
    role,
    provider: providerName,
    status,
    statusCode,
    decision: inferDecision(role, summary || ""),
    promptPath: promptOut,
    rawResultPath: resultOut,
    summary: summary || "",
    createdAt: nowIso()
  };
  fs.writeFileSync(structuredOut, `${JSON.stringify(body, null, 2)}\n`);
  return structuredOut;
}

function recordCodexResult(taskId, role, providerName, promptOut, resultOut, status = "completed", statusCode = 0) {
  let text = readState(taskId);
  const resultText = fs.existsSync(resultOut) ? fs.readFileSync(resultOut, "utf8").slice(0, 600).replace(/\s+/g, " ").trim() : "";
  const structuredOut = writeStructuredResult({ taskId, role, providerName, promptOut, resultOut, status, statusCode, summary: resultText });
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Action Journal", `${nowIso()} actor=codex-${role} action="execute delegated model subtask" target=${JSON.stringify(structuredOut)} result=${JSON.stringify(resultText)} next_check="orchestrator must parse structured role result and route next stage"`);
  text = appendSectionItem(text, "Evidence", `${nowIso()} agent_result role=${role} provider=${providerName} status=${status} structured=${structuredOut} raw=${resultOut} summary=${JSON.stringify(resultText)}`);
  text = recordStructuredEvidence(taskId, {
    type: "agent_result",
    actor: `codex-${role}`,
    action: "execute delegated model subtask",
    target: structuredOut,
    result: status,
    nextCheck: "orchestrator must parse structured role result and route next stage",
    details: { role, provider: providerName, status, statusCode, promptPath: promptOut, rawResultPath: resultOut, summary: resultText }
  }, text).text;
  writeState(taskId, text);
  syncBoard();
  spawnSync(process.execPath, ["scripts/memory/sync_task_memory.mjs", taskId], { cwd: systemRoot, encoding: "utf8" });
  if (["completed", "failed", "timeout"].includes(status)) {
    const promptText = fs.existsSync(promptOut) ? fs.readFileSync(promptOut, "utf8") : "";
    const rawText = fs.existsSync(resultOut) ? fs.readFileSync(resultOut, "utf8") : "";
    recordBudgetUsage({
      taskId,
      source: "codex_delegate",
      actor: `codex-${role}`,
      tool: "model",
      operation: "delegate",
      target: resultOut,
      result: status,
      tokenEstimate: estimateTokensFromText(promptText) + estimateTokensFromText(rawText),
      toolCalls: 1,
      details: { role, provider: providerName, statusCode, promptPath: promptOut, rawResultPath: resultOut }
    });
  }
}

try {
  if (!role) throw new Error("Missing role");
  validateTaskId(taskId);
  const config = readJson("config/codex.config.json");
  const stateText = readState(taskId);
  const promptFile = promptFileArg || `prompts/agents/${role}-agent.md`;
  const promptPath = path.join(systemRoot, promptFile);
  if (!fs.existsSync(promptPath)) throw new Error(`Missing prompt file: ${promptFile}`);

  const prompt = trimPrompt(buildPrompt(stateText, fs.readFileSync(promptPath, "utf8"), { role, taskId }), Number(config.promptMaxChars || 24000));
  const outDir = path.join(systemRoot, config.outputDir || "logs/codex");
  ensureDir(outDir);
  const promptOut = path.join(outDir, `${taskId}.${role}.prompt.md`);
  const resultOut = path.join(outDir, `${taskId}.${role}.result.md`);
  fs.writeFileSync(promptOut, prompt);
  const { name: providerName, provider } = activeProvider(config, role);

  if (!codexEnabled(config)) {
    appendLog("logs/orchestrator.log", `codex_delegate_disabled role=${role} task=${taskId} prompt=${promptOut}`);
    fs.writeFileSync(resultOut, "CODEX_DELEGATE_DISABLED\n");
    recordCodexResult(taskId, role, providerName, promptOut, resultOut, "disabled", 0);
    console.log(`CODEX_DELEGATE_DISABLED role=${role} task=${taskId} prompt=${promptOut}`);
    process.exit(0);
  }

  const result = runProvider({ config, providerName, provider, taskId, role, prompt, resultOut });
  appendLog("logs/orchestrator.log", `codex_delegate role=${role} task=${taskId} provider=${providerName} status=${result.status} cwd=${executionCwd(taskId)}`);
  if (result.stdout.trim()) appendLog("logs/orchestrator.log", `codex_stdout ${JSON.stringify(result.stdout.slice(0, 800))}`);
  if (result.stderr.trim()) appendLog("logs/orchestrator.log", `codex_stderr ${JSON.stringify(result.stderr.slice(0, 800))}`);
  if (result.error || result.status !== 0) {
    const status = result.error?.code === "ETIMEDOUT" ? "timeout" : "failed";
    const statusCode = typeof result.status === "number" ? result.status : 1;
    const failureText = [
      result.error ? `error=${result.error.message}` : "",
      result.signal ? `signal=${result.signal}` : "",
      result.stderr || "",
      result.stdout || ""
    ].filter(Boolean).join("\n").slice(0, 4000);
    if (!fs.existsSync(resultOut) || !fs.readFileSync(resultOut, "utf8").trim()) {
      fs.writeFileSync(resultOut, `${failureText || "CODEX_DELEGATE_FAILED"}\n`);
    }
    recordCodexResult(taskId, role, providerName, promptOut, resultOut, status, statusCode);
    throw new Error(`Codex delegate ${status} role=${role} status=${result.status ?? "unset"} signal=${result.signal || "none"}: ${result.stderr || result.stdout || result.error?.message || "no output"}`);
  }

  recordCodexResult(taskId, role, providerName, promptOut, resultOut, "completed", result.status);
  console.log(`CODEX_DELEGATE_OK role=${role} task=${taskId} result=${resultOut}`);
} catch (error) {
  appendLog("logs/error.log", `codex_delegate_failed role=${role || "unset"} task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`CODEX_DELEGATE_FAILED: ${error.message}`);
  process.exit(1);
}
