#!/usr/bin/env node
import { appendLog, appendSectionItem, nowIso, readState, setField, validateTaskId, writeState } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";
import { spawnSync } from "node:child_process";
import { systemRoot } from "../lib/common.mjs";
import { recordStructuredEvidence } from "./structured_evidence_lib.mjs";

const [taskId, actor = "system", action = "unspecified", target = "", result = "", nextCheck = ""] = process.argv.slice(2);

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").slice(0, 500);
}

try {
  validateTaskId(taskId);
  let text = readState(taskId);
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(
    text,
    "Action Journal",
    `${nowIso()} actor=${actor} action=${JSON.stringify(compact(action))} target=${JSON.stringify(compact(target))} result=${JSON.stringify(compact(result))} next_check=${JSON.stringify(compact(nextCheck))}`
  );
  text = recordStructuredEvidence(taskId, {
    type: "action",
    actor,
    action,
    target,
    result,
    nextCheck,
    details: { source: "record_action.mjs" }
  }, text).text;
  writeState(taskId, text);
  syncBoard();
  spawnSync(process.execPath, ["scripts/memory/sync_task_memory.mjs", taskId], { cwd: systemRoot, encoding: "utf8" });
  appendLog("logs/state.log", `action_recorded task=${taskId} actor=${actor} action=${JSON.stringify(compact(action))}`);
  console.log(`ACTION_RECORDED task=${taskId}`);
} catch (error) {
  appendLog("logs/state.log", `action_record_failed task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`ACTION_RECORD_FAILED: ${error.message}`);
  process.exit(1);
}
