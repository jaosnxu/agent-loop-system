#!/usr/bin/env node
import { readState, writeState, setField, appendSectionItem, replaceNextAction, replaceGateStatus, nowIso, appendLog, validateTaskId } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";

const [taskId, result = "completed"] = process.argv.slice(2);

try {
  validateTaskId(taskId);
  let text = readState(taskId);
  text = setField(text, "Current Stage", result);
  text = setField(text, "Updated At", nowIso());
  text = replaceGateStatus(text, "Tool Gate", "passed");
  text = replaceGateStatus(text, "Review Gate", "passed");
  text = replaceGateStatus(text, "Score Gate", "passed");
  text = replaceGateStatus(text, "Human Gate", "not_required");
  text = appendSectionItem(text, "Completed Steps", `${nowIso()} task=${result}`);
  text = replaceNextAction(text, "No next action. Task closed.");
  writeState(taskId, text);
  syncBoard();
  appendLog("logs/state.log", `task_completed task=${taskId} result=${result}`);
  console.log(`TASK_COMPLETED task=${taskId} result=${result}`);
} catch (error) {
  appendLog("logs/state.log", `task_complete_failed task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`TASK_COMPLETE_FAILED: ${error.message}`);
  process.exit(1);
}
