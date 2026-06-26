#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { systemRoot, appendLog } from "../lib/common.mjs";
import { nextTasks, updateTaskStatus } from "./queue_lib.mjs";

const limit = Number(process.argv[2] || 1);
const tasks = nextTasks(limit);

if (!tasks.length) {
  console.log("QUEUE_NO_TASKS");
  process.exit(0);
}

for (const task of tasks) {
  updateTaskStatus(task.taskId, "running");
  const result = spawnSync(process.execPath, [
    "scripts/orchestrator/run_task.mjs",
    task.taskId,
    `--title=${task.title}`,
    `--type=${task.type || "example"}`,
    `--priority=${task.priority || "P2"}`,
    `--prd=${task.prd || ""}`,
    `--scope=${task.scope || ""}`,
    `--requirement=${task.requirement || ""}`,
    `--acceptance=${task.acceptance || ""}`
  ], { cwd: systemRoot, encoding: "utf8", stdio: "pipe" });
  appendLog("logs/queue.log", `queue_run task=${task.taskId} status=${result.status}`);
  if (result.status === 0) updateTaskStatus(task.taskId, "completed");
  else updateTaskStatus(task.taskId, "failed");
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}
