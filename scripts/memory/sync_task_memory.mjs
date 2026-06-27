#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, getField, readState, systemRoot, validateTaskId } from "../lib/common.mjs";

const [taskId] = process.argv.slice(2);

function section(text, title) {
  const heading = `## ${title}`;
  const start = text.indexOf(heading);
  if (start === -1) return "- None";
  const next = text.indexOf("\n## ", start + heading.length);
  return text.slice(start + heading.length, next === -1 ? text.length : next).trim() || "- None";
}

try {
  validateTaskId(taskId);
  const state = readState(taskId);
  const targetDir = path.join(systemRoot, "memory/tasks");
  ensureDir(targetDir);
  const body = [
    `# Task Memory: ${taskId}`,
    "",
    `- Task ID: ${getField(state, "Task ID")}`,
    `- Current Stage: ${getField(state, "Current Stage")}`,
    `- Updated At: ${getField(state, "Updated At")}`,
    `- Iteration Count: ${getField(state, "Iteration Count")}`,
    `- No Progress Count: ${getField(state, "No Progress Count")}`,
    `- Requirement: ${getField(state, "Requirement")}`,
    `- Acceptance: ${getField(state, "Acceptance")}`,
    "",
    "## Last Completed Steps",
    "",
    section(state, "Completed Steps"),
    "",
    "## Action Journal",
    "",
    section(state, "Action Journal"),
    "",
    "## Failures",
    "",
    section(state, "Failure Records"),
    "",
    "## Root Cause Analysis",
    "",
    section(state, "Root Cause Analysis"),
    "",
    "## Fix Plan",
    "",
    section(state, "Fix Plan"),
    "",
    "## Next Checks",
    "",
    section(state, "Next Checks"),
    "",
    "## Retry Ledger",
    "",
    section(state, "Retry Ledger"),
    "",
    "## Artifact Hashes",
    "",
    section(state, "Artifact Hashes"),
    "",
    "## Next Action",
    "",
    section(state, "Next Action"),
    ""
  ].join("\n");
  fs.writeFileSync(path.join(targetDir, `${taskId}.md`), body);
  console.log(`TASK_MEMORY_SYNCED memory/tasks/${taskId}.md`);
} catch (error) {
  console.error(`TASK_MEMORY_SYNC_FAILED: ${error.message}`);
  process.exit(1);
}
