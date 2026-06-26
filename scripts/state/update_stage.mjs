#!/usr/bin/env node
import { readState, writeState, setField, getField, appendSectionItem, nowIso, appendLog, validateTaskId } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";
import { spawnSync } from "node:child_process";
import { systemRoot } from "../lib/common.mjs";

const [taskId, stage, note = "stage transition"] = process.argv.slice(2);

try {
  validateTaskId(taskId);
  if (!stage) throw new Error("Missing stage.");
  let text = readState(taskId);
  text = setField(text, "Current Stage", stage);
  text = setField(text, "Updated At", nowIso());
  const requirement = getField(text, "Requirement");
  const acceptance = getField(text, "Acceptance");
  text = appendSectionItem(text, "Completed Steps", `${nowIso()} stage=${stage} note=${note} requirement=${JSON.stringify(requirement.slice(0, 120))} acceptance=${JSON.stringify(acceptance.slice(0, 120))}`);
  writeState(taskId, text);
  syncBoard();
  spawnSync(process.execPath, ["scripts/memory/sync_task_memory.mjs", taskId], { cwd: systemRoot, encoding: "utf8" });
  appendLog("logs/state.log", `stage_updated task=${taskId} stage=${stage} note=${JSON.stringify(note)}`);
  console.log(`STAGE_UPDATED task=${taskId} stage=${stage}`);
} catch (error) {
  appendLog("logs/state.log", `stage_update_failed task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`STAGE_UPDATE_FAILED: ${error.message}`);
  process.exit(1);
}
