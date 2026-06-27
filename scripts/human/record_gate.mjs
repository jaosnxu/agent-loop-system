#!/usr/bin/env node
import { appendLog, appendSectionItem, nowIso, readState, replaceGateStatus, replaceNextAction, setField, validateTaskId, writeState } from "../lib/common.mjs";
import { syncBoard } from "../state/sync_board_lib.mjs";
import { spawnSync } from "node:child_process";
import { systemRoot } from "../lib/common.mjs";

const [taskId, decision = "pending", operation = "unspecified", actor = process.env.USER || "unknown", reason = "unspecified"] = process.argv.slice(2);

const gateId = `human-${Date.now()}`;

try {
  validateTaskId(taskId);
  let text = readState(taskId);
  text = setField(text, "Updated At", nowIso());
  if (decision === "pending") {
    text = setField(text, "Current Stage", "pending_human");
    text = replaceGateStatus(text, "Human Gate", "pending");
    text = replaceNextAction(text, "Run scripts/human/approve_task.sh or scripts/human/reject_task.sh.");
  } else if (decision === "approved") {
    text = replaceGateStatus(text, "Human Gate", "approved");
  } else if (decision === "rejected") {
    text = replaceGateStatus(text, "Human Gate", "rejected");
  } else {
    throw new Error(`Unsupported human gate decision: ${decision}`);
  }
  const audit = `gate_id=${gateId} decision=${decision} operation=${JSON.stringify(operation)} actor=${JSON.stringify(actor)} reason=${JSON.stringify(reason)}`;
  text = appendSectionItem(text, "Action Journal", `${nowIso()} actor=human-gate action=${JSON.stringify(decision)} target=${JSON.stringify(operation)} result=${JSON.stringify(audit)} next_check=${JSON.stringify(decision === "approved" ? "continue gated operation" : decision === "rejected" ? "terminate and clean worktree" : "wait for approval or rejection")}`);
  text = appendSectionItem(text, "Evidence", `${nowIso()} HUMAN_GATE ${audit}`);
  writeState(taskId, text);
  syncBoard();
  spawnSync(process.execPath, ["scripts/memory/sync_task_memory.mjs", taskId], { cwd: systemRoot, encoding: "utf8" });
  appendLog("logs/human-gate.log", `task=${taskId} ${audit}`);
  console.log(`HUMAN_GATE_RECORDED task=${taskId} decision=${decision} gate_id=${gateId}`);
} catch (error) {
  appendLog("logs/human-gate.log", `record_failed task=${taskId || "unset"} decision=${decision} error=${JSON.stringify(error.message)}`);
  console.error(`HUMAN_GATE_RECORD_FAILED: ${error.message}`);
  process.exit(1);
}
