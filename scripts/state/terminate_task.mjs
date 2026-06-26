#!/usr/bin/env node
import { readState, writeState, setField, appendSectionItem, replaceNextAction, nowIso, appendLog, validateTaskId } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";

const [taskId, reason = "terminated"] = process.argv.slice(2);

try {
  validateTaskId(taskId);
  let text = readState(taskId);
  text = setField(text, "Current Stage", "terminated");
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Failure Records", `${nowIso()} TERMINATED ${reason}`);
  text = replaceNextAction(text, "No next action. Task terminated by safety brake or unrecoverable failure.");
  writeState(taskId, text);
  syncBoard();
  appendLog("logs/state.log", `task_terminated task=${taskId} reason=${JSON.stringify(reason)}`);
  console.log(`TASK_TERMINATED task=${taskId}`);
} catch (error) {
  appendLog("logs/state.log", `task_terminate_failed task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`TASK_TERMINATE_FAILED: ${error.message}`);
  process.exit(1);
}
