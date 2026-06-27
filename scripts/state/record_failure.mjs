#!/usr/bin/env node
import { readState, writeState, setField, appendSectionItem, nowIso, appendLog, validateTaskId } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";
import { spawnSync } from "node:child_process";
import { systemRoot } from "../lib/common.mjs";
import { recordStructuredEvidence } from "./structured_evidence_lib.mjs";

const [taskId, reason = "unspecified failure", ...rest] = process.argv.slice(2);

function parseOptions(args) {
  const options = {};
  for (const arg of args) {
    const [key, ...valueParts] = arg.split("=");
    if (key.startsWith("--")) options[key.slice(2)] = valueParts.join("=");
  }
  return options;
}

function shortText(value, fallback) {
  const text = String(value || fallback || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 1000);
}

try {
  validateTaskId(taskId);
  const options = parseOptions(rest);
  const label = shortText(options.label, "failure");
  const rootCause = shortText(options["root-cause"], reason);
  const fixPlan = shortText(options["fix-plan"], "Development Agent must inspect the failure evidence, compare it with the relevant Skill and acceptance criteria, then apply one targeted fix before rerunning the blocked gate.");
  const nextChecks = shortText(options["next-checks"], "Rerun the blocked gate, verify state evidence, and stop if the same root cause repeats.");
  let text = readState(taskId);
  text = setField(text, "Current Stage", "returned_to_development");
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Failure Records", `${nowIso()} label=${label} reason=${JSON.stringify(reason)}`);
  text = appendSectionItem(text, "Root Cause Analysis", `${nowIso()} label=${label} cause=${JSON.stringify(rootCause)}`);
  text = appendSectionItem(text, "Fix Plan", `${nowIso()} label=${label} plan=${JSON.stringify(fixPlan)}`);
  text = appendSectionItem(text, "Next Checks", `${nowIso()} label=${label} checks=${JSON.stringify(nextChecks)}`);
  text = appendSectionItem(text, "Retry Ledger", `${nowIso()} label=${label} status=returned_to_development next_check=${JSON.stringify(nextChecks)}`);
  text = text.replace(/## Next Action\n\n(?:- .*\n?)+/, "## Next Action\n\n- Development Agent must fix the recorded failure and rerun gates.\n");
  text = recordStructuredEvidence(taskId, {
    type: "failure",
    actor: "state",
    action: "record_failure",
    target: `states/state_${taskId}.md`,
    result: "returned_to_development",
    nextCheck: nextChecks,
    details: { label, reason, rootCause, fixPlan, nextChecks }
  }, text).text;
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
