#!/usr/bin/env node
import config from "../../config/heartbeat.config.js";
import { appendLog } from "../lib/common.mjs";
import { appendHeartbeatMetric } from "./metrics_lib.mjs";
import { collectHeartbeatStatus } from "./status_lib.mjs";

try {
  const summary = collectHeartbeatStatus();

  appendHeartbeatMetric("status_summary", summary);
  appendLog(config.paths.logFile, `heartbeat_status_summary states=${JSON.stringify(summary.stateSummary)} queue=${JSON.stringify(summary.queueSummary)} approvals=${JSON.stringify(summary.approvalSummary)}`);
  console.log(`HEARTBEAT_STATUS states=${JSON.stringify(summary.stateSummary)} queue=${JSON.stringify(summary.queueSummary)} approvals=${JSON.stringify(summary.approvalSummary)}`);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  appendLog(config.paths.logFile, `heartbeat_status_summary_error error=${JSON.stringify(error.message)}`);
  console.error(`HEARTBEAT_STATUS_ERROR: ${error.message}`);
  process.exit(1);
}
