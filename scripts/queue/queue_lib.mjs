import fs from "node:fs";
import path from "node:path";
import { systemRoot, ensureDir, nowIso, appendLog, validateTaskId } from "../lib/common.mjs";

const queuePath = path.join(systemRoot, "queue/queue.json");

export function readQueue() {
  ensureDir(path.dirname(queuePath));
  if (!fs.existsSync(queuePath)) return { version: "0.1.0", tasks: [] };
  return JSON.parse(fs.readFileSync(queuePath, "utf8"));
}

export function writeQueue(queue) {
  ensureDir(path.dirname(queuePath));
  fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
}

export function addTask({
  taskId,
  title,
  priority = "P2",
  dedupeKey = taskId,
  source = "manual",
  type = "example",
  prd = "",
  scope = "",
  requirement = "",
  acceptance = ""
}) {
  validateTaskId(taskId);
  const queue = readQueue();
  const existing = queue.tasks.find((task) => task.dedupeKey === dedupeKey && !["completed", "cancelled", "failed"].includes(task.status));
  if (existing) return { added: false, task: existing };
  const task = {
    taskId,
    title,
    priority,
    status: "queued",
    dedupeKey,
    source,
    type,
    prd,
    scope,
    requirement,
    acceptance,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  queue.tasks.push(task);
  writeQueue(queue);
  appendLog("logs/queue.log", `queue_add task=${taskId} priority=${priority} source=${source} dedupe=${dedupeKey} prd=${JSON.stringify(prd.slice(0, 120))} scope=${JSON.stringify(scope.slice(0, 120))} requirement=${JSON.stringify(requirement.slice(0, 160))} acceptance=${JSON.stringify(acceptance.slice(0, 160))}`);
  return { added: true, task };
}

export function updateTaskStatus(taskId, status) {
  const queue = readQueue();
  const task = queue.tasks.find((item) => item.taskId === taskId);
  if (!task) return false;
  task.status = status;
  task.updatedAt = nowIso();
  writeQueue(queue);
  appendLog("logs/queue.log", `queue_status task=${taskId} status=${status}`);
  return true;
}

export function nextTasks(limit = 1) {
  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return readQueue().tasks
    .filter((task) => task.status === "queued")
    .sort((a, b) => (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit);
}

export function cleanCompleted() {
  const queue = readQueue();
  const before = queue.tasks.length;
  queue.tasks = queue.tasks.filter((task) => !["completed", "cancelled", "failed"].includes(task.status));
  writeQueue(queue);
  return before - queue.tasks.length;
}
