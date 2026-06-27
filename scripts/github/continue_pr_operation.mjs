#!/usr/bin/env node
import fs from "node:fs";
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
import { githubRepoConfig, githubToken } from "../lib/github_config.mjs";
import { syncBoard } from "../state/sync_board_lib.mjs";

const [approvalId, maybeAction = "", ...rest] = process.argv.slice(2);
const approvalsPath = path.join(systemRoot, "queue/human-approvals.json");

function usage() {
  console.error("Usage: node scripts/github/continue_pr_operation.mjs APPROVAL_ID [create|review|merge] [--mode=dry-run|live] [--live-approval-id=ID] [--confirm-live]");
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

function inferAction(operation = "") {
  if (operation.includes(":merge")) return "merge";
  if (operation.includes(":review")) return "review";
  return "create";
}

function runNode(args, allowFailure = false) {
  const result = spawnSync(process.execPath, args, { cwd: systemRoot, encoding: "utf8", stdio: "pipe" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result;
}

function callGithubRead(url) {
  const result = runNode(["scripts/mcp/mcp_tool.mjs", "review", "github", "pull_requests:read", url]);
  const parsed = JSON.parse(result.stdout);
  if (!parsed.ok) throw new Error(parsed.error || `GitHub read failed: ${url}`);
  const body = parsed.data?.bodyText || parsed.data?.body || "";
  return JSON.parse(body || "{}");
}

function githubRequest(method, url, payload) {
  const { token, source } = githubToken();
  if (!token) throw new Error("GitHub token is required for live continuation.");
  const body = payload ? JSON.stringify(payload) : "";
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: {
        "User-Agent": "agent-loop-system",
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {})
      }
    }, (res) => {
      let response = "";
      res.on("data", (chunk) => response += chunk);
      res.on("end", () => resolve({ status: res.statusCode, authSource: source, body: response }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function stateExists(taskId) {
  return taskId && taskId !== "unbound" && fs.existsSync(path.join(systemRoot, `states/state_${taskId}.md`));
}

function recordState(taskId, summary, blockedReasons, stageWhenReady = "github_continuation_ready") {
  if (!stateExists(taskId)) return;
  validateTaskId(taskId);
  let text = readState(taskId);
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Evidence", `${nowIso()} github_pr_continuation ${summary}`);
  if (blockedReasons.length) {
    text = appendSectionItem(text, "Failure Records", `${nowIso()} GITHUB_CONTINUATION_BLOCKED ${blockedReasons.join(", ")}`);
    text = replaceNextAction(text, "Resolve GitHub continuation blockers, then rerun scripts/github/continue_pr_operation.mjs.");
  } else {
    text = setField(text, "Current Stage", stageWhenReady);
    text = appendSectionItem(text, "Completed Steps", `${nowIso()} stage=${stageWhenReady} note=github continuation ready requirement=${JSON.stringify(getField(text, "Requirement").slice(0, 120))} acceptance=${JSON.stringify(getField(text, "Acceptance").slice(0, 120))}`);
    text = replaceNextAction(text, "Run live continuation only after the second human gate is approved.");
  }
  writeState(taskId, text);
  syncBoard();
  runNode(["scripts/memory/sync_task_memory.mjs", taskId], true);
}

function createLiveApproval({ approvals, taskId, action, primaryApprovalId, repo, payload }) {
  const approvalId = `approval-live-${Date.now()}`;
  approvals.requests.push({
    approvalId,
    taskId,
    status: "pending",
    role: "development",
    tool: "github",
    operation: `pull_requests:${action}:live`,
    target: `${repo.owner}/${repo.repo}`,
    command: JSON.stringify({ taskId, primaryApprovalId, action, payload }),
    reason: "live GitHub continuation requires second human gate",
    requestedAt: new Date().toISOString()
  });
  writeApprovals(approvals);
  if (stateExists(taskId)) {
    runNode(["scripts/human/record_gate.mjs", taskId, "pending", `github_live_${action}:${approvalId}`, "github-continuation", "live GitHub continuation requires second human approval"], true);
  }
  appendLog("logs/human-gate.log", `github_live_approval_requested approval_id=${approvalId} primary=${primaryApprovalId} task=${taskId} action=${action}`);
  return approvalId;
}

function verifyLiveApproval(approvals, liveApprovalId, primaryApprovalId, taskId, action) {
  const request = (approvals.requests || []).find((item) => item.approvalId === liveApprovalId);
  if (!request) throw new Error(`Live approval request not found: ${liveApprovalId}`);
  const command = parseCommand(request.command);
  const failures = [];
  if (request.status !== "approved") failures.push(`live_approval_status_${request.status}`);
  if (request.taskId !== taskId) failures.push("live_approval_task_mismatch");
  if (command.primaryApprovalId !== primaryApprovalId) failures.push("live_approval_primary_mismatch");
  if (command.action !== action) failures.push("live_approval_action_mismatch");
  return failures;
}

function findOpenPr({ baseUrl, owner, head, baseBranch }) {
  const encodedHead = encodeURIComponent(`${owner}:${head}`);
  const encodedBase = encodeURIComponent(baseBranch);
  const prs = callGithubRead(`${baseUrl}/pulls?state=open&head=${encodedHead}&base=${encodedBase}&per_page=1`);
  return Array.isArray(prs) ? prs[0] : null;
}

function readCiRuns({ baseUrl, head }) {
  const runs = callGithubRead(`${baseUrl}/actions/runs?branch=${encodeURIComponent(head)}&per_page=10`);
  return Array.isArray(runs?.workflow_runs) ? runs.workflow_runs : [];
}

try {
  if (!approvalId) usage();
  const options = parseArgs(rest);
  const approvals = readApprovals();
  const primary = (approvals.requests || []).find((item) => item.approvalId === approvalId);
  if (!primary) throw new Error(`Approval request not found: ${approvalId}`);
  const command = parseCommand(primary.command);
  const taskId = command.taskId || primary.taskId || "unbound";
  const action = ["create", "review", "merge"].includes(maybeAction) ? maybeAction : inferAction(primary.operation);
  const mode = options.get("mode") || "dry-run";
  const liveApprovalId = options.get("live-approval-id") || "";
  const confirmLive = options.get("confirm-live") === "true";
  const repo = githubRepoConfig();
  if (!repo.owner || !repo.repo) throw new Error("GitHub repo is not configured.");
  if (!["dry-run", "live"].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);
  if (!["create", "review", "merge"].includes(action)) throw new Error(`Unsupported action: ${action}`);

  const head = command.head || `task/${taskId}`;
  const baseBranch = command.base || "main";
  const title = command.title || `Agent Loop task ${taskId}`;
  const body = command.body || `Automated PR continuation for ${taskId}.`;
  const baseUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  const existingPr = findOpenPr({ baseUrl, owner: repo.owner, head, baseBranch });
  const ciRuns = readCiRuns({ baseUrl, head });
  const successfulRun = ciRuns.find((run) => run.status === "completed" && run.conclusion === "success");
  const blockedReasons = [];

  if (primary.status !== "approved") blockedReasons.push(`approval_status_${primary.status}`);
  if (primary.tool !== "github") blockedReasons.push(`unexpected_tool_${primary.tool}`);
  if (action === "review" && !existingPr && !command.prNumber) blockedReasons.push("pr_missing");
  if (action === "merge") {
    if (!existingPr && !command.prNumber) blockedReasons.push("pr_missing");
    if (!ciRuns.length) blockedReasons.push("ci_missing");
    else if (!successfulRun) blockedReasons.push("ci_not_successful");
  }

  const prNumber = command.prNumber || existingPr?.number || "";
  const payload = {
    create: { title, head, base: baseBranch, body },
    review: { event: command.reviewEvent || "COMMENT", body: command.reviewBody || `Loop review continuation for ${taskId}.` },
    merge: { merge_method: command.mergeMethod || "squash", commit_title: command.commitTitle || title, commit_message: command.commitMessage || body }
  }[action];
  const summary = [
    `approval=${approvalId}`,
    `task=${taskId}`,
    `action=${action}`,
    `mode=${mode}`,
    `repo=${repo.owner}/${repo.repo}`,
    `head=${JSON.stringify(head)}`,
    `base=${JSON.stringify(baseBranch)}`,
    `pr=${prNumber || "none"}`,
    `ci_runs=${ciRuns.length}`,
    `ci_success=${successfulRun ? "true" : "false"}`,
    `decision=${blockedReasons.length ? "blocked" : "ready"}`
  ].join(" ");

  if (blockedReasons.length) {
    recordState(taskId, summary, blockedReasons);
    appendLog("logs/human-gate.log", `github_pr_continuation_blocked ${summary} blockers=${JSON.stringify(blockedReasons)}`);
    console.log(`GITHUB_CONTINUATION_BLOCKED ${summary} blockers=${blockedReasons.join(",")}`);
    process.exit(2);
  }

  if (mode === "dry-run") {
    recordState(taskId, summary, [], "github_continuation_dry_run_ready");
    appendLog("logs/human-gate.log", `github_pr_continuation_dry_run ${summary} payload=${JSON.stringify(payload)}`);
    console.log(`GITHUB_CONTINUATION_DRY_RUN ${summary} payload=${JSON.stringify(payload)}`);
    process.exit(0);
  }

  if (!liveApprovalId) {
    const created = createLiveApproval({ approvals, taskId, action, primaryApprovalId: approvalId, repo, payload });
    console.log(`PENDING_LIVE_HUMAN primary=${approvalId} live_approval=${created} task=${taskId} action=${action}`);
    process.exit(90);
  }

  const liveFailures = verifyLiveApproval(approvals, liveApprovalId, approvalId, taskId, action);
  if (liveFailures.length) {
    recordState(taskId, `${summary} live_approval=${liveApprovalId}`, liveFailures);
    console.log(`GITHUB_CONTINUATION_BLOCKED ${summary} blockers=${liveFailures.join(",")}`);
    process.exit(2);
  }
  if (!confirmLive) throw new Error("Live continuation requires --confirm-live after second human approval.");

  let response;
  if (action === "create") {
    response = await githubRequest("POST", `${baseUrl}/pulls`, payload);
  } else if (action === "review") {
    response = await githubRequest("POST", `${baseUrl}/pulls/${prNumber}/reviews`, payload);
  } else {
    response = await githubRequest("PUT", `${baseUrl}/pulls/${prNumber}/merge`, payload);
  }
  const ok = response.status >= 200 && response.status < 300;
  const liveSummary = `${summary} live_approval=${liveApprovalId} http_status=${response.status}`;
  recordState(taskId, liveSummary, ok ? [] : [`github_http_${response.status}`], ok ? "github_continuation_completed" : "github_continuation_ready");
  appendLog("logs/human-gate.log", `github_pr_continuation_live ${liveSummary}`);
  console.log(`${ok ? "GITHUB_CONTINUATION_LIVE_DONE" : "GITHUB_CONTINUATION_LIVE_FAILED"} ${liveSummary}`);
  process.exit(ok ? 0 : 2);
} catch (error) {
  appendLog("logs/error.log", `github_pr_continuation_failed approval=${approvalId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`GITHUB_CONTINUATION_FAILED: ${error.message}`);
  process.exit(1);
}
