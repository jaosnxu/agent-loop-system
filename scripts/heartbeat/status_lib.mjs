import fs from "node:fs";
import path from "node:path";
import config from "../../config/heartbeat.config.js";
import { ensureDir, getField, systemRoot } from "../lib/common.mjs";
import { readQueue } from "../queue/queue_lib.mjs";

function readJson(file, fallback) {
  const full = path.join(systemRoot, file);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function classify(stage, noProgressCount) {
  if (!["pending_human", "human_approved", "failed", "terminated", "completed", "cleanup"].includes(stage) && noProgressCount >= Number(config.safety?.maxNoProgressIterations || 3)) {
    return "no_progress_limit";
  }
  if (["pending", "triage", "returned_to_development"].includes(stage)) return "dispatchable";
  if (stage === "pending_human") return "waiting_human";
  if (stage === "human_approved") return "human_approved";
  if (["failed", "terminated"].includes(stage)) return "closed_failed";
  if (["completed", "cleanup"].includes(stage)) return "closed_success";
  if (stage === "running") return "running";
  return "other";
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function collectHeartbeatStatus() {
  const statesDir = path.join(systemRoot, config.paths.statesDir);
  ensureDir(statesDir);
  const buckets = {
    dispatchable: [],
    running: [],
    no_progress_limit: [],
    waiting_human: [],
    human_approved: [],
    closed_failed: [],
    closed_success: [],
    other: []
  };

  const stateFiles = fs.readdirSync(statesDir).filter((file) => /^state_.+\.md$/.test(file)).sort();
  for (const file of stateFiles) {
    const text = fs.readFileSync(path.join(statesDir, file), "utf8");
    const taskId = getField(text, "Task ID") || file.replace(/^state_/, "").replace(/\.md$/, "");
    const stage = getField(text, "Current Stage") || "unknown";
    const noProgressCount = Number(getField(text, "No Progress Count") || 0);
    buckets[classify(stage, noProgressCount)].push({ taskId, stage, noProgressCount });
  }

  const queue = readQueue();
  const approvals = readJson("queue/human-approvals.json", { version: "0.1.0", requests: [] });
  const stateSummary = Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.length]));
  const queueSummary = countBy(queue.tasks || [], (task) => task.status);
  const approvalSummary = countBy(approvals.requests || [], (request) => request.status);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    stateSummary,
    queueSummary,
    approvalSummary,
    buckets
  };
}
