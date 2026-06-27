#!/usr/bin/env node
import fs from "node:fs";
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
import { githubRepoConfig } from "../lib/github_config.mjs";
import { syncBoard } from "../state/sync_board_lib.mjs";

const [approvalId, headArg = "", baseArg = "main"] = process.argv.slice(2);
const approvalsPath = path.join(systemRoot, "queue/human-approvals.json");

function usage() {
  console.error("Usage: node scripts/github/merge_readiness.mjs APPROVAL_ID [headBranch] [baseBranch]");
  process.exit(64);
}

function readApprovals() {
  if (!fs.existsSync(approvalsPath)) throw new Error("Approval queue not found: queue/human-approvals.json");
  return JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
}

function parseCommand(command = "") {
  try {
    return JSON.parse(command);
  } catch {
    return {};
  }
}

function runNode(args) {
  return spawnSync(process.execPath, args, { cwd: systemRoot, encoding: "utf8", stdio: "pipe" });
}

function callGithub(url) {
  const result = runNode(["scripts/mcp/mcp_tool.mjs", "review", "github", "pull_requests:read", url]);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  if (!parsed.ok) throw new Error(parsed.error || `GitHub read failed: ${url}`);
  const body = parsed.data?.bodyText || parsed.data?.body || "";
  return { status: parsed.data?.status, body: JSON.parse(body || "{}"), raw: parsed.data };
}

function stateExists(taskId) {
  return taskId && taskId !== "unbound" && fs.existsSync(path.join(systemRoot, `states/state_${taskId}.md`));
}

function recordReadiness(taskId, summary, blockedReasons) {
  if (!stateExists(taskId)) return;
  validateTaskId(taskId);
  let text = readState(taskId);
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Evidence", `${nowIso()} github_merge_readiness ${summary}`);
  if (blockedReasons.length) {
    text = appendSectionItem(text, "Failure Records", `${nowIso()} MERGE_READINESS_BLOCKED ${blockedReasons.join(", ")}`);
    text = replaceNextAction(text, "Resolve merge readiness blockers, then rerun scripts/github/merge_readiness.mjs.");
  } else {
    text = setField(text, "Current Stage", "merge_ready");
    text = appendSectionItem(text, "Completed Steps", `${nowIso()} stage=merge_ready note=github merge readiness passed requirement=${JSON.stringify(getField(text, "Requirement").slice(0, 120))} acceptance=${JSON.stringify(getField(text, "Acceptance").slice(0, 120))}`);
    text = replaceNextAction(text, "Run the operation-specific merge continuation only after final human confirmation.");
  }
  writeState(taskId, text);
  syncBoard();
  runNode(["scripts/memory/sync_task_memory.mjs", taskId]);
}

try {
  if (!approvalId) usage();
  const approvals = readApprovals();
  const request = (approvals.requests || []).find((item) => item.approvalId === approvalId);
  if (!request) throw new Error(`Approval request not found: ${approvalId}`);
  const command = parseCommand(request.command);
  const taskId = command.taskId || request.taskId || "unbound";
  const head = headArg || command.head || `task/${taskId}`;
  const baseBranch = baseArg || command.base || "main";
  const blockedReasons = [];

  if (request.status !== "approved") blockedReasons.push(`approval_status_${request.status}`);
  if (request.tool !== "github") blockedReasons.push(`unexpected_tool_${request.tool}`);
  if (!["pull_requests:write", "pull_requests:merge"].includes(request.operation)) blockedReasons.push(`unexpected_operation_${request.operation}`);

  const repo = githubRepoConfig();
  if (!repo.owner || !repo.repo) throw new Error("GitHub repo is not configured.");
  const baseUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  const encodedHead = encodeURIComponent(`${repo.owner}:${head}`);
  const encodedBase = encodeURIComponent(baseBranch);
  const prs = callGithub(`${baseUrl}/pulls?state=open&head=${encodedHead}&base=${encodedBase}&per_page=1`);
  const pr = Array.isArray(prs.body) ? prs.body[0] : null;
  if (!pr) blockedReasons.push("pr_missing");

  const runs = callGithub(`${baseUrl}/actions/runs?branch=${encodeURIComponent(head)}&per_page=10`);
  const workflowRuns = Array.isArray(runs.body?.workflow_runs) ? runs.body.workflow_runs : [];
  const successfulRun = workflowRuns.find((run) => run.status === "completed" && run.conclusion === "success");
  const failedRun = workflowRuns.find((run) => run.status === "completed" && run.conclusion && run.conclusion !== "success");
  if (!workflowRuns.length) blockedReasons.push("ci_missing");
  else if (!successfulRun) blockedReasons.push(failedRun ? `ci_${failedRun.conclusion}` : "ci_not_successful");

  const summary = [
    `approval=${approvalId}`,
    `task=${taskId}`,
    `repo=${repo.owner}/${repo.repo}`,
    `head=${JSON.stringify(head)}`,
    `base=${JSON.stringify(baseBranch)}`,
    `approval_status=${request.status}`,
    `pr=${pr ? `#${pr.number}` : "missing"}`,
    `ci_runs=${workflowRuns.length}`,
    `ci_success=${successfulRun ? "true" : "false"}`,
    `decision=${blockedReasons.length ? "blocked" : "ready"}`
  ].join(" ");

  recordReadiness(taskId, summary, blockedReasons);
  appendLog("logs/human-gate.log", `github_merge_readiness ${summary} blockers=${JSON.stringify(blockedReasons)}`);
  if (blockedReasons.length) {
    console.log(`MERGE_READINESS_BLOCKED ${summary} blockers=${blockedReasons.join(",")}`);
    process.exit(2);
  }
  console.log(`MERGE_READINESS_READY ${summary}`);
} catch (error) {
  appendLog("logs/error.log", `github_merge_readiness_failed approval=${approvalId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`MERGE_READINESS_FAILED: ${error.message}`);
  process.exit(1);
}
