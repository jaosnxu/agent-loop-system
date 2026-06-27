#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import config from "../../config/heartbeat.config.js";
import { appendLog, readText, systemRoot, getField, ensureDir } from "../lib/common.mjs";
import { logToolCall } from "../lib/tool_logger.mjs";
import { pollGitHubEvents } from "./github_events.mjs";
import { appendHeartbeatMetric } from "./metrics_lib.mjs";

function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: systemRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
}

function scanPendingStates() {
  const statesDir = path.join(systemRoot, config.paths.statesDir);
  ensureDir(statesDir);
  const tasks = [];
  for (const file of fs.readdirSync(statesDir).sort()) {
    if (!/^state_.+\.md$/.test(file)) continue;
    const text = fs.readFileSync(path.join(statesDir, file), "utf8");
    const stage = getField(text, "Current Stage");
    if (["pending", "returned_to_development"].includes(stage)) {
      tasks.push({
        taskId: getField(text, "Task ID") || file.replace(/^state_/, "").replace(/\.md$/, ""),
        stage
      });
    }
  }
  return tasks;
}

try {
  const rules = readText(config.paths.heartbeatRules);
  appendLog(config.paths.logFile, `heartbeat_start rules_bytes=${rules.length}`);
  const supervisor = runNode("scripts/heartbeat/supervisor_status.mjs", []);
  appendLog(config.paths.logFile, `heartbeat_supervisor_run status=${supervisor.status}`);
  if (supervisor.status !== 0) {
    process.stderr.write(supervisor.stderr);
    process.exit(1);
  }
  const createdEvents = await pollGitHubEvents();
  appendLog(config.paths.logFile, `heartbeat_github_events created=${createdEvents.length}`);
  const tasks = scanPendingStates();

  if (!tasks.length) {
    appendLog(config.paths.logFile, "heartbeat_noop no_pending_tasks");
    const queueResult = runNode("scripts/queue/run_next.mjs", [String(config.concurrency?.maxRunningTasks || 1)]);
    appendLog(config.paths.logFile, `heartbeat_queue_run status=${queueResult.status}`);
    appendHeartbeatMetric("heartbeat_tick", {
      result: "no_tasks",
      rulesBytes: rules.length,
      supervisorStatus: supervisor.status,
      githubEventsCreated: createdEvents.length,
      pendingStateTasks: 0,
      dispatchedCount: 0,
      queueRunStatus: queueResult.status
    });
    console.log("HEARTBEAT_NO_TASKS");
    process.exit(0);
  }

  for (const task of tasks) {
    appendLog(config.paths.logFile, `heartbeat_dispatch_triage task=${task.taskId} previous_stage=${task.stage}`);
    logToolCall({
      role: "heartbeat",
      tool: "state",
      operation: "update_stage",
      target: `states/state_${task.taskId}.md`,
      result: "started"
    });
    const result = runNode("scripts/state/update_stage.mjs", [task.taskId, "triage", "heartbeat triggered triage"]);
    logToolCall({
      role: "heartbeat",
      tool: "state",
      operation: "update_stage",
      target: `states/state_${task.taskId}.md`,
      result: result.status === 0 ? "passed" : "failed"
    });
    if (result.status !== 0) {
      appendLog(config.paths.logFile, `heartbeat_dispatch_failed task=${task.taskId} stderr=${JSON.stringify(result.stderr)}`);
      process.stderr.write(result.stderr);
      process.exit(1);
    }
  }

  appendLog(config.paths.logFile, `heartbeat_done dispatched=${tasks.length}`);
  const queueResult = runNode("scripts/queue/run_next.mjs", [String(config.concurrency?.maxRunningTasks || 1)]);
  appendLog(config.paths.logFile, `heartbeat_queue_run status=${queueResult.status}`);
  appendHeartbeatMetric("heartbeat_tick", {
    result: "dispatched",
    rulesBytes: rules.length,
    supervisorStatus: supervisor.status,
    githubEventsCreated: createdEvents.length,
    pendingStateTasks: tasks.length,
    dispatchedCount: tasks.length,
    queueRunStatus: queueResult.status,
    dispatchedTasks: tasks.map((task) => task.taskId)
  });
  console.log(`HEARTBEAT_DISPATCHED ${tasks.length}`);
} catch (error) {
  appendLog(config.paths.logFile, `heartbeat_error error=${JSON.stringify(error.message)}`);
  appendHeartbeatMetric("heartbeat_error", {
    result: "error",
    error: error.message
  });
  console.error(`HEARTBEAT_ERROR: ${error.message}`);
  process.exit(1);
}
