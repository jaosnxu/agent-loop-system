#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getField, systemRoot, appendLog } from "../lib/common.mjs";
import { readQueue } from "../queue/queue_lib.mjs";
import { syncBoard } from "./sync_board_lib.mjs";

const baseRequiredFields = [
  "Task ID",
  "Current Stage",
  "Created At",
  "Updated At",
  "Iteration Count",
  "No Progress Count",
  "Tool Call Count",
  "Worktree Path",
  "Branch"
];

const specRequiredFields = [
  "Requirement",
  "Acceptance"
];

try {
  syncBoard();
  const failures = [];
  const statesDir = path.join(systemRoot, "states");
  const queue = readQueue();
  const board = fs.existsSync(path.join(systemRoot, "task-board.md")) ? fs.readFileSync(path.join(systemRoot, "task-board.md"), "utf8") : "";
  const stateFiles = fs.existsSync(statesDir) ? fs.readdirSync(statesDir).filter((file) => /^state_.+\.md$/.test(file)) : [];
  for (const file of stateFiles) {
    const text = fs.readFileSync(path.join(statesDir, file), "utf8");
    const taskId = getField(text, "Task ID") || file.replace(/^state_/, "").replace(/\.md$/, "");
    const queued = queue.tasks.find((task) => task.taskId === taskId);
    const taskType = getField(text, "Task Type");
    const strictSpec = Boolean(queued?.requirement || queued?.acceptance || ["development", "prototype"].includes(taskType));
    for (const field of baseRequiredFields) {
      if (!getField(text, field)) {
        failures.push(`${taskId}: missing field ${field}`);
      }
    }
    for (const field of specRequiredFields) {
      if (!getField(text, field)) {
        if (strictSpec) failures.push(`${taskId}: missing field ${field}`);
        else appendLog("logs/state.log", `spine_verify_legacy_warning task=${taskId} missing=${JSON.stringify(field)} type=${JSON.stringify(taskType || "legacy")}`);
      }
    }
    if (!text.includes("## Completed Steps")) failures.push(`${taskId}: missing Completed Steps`);
    if (!text.includes("## Failure Records")) failures.push(`${taskId}: missing Failure Records`);
    if (!text.includes("## Evidence")) failures.push(`${taskId}: missing Evidence`);
    if (!board.includes(`| ${taskId} |`)) failures.push(`${taskId}: missing from task-board.md`);
    if (queued && queued.requirement && getField(text, "Requirement") !== queued.requirement) failures.push(`${taskId}: queue/state requirement mismatch`);
    if (queued && queued.acceptance && getField(text, "Acceptance") !== queued.acceptance) failures.push(`${taskId}: queue/state acceptance mismatch`);
  }
  if (failures.length) {
    appendLog("logs/state.log", `spine_verify_blocked failures=${JSON.stringify(failures)}`);
    console.log("SPINE_VERIFY_BLOCKED");
    for (const failure of failures) console.log(`- ${failure}`);
    process.exit(2);
  }
  appendLog("logs/state.log", `spine_verify_passed states=${stateFiles.length}`);
  console.log(`SPINE_VERIFY_PASSED states=${stateFiles.length}`);
} catch (error) {
  appendLog("logs/state.log", `spine_verify_error error=${JSON.stringify(error.message)}`);
  console.error(`SPINE_VERIFY_ERROR: ${error.message}`);
  process.exit(1);
}
