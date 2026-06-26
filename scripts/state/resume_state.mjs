#!/usr/bin/env node
import { readState, getField, validateTaskId, appendLog } from "../lib/common.mjs";

const [taskId] = process.argv.slice(2);

try {
  validateTaskId(taskId);
  const text = readState(taskId);
  const payload = {
    taskId,
    currentStage: getField(text, "Current Stage"),
    iterationCount: Number(getField(text, "Iteration Count") || 0),
    tokenBudgetUsed: Number(getField(text, "Token Budget Used") || 0),
    toolCallCount: Number(getField(text, "Tool Call Count") || 0),
    prd: getField(text, "PRD"),
    scope: getField(text, "Scope"),
    requirement: getField(text, "Requirement"),
    acceptance: getField(text, "Acceptance"),
    nextAction: (text.match(/## Next Action\n\n- ([^\n]+)/) || [])[1] || ""
  };
  appendLog("logs/state.log", `state_resumed task=${taskId} stage=${payload.currentStage}`);
  console.log(JSON.stringify(payload, null, 2));
} catch (error) {
  appendLog("logs/state.log", `state_resume_failed task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`STATE_RESUME_FAILED: ${error.message}`);
  process.exit(1);
}
