import fs from "node:fs";
import path from "node:path";
import config from "../../config/heartbeat.config.js";
import { ensureDir, systemRoot } from "../lib/common.mjs";

export function heartbeatMetricsPath() {
  return path.join(systemRoot, config.paths.metricsFile || "logs/heartbeat-metrics.jsonl");
}

export function appendHeartbeatMetric(eventType, payload = {}) {
  const file = heartbeatMetricsPath();
  ensureDir(path.dirname(file));
  const metric = {
    schemaVersion: "1.0",
    recordedAt: new Date().toISOString(),
    eventType,
    ...payload
  };
  fs.appendFileSync(file, `${JSON.stringify(metric)}\n`);
  return metric;
}

export function readHeartbeatMetrics({ limit = 200 } = {}) {
  const file = heartbeatMetricsPath();
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const selected = Number.isFinite(Number(limit)) && Number(limit) > 0 ? lines.slice(-Number(limit)) : lines;
  return selected.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      return {
        schemaVersion: "1.0",
        recordedAt: "",
        eventType: "parse_error",
        lineNumber: lines.length - selected.length + index + 1,
        error: error.message
      };
    }
  });
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestWith(metrics, predicate) {
  for (let index = metrics.length - 1; index >= 0; index -= 1) {
    if (predicate(metrics[index])) return metrics[index];
  }
  return null;
}

export function summarizeHeartbeatMetrics(metrics) {
  const eventCounts = metrics.reduce((acc, metric) => {
    acc[metric.eventType || "unknown"] = (acc[metric.eventType || "unknown"] || 0) + 1;
    return acc;
  }, {});
  const tickMetrics = metrics.filter((metric) => metric.eventType === "heartbeat_tick");
  const statusMetrics = metrics.filter((metric) => metric.eventType === "status_summary");
  const errorMetrics = metrics.filter((metric) => metric.eventType === "heartbeat_error" || metric.eventType === "parse_error" || metric.result === "error");
  const latestStatus = latestWith(metrics, (metric) => metric.stateSummary || metric.status?.stateSummary);
  const latestStatusPayload = latestStatus?.stateSummary ? latestStatus : latestStatus?.status || {};
  const maxWaitingHuman = metrics.reduce((max, metric) => {
    const summary = metric.stateSummary || metric.status?.stateSummary || {};
    return Math.max(max, numberValue(summary.waiting_human));
  }, 0);
  const maxNoProgressLimit = metrics.reduce((max, metric) => {
    const summary = metric.stateSummary || metric.status?.stateSummary || {};
    return Math.max(max, numberValue(summary.no_progress_limit));
  }, 0);
  const dispatchedTotal = tickMetrics.reduce((sum, metric) => sum + numberValue(metric.dispatchedCount), 0);
  const connectorEventsTotal = tickMetrics.reduce((sum, metric) => sum + numberValue(metric.connectorEventsCreated ?? metric.githubEventsCreated), 0);
  const queueRunsFailed = tickMetrics.filter((metric) => numberValue(metric.queueRunStatus) !== 0).length;
  let consecutiveNoTaskTicks = 0;
  for (let index = tickMetrics.length - 1; index >= 0; index -= 1) {
    if (tickMetrics[index].result === "no_tasks") consecutiveNoTaskTicks += 1;
    else break;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    metricsCount: metrics.length,
    firstRecordedAt: metrics[0]?.recordedAt || "",
    lastRecordedAt: metrics[metrics.length - 1]?.recordedAt || "",
    eventCounts,
    heartbeatTicks: tickMetrics.length,
    statusSummaries: statusMetrics.length,
    errors: errorMetrics.length,
    dispatchedTotal,
    connectorEventsTotal,
    githubEventsTotal: connectorEventsTotal,
    queueRunsFailed,
    consecutiveNoTaskTicks,
    maxWaitingHuman,
    maxNoProgressLimit,
    latestStateSummary: latestStatusPayload.stateSummary || {},
    latestQueueSummary: latestStatusPayload.queueSummary || {},
    latestApprovalSummary: latestStatusPayload.approvalSummary || {}
  };
}
