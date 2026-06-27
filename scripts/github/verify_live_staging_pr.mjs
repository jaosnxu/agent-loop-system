#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { appendLog, ensureDir, systemRoot } from "../lib/common.mjs";
import { githubRepoConfig, githubToken } from "../lib/github_config.mjs";

const approvalsPath = path.join(systemRoot, "queue/human-approvals.json");
const id = String(Date.now());
const taskId = `github-live-${id}`;
const baseBranch = `agent-loop-staging-base-${id}`;
const headBranch = `agent-loop-staging-head-${id}`;
const smokeFile = `.agent-loop-live-smoke/${id}.md`;
const createdBranches = [];
const createdApprovalsBackup = fs.existsSync(approvalsPath) ? fs.readFileSync(approvalsPath, "utf8") : "";

function requireEnabled() {
  if (process.env.AGENT_LOOP_GITHUB_LIVE_STAGING !== "1") {
    throw new Error("Set AGENT_LOOP_GITHUB_LIVE_STAGING=1 to run live GitHub staging verification.");
  }
}

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: systemRoot,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      GITHUB_OWNER: repo.owner,
      GITHUB_REPO: repo.repo,
      AGENT_LOOP_GITHUB_STAGING_MODE: "1",
      ...(options.env || {})
    }
  });
  if (options.allowFailure !== true && result.status !== 0) {
    throw new Error(`${args.join(" ")} failed status=${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function runShell(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: systemRoot,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...(options.env || {}) }
  });
  if (options.allowFailure !== true && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed status=${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function githubRequest(method, apiPath, payload = undefined) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.github.com/repos/${repo.owner}/${repo.repo}${apiPath}`, {
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
      res.on("end", () => {
        let parsed = {};
        try {
          parsed = response ? JSON.parse(response) : {};
        } catch {
          parsed = { raw: response };
        }
        resolve({ status: res.statusCode || 0, body: parsed, raw: response });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function expectGithub(method, apiPath, payload, okStatuses) {
  const response = await githubRequest(method, apiPath, payload);
  if (!okStatuses.includes(response.status)) {
    throw new Error(`GitHub ${method} ${apiPath} returned ${response.status}: ${response.raw.slice(0, 1000)}`);
  }
  return response.body;
}

async function deleteBranch(branch) {
  const response = await githubRequest("DELETE", `/git/refs/heads/${branch}`);
  if (![204, 404, 422].includes(response.status)) {
    appendLog("logs/error.log", `github_live_staging_cleanup_failed branch=${branch} status=${response.status} body=${JSON.stringify(response.body).slice(0, 500)}`);
  }
}

function writeApprovals(requests) {
  ensureDir(path.dirname(approvalsPath));
  fs.writeFileSync(approvalsPath, `${JSON.stringify({ version: "0.1.0", requests }, null, 2)}\n`);
}

function readApprovals() {
  return JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
}

function makeApproval(action, command) {
  return {
    approvalId: `approval-live-staging-${action}-${id}`,
    taskId,
    status: "pending",
    role: "development",
    tool: "github",
    operation: `pull_requests:${action === "create" ? "write" : action}`,
    target: `https://api.github.com/repos/${repo.owner}/${repo.repo}/pulls`,
    command: JSON.stringify({ taskId, ...command }),
    reason: "live staging verification primary approval",
    requestedAt: new Date().toISOString()
  };
}

function approve(approvalId, reason) {
  const result = runShell("scripts/human/approve_approval.sh", [approvalId, reason], {
    env: {
      HUMAN_GATE_ACTOR: "github-live-staging-verifier",
      GITHUB_OWNER: repo.owner,
      GITHUB_REPO: repo.repo
    }
  });
  if (!result.stdout.includes(`APPROVAL_RESOLVED approval=${approvalId}`)) {
    throw new Error(`Approval did not resolve: ${approvalId}\n${result.stdout}\n${result.stderr}`);
  }
}

function liveApprovalFor(primaryApprovalId, action) {
  const approvals = readApprovals();
  const request = approvals.requests.find((item) => {
    if (item.status !== "pending") return false;
    const command = JSON.parse(item.command || "{}");
    return command.primaryApprovalId === primaryApprovalId && command.action === action;
  });
  if (!request) throw new Error(`Live approval not found for primary=${primaryApprovalId} action=${action}`);
  return request.approvalId;
}

function continueOperation(approvalId, action, args = [], options = {}) {
  return runNode(["scripts/github/continue_pr_operation.mjs", approvalId, action, ...args], options);
}

async function findPr() {
  const head = encodeURIComponent(`${repo.owner}:${headBranch}`);
  const base = encodeURIComponent(baseBranch);
  const response = await expectGithub("GET", `/pulls?state=all&head=${head}&base=${base}&per_page=1`, undefined, [200]);
  if (!Array.isArray(response) || !response[0]) throw new Error("Live staging PR was not found after create.");
  return response[0];
}

async function runLiveAction(primaryApproval, action, args = []) {
  const first = continueOperation(primaryApproval.approvalId, action, ["--mode=live"], { allowFailure: true });
  if (first.status !== 90 || !first.stdout.includes("PENDING_LIVE_HUMAN")) {
    throw new Error(`Expected pending live human gate for ${action}, got status=${first.status}\n${first.stdout}\n${first.stderr}`);
  }
  const liveApprovalId = liveApprovalFor(primaryApproval.approvalId, action);
  approve(liveApprovalId, `approve live staging ${action}`);
  const done = continueOperation(primaryApproval.approvalId, action, ["--mode=live", `--live-approval-id=${liveApprovalId}`, "--confirm-live", ...args]);
  if (done.status !== 0 || !done.stdout.includes("GITHUB_CONTINUATION_LIVE_DONE")) {
    throw new Error(`Live ${action} did not complete.\nstatus=${done.status}\nstdout=${done.stdout}\nstderr=${done.stderr}`);
  }
  return { liveApprovalId, output: done.stdout.trim() };
}

async function main() {
  requireEnabled();
  if (!token) throw new Error("GitHub token is required for live staging verification.");

  runNode(["scripts/state/create_state.mjs", taskId, "GitHub live staging smoke", "--priority=P1", "--type=development", "--requirement=Live GitHub continuation must be proven against a safe staging branch.", "--acceptance=Verifier must create a temporary PR, pass second human gates, review it, merge it into a temporary base branch, and clean remote branches."]);

  const repoInfo = await expectGithub("GET", "", undefined, [200]);
  const defaultBranch = repoInfo.default_branch || "main";
  const baseRef = await expectGithub("GET", `/git/ref/heads/${defaultBranch}`, undefined, [200]);
  const baseSha = baseRef.object?.sha;
  if (!baseSha) throw new Error(`Could not resolve default branch sha for ${defaultBranch}`);

  await expectGithub("POST", "/git/refs", { ref: `refs/heads/${baseBranch}`, sha: baseSha }, [201]);
  createdBranches.push(baseBranch);
  await expectGithub("POST", "/git/refs", { ref: `refs/heads/${headBranch}`, sha: baseSha }, [201]);
  createdBranches.push(headBranch);
  await expectGithub("PUT", `/contents/${smokeFile}`, {
    message: `Add live staging smoke ${id}`,
    content: Buffer.from(`# GitHub live staging smoke\n\nTask: ${taskId}\n`).toString("base64"),
    branch: headBranch
  }, [200, 201]);

  const createApproval = makeApproval("create", {
    title: `Agent Loop live staging smoke ${id}`,
    head: headBranch,
    base: baseBranch,
    body: "Temporary PR for Agent Loop live staging verification."
  });
  writeApprovals([createApproval]);
  approve(createApproval.approvalId, "approve primary create");
  const createResult = await runLiveAction(createApproval, "create");
  const pr = await findPr();
  const prNumber = pr.number;

  const reviewApproval = makeApproval("review", {
    prNumber,
    title: `Agent Loop live staging smoke ${id}`,
    head: headBranch,
    base: baseBranch,
    reviewEvent: "COMMENT",
    reviewBody: "Agent Loop live staging review verification."
  });
  const currentApprovals = readApprovals();
  currentApprovals.requests.push(reviewApproval);
  fs.writeFileSync(approvalsPath, `${JSON.stringify(currentApprovals, null, 2)}\n`);
  approve(reviewApproval.approvalId, "approve primary review");
  const reviewResult = await runLiveAction(reviewApproval, "review");

  const mergeApproval = makeApproval("merge", {
    prNumber,
    title: `Agent Loop live staging smoke ${id}`,
    head: headBranch,
    base: baseBranch,
    mergeMethod: "squash",
    commitTitle: `Merge live staging smoke ${id}`,
    commitMessage: "Temporary merge into staging base branch."
  });
  const approvalsAfterReview = readApprovals();
  approvalsAfterReview.requests.push(mergeApproval);
  fs.writeFileSync(approvalsPath, `${JSON.stringify(approvalsAfterReview, null, 2)}\n`);
  approve(mergeApproval.approvalId, "approve primary merge");
  const mergeResult = await runLiveAction(mergeApproval, "merge");
  const mergedPr = await expectGithub("GET", `/pulls/${prNumber}`, undefined, [200]);
  if (mergedPr.merged !== true) throw new Error(`PR ${prNumber} was not marked merged after live merge.`);

  appendLog("logs/human-gate.log", `github_live_staging_verified task=${taskId} repo=${repo.owner}/${repo.repo} pr=${prNumber} create=${JSON.stringify(createResult)} review=${JSON.stringify(reviewResult)} merge=${JSON.stringify(mergeResult)}`);
  console.log(`VERIFY_GITHUB_LIVE_STAGING_OK task=${taskId} repo=${repo.owner}/${repo.repo} pr=${prNumber} base=${baseBranch} head=${headBranch}`);
}

let repo = githubRepoConfig();
let token = githubToken().token;

try {
  await main();
} catch (error) {
  appendLog("logs/error.log", `github_live_staging_failed task=${taskId} error=${JSON.stringify(error.message)}`);
  console.error(`VERIFY_GITHUB_LIVE_STAGING_FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const branch of [...createdBranches].reverse()) {
    await deleteBranch(branch);
  }
  if (createdApprovalsBackup) {
    fs.writeFileSync(approvalsPath, createdApprovalsBackup);
  } else {
    fs.rmSync(approvalsPath, { force: true });
  }
  fs.rmSync(path.join(systemRoot, `states/state_${taskId}.md`), { force: true });
  fs.rmSync(path.join(systemRoot, `memory/tasks/${taskId}.md`), { force: true });
  fs.rmSync(path.join(systemRoot, `memory/evidence/${taskId}.jsonl`), { force: true });
  fs.rmSync(path.join(systemRoot, `memory/budget/${taskId}.jsonl`), { force: true });
  runNode(["scripts/state/sync_board.mjs"], { allowFailure: true });
}
