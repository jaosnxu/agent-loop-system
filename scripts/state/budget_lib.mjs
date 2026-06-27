import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { appendLog, ensureDir, getField, nowIso, readState, setField, systemRoot, validateTaskId, writeState } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";
import { recordStructuredEvidence } from "./structured_evidence_lib.mjs";

export function estimateTokensFromText(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return Math.max(0, Math.ceil(text.length / 4));
}

export function budgetPath(taskId) {
  validateTaskId(taskId);
  return path.join(systemRoot, "memory/budget", `${taskId}.jsonl`);
}

function stateExists(taskId) {
  if (!taskId || taskId === "unbound") return false;
  try {
    validateTaskId(taskId);
  } catch {
    return false;
  }
  return fs.existsSync(path.join(systemRoot, `states/state_${taskId}.md`));
}

export function recordBudgetUsage({
  taskId,
  source,
  actor = "system",
  tool = "",
  operation = "",
  target = "",
  result = "",
  tokenEstimate = 0,
  toolCalls = 0,
  details = {}
}) {
  if (!stateExists(taskId)) return { recorded: false, reason: "missing_state" };
  const tokenDelta = Math.max(0, Number(tokenEstimate) || 0);
  const toolDelta = Math.max(0, Number(toolCalls) || 0);
  let text = readState(taskId);
  const beforeTokens = Number(getField(text, "Token Budget Used") || 0);
  const beforeToolCalls = Number(getField(text, "Tool Call Count") || 0);
  const afterTokens = beforeTokens + tokenDelta;
  const afterToolCalls = beforeToolCalls + toolDelta;
  const entry = {
    schemaVersion: "budget-usage/v1",
    taskId,
    source: source || "unknown",
    actor,
    tool,
    operation,
    target: String(target || "").slice(0, 500),
    result: String(result || "").slice(0, 500),
    tokenEstimate: tokenDelta,
    toolCalls: toolDelta,
    beforeTokens,
    afterTokens,
    beforeToolCalls,
    afterToolCalls,
    details,
    createdAt: nowIso()
  };
  text = setField(text, "Token Budget Used", String(afterTokens));
  text = setField(text, "Tool Call Count", String(afterToolCalls));
  text = setField(text, "Updated At", entry.createdAt);
  text = recordStructuredEvidence(taskId, {
    type: "budget_usage",
    actor,
    action: `${source || "budget"}:${tool || "unknown"}:${operation || "unknown"}`,
    target,
    result,
    nextCheck: "safety brake must use updated token and tool-call counters",
    details: entry
  }, text).text;
  writeState(taskId, text);
  syncBoard();
  const targetFile = budgetPath(taskId);
  ensureDir(path.dirname(targetFile));
  fs.appendFileSync(targetFile, `${JSON.stringify(entry)}\n`);
  spawnSync(process.execPath, ["scripts/memory/sync_task_memory.mjs", taskId], { cwd: systemRoot, encoding: "utf8" });
  appendLog("logs/state.log", `budget_usage task=${taskId} source=${entry.source} tool=${tool} operation=${operation} token_delta=${tokenDelta} tool_delta=${toolDelta} tokens=${afterTokens} tools=${afterToolCalls}`);
  return { recorded: true, entry };
}
