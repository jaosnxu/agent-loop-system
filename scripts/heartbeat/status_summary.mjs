#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import config from "../../config/heartbeat.config.js";
import { appendLog, ensureDir, getField, systemRoot } from "../lib/common.mjs";
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

try {
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
  const queueSummary = (queue.tasks || []).reduce((acc, task) => {
    acc[task.status || "unknown"] = (acc[task.status || "unknown"] || 0) + 1;
    return acc;
  }, {});
  const approvalSummary = (approvals.requests || []).reduce((acc, request) => {
    acc[request.status || "unknown"] = (acc[request.status || "unknown"] || 0) + 1;
    return acc;
  }, {});
  const stateSummary = Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.length]));
  const summary = {
    ok: true,
    generatedAt: new Date().toISOString(),
    stateSummary,
    queueSummary,
    approvalSummary,
    buckets
  };

  appendLog(config.paths.logFile, `heartbeat_status_summary states=${JSON.stringify(stateSummary)} queue=${JSON.stringify(queueSummary)} approvals=${JSON.stringify(approvalSummary)}`);
  console.log(`HEARTBEAT_STATUS states=${JSON.stringify(stateSummary)} queue=${JSON.stringify(queueSummary)} approvals=${JSON.stringify(approvalSummary)}`);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  appendLog(config.paths.logFile, `heartbeat_status_summary_error error=${JSON.stringify(error.message)}`);
  console.error(`HEARTBEAT_STATUS_ERROR: ${error.message}`);
  process.exit(1);
}
