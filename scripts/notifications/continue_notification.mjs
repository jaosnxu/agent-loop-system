#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  appendLog,
  appendSectionItem,
  getField,
  nowIso,
  readState,
  replaceNextAction,
  setField,
  systemRoot,
  validateTaskId,
  writeState
} from "../lib/common.mjs";
import { syncBoard } from "../state/sync_board_lib.mjs";

const [approvalId, ...rest] = process.argv.slice(2);
const approvalsPath = path.join(systemRoot, "queue/human-approvals.json");

function usage() {
  console.error("Usage: node scripts/notifications/continue_notification.mjs APPROVAL_ID [--mode=dry-run|live] [--webhook-url=URL] [--live-approval-id=ID] [--confirm-live]");
  process.exit(64);
}

function parseArgs(args) {
  const options = new Map();
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const [key, ...value] = arg.slice(2).split("=");
    options.set(key, value.length ? value.join("=") : "true");
  }
  return options;
}

function readApprovals() {
  if (!fs.existsSync(approvalsPath)) throw new Error("Approval queue not found: queue/human-approvals.json");
  return JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
}

function writeApprovals(data) {
  fs.writeFileSync(approvalsPath, `${JSON.stringify(data, null, 2)}\n`);
}

function parseCommand(command = "") {
  try {
    return JSON.parse(command);
  } catch {
    return {};
  }
}

function stateExists(taskId) {
  return taskId && taskId !== "unbound" && fs.existsSync(path.join(systemRoot, `states/state_${taskId}.md`));
}

function runNode(args, allowFailure = false) {
  const result = spawnSync(process.execPath, args, { cwd: systemRoot, encoding: "utf8", stdio: "pipe" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result;
}

function sanitizeHeaders(headers = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (!/^[A-Za-z0-9-]+$/.test(key)) continue;
    const lower = key.toLowerCase();
    if (["host", "content-length", "connection"].includes(lower)) continue;
    clean[key] = String(value);
  }
  return clean;
}

function normalizeUrl(value = "") {
  if (!value) return "";
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Unsupported webhook protocol: ${url.protocol}`);
  return url.toString();
}

function resolvePrimary(primary, options) {
  const command = parseCommand(primary.command);
  const targetCommand = parseCommand(primary.target);
  const payloadSource = { ...targetCommand, ...command };
  const taskId = payloadSource.taskId || primary.taskId || "unbound";
  const message = payloadSource.message || payloadSource.body || primary.target || primary.command || "";
  const channel = payloadSource.channel || payloadSource.target || "external";
  const title = payloadSource.title || `Agent Loop notification for ${taskId}`;
  const webhookUrl = options.get("webhook-url") || payloadSource.webhookUrl || process.env.NOTIFICATION_WEBHOOK_URL || "";
  const headers = sanitizeHeaders(payloadSource.headers || {});
  return {
    command: payloadSource,
    taskId,
    title,
    channel,
    message: String(message),
    webhookUrl,
    headers
  };
}

function verifyPrimary(primary, resolved) {
  const failures = [];
  if (primary.status !== "approved") failures.push(`approval_status_${primary.status}`);
  if (primary.tool !== "github") failures.push(`unexpected_tool_${primary.tool}`);
  if (primary.operation !== "notifications:send") failures.push(`unexpected_operation_${primary.operation}`);
  if (!resolved.taskId || resolved.taskId === "unbound") failures.push("task_unbound");
  if (!resolved.message.trim()) failures.push("message_missing");
  if (!resolved.channel.trim()) failures.push("channel_missing");
  return failures;
}

function recordState(taskId, summary, blockedReasons, stageWhenReady = "notification_ready", nextAction = "Run live notification continuation only after the second human gate is approved.") {
  if (!stateExists(taskId)) return;
  validateTaskId(taskId);
  let text = readState(taskId);
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Evidence", `${nowIso()} notification_continuation ${summary}`);
  if (blockedReasons.length) {
    text = appendSectionItem(text, "Failure Records", `${nowIso()} NOTIFICATION_CONTINUATION_BLOCKED ${blockedReasons.join(", ")}`);
    text = replaceNextAction(text, "Resolve notification continuation blockers, then rerun scripts/notifications/continue_notification.mjs.");
  } else {
    text = setField(text, "Current Stage", stageWhenReady);
    text = appendSectionItem(text, "Completed Steps", `${nowIso()} stage=${stageWhenReady} note=notification continuation requirement=${JSON.stringify(getField(text, "Requirement").slice(0, 120))} acceptance=${JSON.stringify(getField(text, "Acceptance").slice(0, 120))}`);
    text = replaceNextAction(text, nextAction);
  }
  writeState(taskId, text);
  syncBoard();
  runNode(["scripts/memory/sync_task_memory.mjs", taskId], true);
}

function notificationPayload(resolved) {
  return {
    schemaVersion: "1.0",
    taskId: resolved.taskId,
    title: resolved.title,
    channel: resolved.channel,
    message: resolved.message,
    sentAt: new Date().toISOString()
  };
}

function findExistingLiveApproval(approvals, primaryApprovalId, taskId, channel) {
  return (approvals.requests || []).find((request) => {
    if (request.status !== "pending" || request.tool !== "github" || request.operation !== "notifications:send:live") return false;
    const command = parseCommand(request.command);
    return request.taskId === taskId &&
      command.primaryApprovalId === primaryApprovalId &&
      command.channel === channel;
  });
}

function createLiveApproval({ approvals, taskId, primaryApprovalId, channel, payload }) {
  const existing = findExistingLiveApproval(approvals, primaryApprovalId, taskId, channel);
  if (existing) return existing.approvalId;
  const approvalId = `approval-live-notify-${Date.now()}`;
  approvals.requests.push({
    approvalId,
    taskId,
    status: "pending",
    role: "development",
    tool: "github",
    operation: "notifications:send:live",
    target: channel,
    command: JSON.stringify({ taskId, primaryApprovalId, action: "send-notification", channel, payload }),
    reason: "live external notification requires second human gate",
    requestedAt: new Date().toISOString()
  });
  writeApprovals(approvals);
  if (stateExists(taskId)) {
    runNode(["scripts/human/record_gate.mjs", taskId, "pending", `notification_live:${approvalId}`, "notification-continuation", "live external notification requires second human approval"], true);
  }
  appendLog("logs/human-gate.log", `notification_live_approval_requested approval_id=${approvalId} primary=${primaryApprovalId} task=${taskId} channel=${JSON.stringify(channel)}`);
  return approvalId;
}

function verifyLiveApproval(approvals, liveApprovalId, primaryApprovalId, taskId, channel) {
  const request = (approvals.requests || []).find((item) => item.approvalId === liveApprovalId);
  if (!request) throw new Error(`Live approval request not found: ${liveApprovalId}`);
  const command = parseCommand(request.command);
  const failures = [];
  if (request.status !== "approved") failures.push(`live_approval_status_${request.status}`);
  if (request.tool !== "github") failures.push(`live_approval_tool_${request.tool}`);
  if (request.operation !== "notifications:send:live") failures.push(`live_approval_operation_${request.operation}`);
  if (request.taskId !== taskId) failures.push("live_approval_task_mismatch");
  if (command.primaryApprovalId !== primaryApprovalId) failures.push("live_approval_primary_mismatch");
  if (command.action !== "send-notification") failures.push("live_approval_action_mismatch");
  if (command.channel !== channel) failures.push("live_approval_channel_mismatch");
  return failures;
}

function postJson(urlString, payload, headers = {}) {
  const url = new URL(normalizeUrl(urlString));
  const body = JSON.stringify(payload);
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "agent-loop-system",
        ...headers
      }
    }, (response) => {
      let responseBody = "";
      response.on("data", (chunk) => responseBody += chunk);
      response.on("end", () => resolve({ status: response.statusCode || 0, body: responseBody.slice(0, 500) }));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

try {
  if (!approvalId) usage();
  const options = parseArgs(rest);
  const mode = options.get("mode") || "dry-run";
  const liveApprovalId = options.get("live-approval-id") || "";
  const confirmLive = options.get("confirm-live") === "true";
  if (!["dry-run", "live"].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);

  const approvals = readApprovals();
  const primary = (approvals.requests || []).find((item) => item.approvalId === approvalId);
  if (!primary) throw new Error(`Approval request not found: ${approvalId}`);
  const resolved = resolvePrimary(primary, options);
  const primaryBlockers = verifyPrimary(primary, resolved);
  const payload = notificationPayload(resolved);
  const summary = [
    `approval=${approvalId}`,
    `task=${resolved.taskId}`,
    `mode=${mode}`,
    `channel=${JSON.stringify(resolved.channel)}`,
    `webhook=${resolved.webhookUrl ? "configured" : "missing"}`,
    `message_bytes=${Buffer.byteLength(resolved.message)}`,
    `decision=${primaryBlockers.length ? "blocked" : "ready"}`
  ].join(" ");

  if (primaryBlockers.length) {
    recordState(resolved.taskId, summary, primaryBlockers);
    appendLog("logs/human-gate.log", `notification_continuation_blocked ${summary} blockers=${JSON.stringify(primaryBlockers)}`);
    appendLog("logs/tool-calls.log", `role=development tool=github operation=notifications:send target=${JSON.stringify(resolved.channel)} result=blocked`);
    console.log(`NOTIFICATION_CONTINUATION_BLOCKED ${summary} blockers=${primaryBlockers.join(",")}`);
    process.exit(2);
  }

  if (mode === "dry-run") {
    recordState(resolved.taskId, summary, [], "notification_dry_run_ready");
    appendLog("logs/human-gate.log", `notification_continuation_dry_run ${summary} payload=${JSON.stringify(payload)}`);
    appendLog("logs/tool-calls.log", `role=development tool=github operation=notifications:send:dry-run target=${JSON.stringify(resolved.channel)} result=passed`);
    console.log(`NOTIFICATION_DRY_RUN ${summary} payload=${JSON.stringify(payload)}`);
    process.exit(0);
  }

  if (!resolved.webhookUrl) {
    recordState(resolved.taskId, summary, ["webhook_url_missing"]);
    console.log(`NOTIFICATION_CONTINUATION_BLOCKED ${summary} blockers=webhook_url_missing`);
    process.exit(2);
  }

  if (!liveApprovalId) {
    const created = createLiveApproval({ approvals, taskId: resolved.taskId, primaryApprovalId: approvalId, channel: resolved.channel, payload });
    console.log(`PENDING_LIVE_HUMAN primary=${approvalId} live_approval=${created} task=${resolved.taskId} action=send-notification`);
    process.exit(90);
  }

  const liveFailures = verifyLiveApproval(approvals, liveApprovalId, approvalId, resolved.taskId, resolved.channel);
  if (liveFailures.length) {
    recordState(resolved.taskId, `${summary} live_approval=${liveApprovalId}`, liveFailures);
    appendLog("logs/tool-calls.log", `role=development tool=github operation=notifications:send:live target=${JSON.stringify(resolved.channel)} result=blocked`);
    console.log(`NOTIFICATION_CONTINUATION_BLOCKED ${summary} blockers=${liveFailures.join(",")}`);
    process.exit(2);
  }
  if (!confirmLive) throw new Error("Live notification requires --confirm-live after second human approval.");

  const response = await postJson(resolved.webhookUrl, payload, resolved.headers);
  const ok = response.status >= 200 && response.status < 300;
  const liveSummary = `${summary} live_approval=${liveApprovalId} http_status=${response.status}`;
  recordState(resolved.taskId, liveSummary, ok ? [] : [`notification_http_${response.status}`], ok ? "notification_sent" : "notification_ready", "Continue from post-notification checkpoint.");
  appendLog("logs/human-gate.log", `notification_continuation_live ${liveSummary}`);
  appendLog("logs/tool-calls.log", `role=development tool=github operation=notifications:send:live target=${JSON.stringify(resolved.channel)} result=${ok ? "passed" : "failed"}`);
  console.log(`${ok ? "NOTIFICATION_LIVE_DONE" : "NOTIFICATION_LIVE_FAILED"} ${liveSummary}`);
  process.exit(ok ? 0 : 2);
} catch (error) {
  appendLog("logs/error.log", `notification_continuation_failed approval=${approvalId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`NOTIFICATION_CONTINUATION_FAILED: ${error.message}`);
  process.exit(1);
}
