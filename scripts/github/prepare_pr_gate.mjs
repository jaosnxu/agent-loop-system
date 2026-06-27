#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendLog, appendSectionItem, nowIso, readState, setField, systemRoot, validateTaskId, writeState } from "../lib/common.mjs";
import { githubRepoConfig } from "../lib/github_config.mjs";
import { syncBoard } from "../state/sync_board_lib.mjs";

const [taskId, branch = "", title = "Agent Loop task PR"] = process.argv.slice(2);

function runNode(args) {
  return spawnSync(process.execPath, args, { cwd: systemRoot, encoding: "utf8", stdio: "pipe" });
}

function callGithub(role, operation, url) {
  const result = runNode(["scripts/mcp/mcp_tool.mjs", role, "github", operation, url]);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  if (!parsed.ok) throw new Error(parsed.error || `GitHub ${operation} failed`);
  return parsed.data;
}

try {
  validateTaskId(taskId);
  const repo = githubRepoConfig();
  if (!repo.owner || !repo.repo) throw new Error("GitHub repo is not configured.");
  const base = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  const prList = callGithub("review", "pull_requests:read", `${base}/pulls?state=open&per_page=10`);
  const ciRuns = callGithub("review", "pull_requests:read", `${base}/actions/runs?per_page=5`);
  const writeAttempt = runNode(["scripts/mcp/mcp_tool.mjs", "development", "github", "pull_requests:write", `${base}/pulls`, JSON.stringify({ taskId, title, head: branch || `task/${taskId}`, base: "main" })]);
  if (writeAttempt.status === 0) throw new Error("GitHub PR write unexpectedly bypassed human gate.");
  if (!writeAttempt.stdout.includes("HUMAN_GATE_REQUIRED")) throw new Error(`PR write did not create human gate: ${writeAttempt.stdout || writeAttempt.stderr}`);

  let text = readState(taskId);
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Evidence", `${nowIso()} github_pr_ci_gate repo=${repo.owner}/${repo.repo} source=${repo.source} pulls_status=${prList.status} actions_status=${ciRuns.status} branch=${JSON.stringify(branch || `task/${taskId}`)} title=${JSON.stringify(title)}`);
  writeState(taskId, text);
  syncBoard();
  runNode(["scripts/human/record_gate.mjs", taskId, "pending", `github_pr_create_update:${branch || `task/${taskId}`}`, "github-gate", "PR create/update and CI decision require human approval"]);
  appendLog("logs/human-gate.log", `github_pr_ci_gate task=${taskId} repo=${repo.owner}/${repo.repo} branch=${branch || `task/${taskId}`} title=${JSON.stringify(title)}`);
  console.log(`GITHUB_PR_CI_GATE_PENDING task=${taskId} repo=${repo.owner}/${repo.repo}`);
} catch (error) {
  appendLog("logs/error.log", `github_pr_ci_gate_failed task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`GITHUB_PR_CI_GATE_FAILED: ${error.message}`);
  process.exit(1);
}
