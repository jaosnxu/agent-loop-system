#!/usr/bin/env node
import { appendLog, readState, setField, writeState, nowIso, validateTaskId } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";
import { recordStructuredEvidence } from "./structured_evidence_lib.mjs";
import { spawnSync } from "node:child_process";
import { systemRoot } from "../lib/common.mjs";

const [taskId, type = "event", actor = "system", action = "unspecified", target = "", result = "", nextCheck = "", detailsJson = "{}"] = process.argv.slice(2);

try {
  validateTaskId(taskId);
  let details = {};
  try {
    details = JSON.parse(detailsJson || "{}");
  } catch {
    details = { raw: detailsJson };
  }
  let text = readState(taskId);
  text = setField(text, "Updated At", nowIso());
  const evidence = recordStructuredEvidence(taskId, { type, actor, action, target, result, nextCheck, details }, text);
  writeState(taskId, evidence.text);
  syncBoard();
  spawnSync(process.execPath, ["scripts/memory/sync_task_memory.mjs", taskId], { cwd: systemRoot, encoding: "utf8" });
  appendLog("logs/state.log", `structured_evidence_recorded task=${taskId} id=${evidence.entry.evidenceId} type=${type} actor=${actor}`);
  console.log(`STRUCTURED_EVIDENCE_RECORDED task=${taskId} id=${evidence.entry.evidenceId}`);
} catch (error) {
  appendLog("logs/state.log", `structured_evidence_failed task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`STRUCTURED_EVIDENCE_FAILED: ${error.message}`);
  process.exit(1);
}
