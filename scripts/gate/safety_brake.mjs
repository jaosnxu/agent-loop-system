#!/usr/bin/env node
import { readState, getField, appendLog, validateTaskId } from "../lib/common.mjs";

const [taskId] = process.argv.slice(2);

const limits = {
  maxIterations: Number(process.env.MAX_ITERATIONS || 10),
  maxNoProgress: Number(process.env.MAX_NO_PROGRESS || 3),
  maxToolCalls: Number(process.env.MAX_TOOL_CALLS || 200),
  maxTokenBudget: Number(process.env.MAX_TOKEN_BUDGET || 200000)
};

try {
  validateTaskId(taskId);
  const text = readState(taskId);
  const iterationCount = Number(getField(text, "Iteration Count") || 0);
  const noProgressCount = Number(getField(text, "No Progress Count") || 0);
  const tokenBudgetUsed = Number(getField(text, "Token Budget Used") || 0);
  const toolCallCount = Number(getField(text, "Tool Call Count") || 0);
  const blockers = [];

  if (iterationCount >= limits.maxIterations) blockers.push(`iteration_limit ${iterationCount}/${limits.maxIterations}`);
  if (noProgressCount >= limits.maxNoProgress) blockers.push(`no_progress_limit ${noProgressCount}/${limits.maxNoProgress}`);
  if (tokenBudgetUsed >= limits.maxTokenBudget) blockers.push(`token_budget_limit ${tokenBudgetUsed}/${limits.maxTokenBudget}`);
  if (toolCallCount >= limits.maxToolCalls) blockers.push(`tool_call_limit ${toolCallCount}/${limits.maxToolCalls}`);

  if (blockers.length) {
    appendLog("logs/gate.log", `SAFETY_BRAKE_BLOCKED task=${taskId} blockers=${JSON.stringify(blockers)}`);
    console.log("SAFETY_BRAKE_BLOCKED");
    for (const blocker of blockers) console.log(`- ${blocker}`);
    process.exit(2);
  }

  appendLog("logs/gate.log", `SAFETY_BRAKE_PASSED task=${taskId}`);
  console.log("SAFETY_BRAKE_PASSED");
} catch (error) {
  appendLog("logs/gate.log", `SAFETY_BRAKE_ERROR task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`SAFETY_BRAKE_ERROR: ${error.message}`);
  process.exit(1);
}
