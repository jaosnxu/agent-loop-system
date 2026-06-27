#!/usr/bin/env node
import config from "../../config/heartbeat.config.js";
import { appendLog } from "../lib/common.mjs";
import { readHeartbeatMetrics, summarizeHeartbeatMetrics, heartbeatMetricsPath } from "./metrics_lib.mjs";

function parseArgs(args) {
  const options = new Map();
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const [key, ...value] = arg.slice(2).split("=");
    options.set(key, value.length ? value.join("=") : "true");
  }
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const limit = Number(options.get("last") || 200);
  const metrics = readHeartbeatMetrics({ limit });
  const summary = summarizeHeartbeatMetrics(metrics);
  const line = [
    `metrics=${summary.metricsCount}`,
    `ticks=${summary.heartbeatTicks}`,
    `errors=${summary.errors}`,
    `dispatched=${summary.dispatchedTotal}`,
    `github_events=${summary.githubEventsTotal}`,
    `queue_failures=${summary.queueRunsFailed}`,
    `consecutive_no_task_ticks=${summary.consecutiveNoTaskTicks}`,
    `waiting_human_max=${summary.maxWaitingHuman}`,
    `no_progress_max=${summary.maxNoProgressLimit}`,
    `file=${JSON.stringify(heartbeatMetricsPath())}`
  ].join(" ");
  appendLog(config.paths.logFile, `heartbeat_trend_report ${line}`);
  console.log(`HEARTBEAT_TREND ${line}`);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  appendLog(config.paths.logFile, `heartbeat_trend_report_error error=${JSON.stringify(error.message)}`);
  console.error(`HEARTBEAT_TREND_ERROR: ${error.message}`);
  process.exit(1);
}
