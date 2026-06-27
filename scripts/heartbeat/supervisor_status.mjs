#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import config from "../../config/heartbeat.config.js";
import { appendLog, ensureDir, getField, systemRoot } from "../lib/common.mjs";

function minutesSince(iso) {
  const time = Date.parse(iso || "");
  if (Number.isNaN(time)) return Infinity;
  return (Date.now() - time) / 60000;
}

function classify(stage, updatedAt, noProgressCount) {
  if (!["pending_human", "failed", "terminated", "completed", "cleanup"].includes(stage) && noProgressCount >= Number(config.safety?.maxNoProgressIterations || 3)) return "no_progress_limit";
  if (stage === "running" && minutesSince(updatedAt) >= Number(config.supervisor?.staleRunningMinutes || 60)) return "stale_running";
  if (["pending", "triage", "returned_to_development"].includes(stage)) return "dispatchable";
  if (stage === "pending_human") return "waiting_human";
  if (["failed", "terminated"].includes(stage)) return "closed_failed";
  if (["completed", "cleanup"].includes(stage)) return "closed_success";
  if (stage === "running") return "running";
  return "other";
}

function runStateScript(script, args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: systemRoot, encoding: "utf8", stdio: "pipe" });
}

function remediate(task, bucket) {
  if (bucket === "stale_running" && config.supervisor?.remediateStaleRunning) {
    runStateScript("scripts/state/record_failure.mjs", [task.taskId, "Heartbeat supervisor detected stale running task"]);
    const nextStage = config.supervisor?.staleRunningStage || "returned_to_development";
    runStateScript("scripts/state/update_stage.mjs", [task.taskId, nextStage, "heartbeat stale running remediation"]);
    appendLog(config.paths.logFile, `heartbeat_remediated_stale task=${task.taskId} next_stage=${nextStage}`);
  }
  if (bucket === "no_progress_limit" && config.supervisor?.terminateNoProgressAtLimit) {
    runStateScript("scripts/state/terminate_task.mjs", [task.taskId, "heartbeat no-progress limit remediation"]);
    appendLog(config.paths.logFile, `heartbeat_remediated_no_progress task=${task.taskId}`);
  }
}

try {
  const statesDir = path.join(systemRoot, config.paths.statesDir);
  ensureDir(statesDir);
  const buckets = {
    dispatchable: [],
    running: [],
    stale_running: [],
    no_progress_limit: [],
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
    const noProgressCount = Number(getField(text, "No Progress Count") || 0);
    buckets[classify(stage, updatedAt, noProgressCount)].push({ taskId, stage, updatedAt, noProgressCount });
  }
  const summary = Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.length]));
  appendLog(config.paths.logFile, `heartbeat_supervisor summary=${JSON.stringify(summary)}`);
  for (const task of buckets.stale_running) {
    appendLog(config.paths.logFile, `heartbeat_stale_running task=${task.taskId} stage=${task.stage} updated_at=${task.updatedAt}`);
    remediate(task, "stale_running");
  }
  for (const task of buckets.no_progress_limit) {
    appendLog(config.paths.logFile, `heartbeat_no_progress_limit task=${task.taskId} stage=${task.stage} no_progress=${task.noProgressCount}`);
    remediate(task, "no_progress_limit");
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
