#!/usr/bin/env node
import { readState, writeState, setField, appendSectionItem, nowIso, appendLog, validateTaskId } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";
import { spawnSync } from "node:child_process";
import { systemRoot } from "../lib/common.mjs";

const [taskId, reason = "unspecified failure"] = process.argv.slice(2);

try {
  validateTaskId(taskId);
  let text = readState(taskId);
  text = setField(text, "Current Stage", "returned_to_development");
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Failure Records", `${nowIso()} ${reason}`);
  text = text.replace(/## Next Action\n\n(?:- .*\n?)+/, "## Next Action\n\n- Development Agent must fix the recorded failure and rerun gates.\n");
  writeState(taskId, text);
  syncBoard();
  spawnSync(process.execPath, ["scripts/memory/sync_task_memory.mjs", taskId], { cwd: systemRoot, encoding: "utf8" });
  appendLog("logs/state.log", `failure_recorded task=${taskId} reason=${JSON.stringify(reason)}`);
  console.log(`FAILURE_RECORDED task=${taskId}`);
} catch (error) {
  appendLog("logs/state.log", `failure_record_failed task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`FAILURE_RECORD_FAILED: ${error.message}`);
  process.exit(1);
}
