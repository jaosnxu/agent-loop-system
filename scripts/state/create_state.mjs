#!/usr/bin/env node
import { readText, writeState, validateTaskId, nowIso, appendLog } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";
import { spawnSync } from "node:child_process";
import { systemRoot } from "../lib/common.mjs";

const [taskId, rawTitle = "Untitled task", ...rest] = process.argv.slice(2);

function parseOptions(args) {
  const options = {};
  for (const arg of args) {
    const [key, ...valueParts] = arg.split("=");
    if (key.startsWith("--")) options[key.slice(2)] = valueParts.join("=");
  }
  return options;
}

try {
  validateTaskId(taskId);
  const options = parseOptions(rest);
  const createdAt = nowIso();
  let text = readText("templates/state_TEMPLATE.md")
    .replaceAll("TASK_ID", taskId)
    .replaceAll("CREATED_AT", createdAt);
  text = text
    .replace("- Priority: unset", `- Priority: ${options.priority || "unset"}`)
    .replace("- Task Type: unset", `- Task Type: ${options.type || "unset"}`)
    .replace("- PRD: unset", `- PRD: ${options.prd || ""}`)
    .replace("- Scope: unset", `- Scope: ${options.scope || ""}`)
    .replace("- Requirement: unset", `- Requirement: ${options.requirement || ""}`)
    .replace("- Acceptance: unset", `- Acceptance: ${options.acceptance || ""}`);
  text += `\n## Task Title\n\n- ${rawTitle}\n`;
  writeState(taskId, text);
  syncBoard();
  spawnSync(process.execPath, ["scripts/memory/sync_task_memory.mjs", taskId], { cwd: systemRoot, encoding: "utf8" });
  appendLog("logs/state.log", `state_created task=${taskId} title=${JSON.stringify(rawTitle)} requirement=${JSON.stringify((options.requirement || "").slice(0, 160))} acceptance=${JSON.stringify((options.acceptance || "").slice(0, 160))}`);
  console.log(`STATE_CREATED states/state_${taskId}.md`);
} catch (error) {
  appendLog("logs/state.log", `state_create_failed error=${JSON.stringify(error.message)}`);
  console.error(`STATE_CREATE_FAILED: ${error.message}`);
  process.exit(1);
}
