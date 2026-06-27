#!/usr/bin/env node
import { appendLog, appendSectionItem, nowIso, readState, setField, validateTaskId, writeState } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";
import { spawnSync } from "node:child_process";
import { systemRoot } from "../lib/common.mjs";
import { recordStructuredEvidence } from "./structured_evidence_lib.mjs";

const [taskId, label = "unknown", attempt = "1", maxAttempts = "3", reason = "unspecified failure"] = process.argv.slice(2);

function shortReason(text) {
  return String(text || "").replace(/\s+/g, " ").slice(0, 500);
}

try {
  validateTaskId(taskId);
  const rootCause = shortReason(reason);
  let text = readState(taskId);
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Root Cause Analysis", `${nowIso()} label=${label} attempt=${attempt}/${maxAttempts} cause=${JSON.stringify(rootCause)}`);
  text = appendSectionItem(text, "Fix Plan", `${nowIso()} label=${label} plan=Read failure evidence, inspect changed artifact and relevant Skill rules, apply one targeted fix before retry.`);
  text = appendSectionItem(text, "Next Checks", `${nowIso()} label=${label} checks=rerun ${label} gate, inspect state evidence, stop if same root cause repeats.`);
  text = appendSectionItem(text, "Retry Ledger", `${nowIso()} label=${label} attempt=${attempt}/${maxAttempts} status=planned_after_root_cause`);
  text = recordStructuredEvidence(taskId, {
    type: "diagnostic",
    actor: "state",
    action: "record_diagnostic",
    target: `states/state_${taskId}.md`,
    result: "planned_after_root_cause",
    nextCheck: `rerun ${label} gate and stop if the same root cause repeats`,
    details: { label, attempt, maxAttempts, rootCause }
  }, text).text;
  writeState(taskId, text);
  syncBoard();
  spawnSync(process.execPath, ["scripts/memory/sync_task_memory.mjs", taskId], { cwd: systemRoot, encoding: "utf8" });
  appendLog("logs/state.log", `diagnostic_recorded task=${taskId} label=${label} attempt=${attempt}/${maxAttempts} reason=${JSON.stringify(rootCause)}`);
  console.log(`DIAGNOSTIC_RECORDED task=${taskId} label=${label} attempt=${attempt}/${maxAttempts}`);
} catch (error) {
  appendLog("logs/state.log", `diagnostic_record_failed task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`DIAGNOSTIC_RECORD_FAILED: ${error.message}`);
  process.exit(1);
}
