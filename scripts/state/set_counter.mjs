#!/usr/bin/env node
import { readState, writeState, setField, nowIso, appendLog, validateTaskId } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";

const [taskId, field, value] = process.argv.slice(2);
const allowed = new Set(["Iteration Count", "No Progress Count", "Token Budget Used", "Tool Call Count"]);

try {
  validateTaskId(taskId);
  if (!allowed.has(field)) throw new Error(`Unsupported counter field: ${field}`);
  if (!/^\d+$/.test(String(value))) throw new Error("Counter value must be a non-negative integer.");
  let text = readState(taskId);
  text = setField(text, field, value);
  text = setField(text, "Updated At", nowIso());
  writeState(taskId, text);
  syncBoard();
  appendLog("logs/state.log", `counter_set task=${taskId} field=${JSON.stringify(field)} value=${value}`);
  console.log(`COUNTER_SET task=${taskId} field=${field} value=${value}`);
} catch (error) {
  appendLog("logs/state.log", `counter_set_failed task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`COUNTER_SET_FAILED: ${error.message}`);
  process.exit(1);
}
