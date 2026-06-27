#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import config from "../../config/heartbeat.config.js";
import { appendLog, ensureDir, getField, systemRoot } from "../lib/common.mjs";

function minutesSince(iso) {
  const time = Date.parse(iso || "");
  if (Number.isNaN(time)) return Infinity;
  return (Date.now() - time) / 60000;
}

function classify(stage, updatedAt) {
  if (stage === "running" && minutesSince(updatedAt) >= Number(config.supervisor?.staleRunningMinutes || 60)) return "stale_running";
  if (["pending", "triage", "returned_to_development"].includes(stage)) return "dispatchable";
  if (stage === "pending_human") return "waiting_human";
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
    stale_running: [],
    waiting_human: [],
    closed_failed: [],
    closed_success: [],
    other: []
  };
  for (const file of fs.readdirSync(statesDir).sort()) {
    if (!/^state_.+\.md$/.test(file)) continue;
    const text = fs.readFileSync(path.join(statesDir, file), "utf8");
    const taskId = getField(text, "Task ID") || file.replace(/^state_/, "").replace(/\.md$/, "");
    const stage = getField(text, "Current Stage") || "unknown";
    const updatedAt = getField(text, "Updated At");
    buckets[classify(stage, updatedAt)].push({ taskId, stage, updatedAt });
  }
  const summary = Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.length]));
  appendLog(config.paths.logFile, `heartbeat_supervisor summary=${JSON.stringify(summary)}`);
  for (const task of buckets.stale_running) {
    appendLog(config.paths.logFile, `heartbeat_stale_running task=${task.taskId} stage=${task.stage} updated_at=${task.updatedAt}`);
  }
  for (const task of buckets.waiting_human) {
    appendLog(config.paths.logFile, `heartbeat_waiting_human task=${task.taskId} stage=${task.stage} updated_at=${task.updatedAt}`);
  }
  console.log(JSON.stringify({ ok: true, summary, buckets }, null, 2));
} catch (error) {
  appendLog(config.paths.logFile, `heartbeat_supervisor_error error=${JSON.stringify(error.message)}`);
  console.error(`HEARTBEAT_SUPERVISOR_ERROR: ${error.message}`);
  process.exit(1);
}
