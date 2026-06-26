#!/usr/bin/env node
import { updateTaskStatus } from "./queue_lib.mjs";

const [taskId] = process.argv.slice(2);

if (!updateTaskStatus(taskId, "cancelled")) {
  console.error(`QUEUE_CANCEL_FAILED: task not found ${taskId}`);
  process.exit(1);
}
console.log(`QUEUE_CANCELLED ${taskId}`);
