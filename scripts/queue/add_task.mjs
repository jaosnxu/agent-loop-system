#!/usr/bin/env node
import { addTask } from "./queue_lib.mjs";

function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (!key) throw new Error("empty option name");
      if (!next || next.startsWith("--")) throw new Error(`missing value for --${key}`);
      options[key] = next;
      index += 1;
    } else {
      positional.push(arg);
    }
  }

  const [legacyTaskId, legacyTitle = "Queued task", legacyPriority = "P2", legacyType = "example", legacyDedupeKey] = positional;
  const taskId = options.id || options.taskId || legacyTaskId;
  if (!taskId) throw new Error("taskId is required. Use --id TASK_ID or positional TASK_ID.");

  return {
    taskId,
    title: options.title || options.name || legacyTitle,
    priority: options.priority || legacyPriority,
    type: options.type || legacyType,
    dedupeKey: options.dedupeKey || legacyDedupeKey || taskId,
    prd: options.prd || "",
    scope: options.scope || "",
    requirement: options.requirement || "",
    acceptance: options.acceptance || ""
  };
}

try {
  const task = parseArgs(process.argv.slice(2));
  const result = addTask({ ...task, source: "manual" });
  console.log(result.added ? `QUEUE_ADDED ${task.taskId}` : `QUEUE_DUPLICATE ${result.task.taskId}`);
} catch (error) {
  console.error(`QUEUE_ADD_FAILED: ${error.message}`);
  process.exit(1);
}
