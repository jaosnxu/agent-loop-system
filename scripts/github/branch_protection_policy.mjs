#!/usr/bin/env node
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { appendLog, systemRoot } from "../lib/common.mjs";
import { githubRepoConfig, githubToken } from "../lib/github_config.mjs";

const [action = "check", branchArg = ""] = process.argv.slice(2);
const configPath = path.join(systemRoot, "config/github-branch-protection.config.json");

function readConfig() {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const requiredFields = [
    "branch",
    "requiredChecks",
    "requireBranchesUpToDate",
    "requiredApprovingReviewCount",
    "dismissStaleReviews",
    "requireCodeOwnerReviews",
    "requiredConversationResolution",
    "enforceAdmins",
    "allowForcePushes",
    "allowDeletions"
  ];
  for (const field of requiredFields) {
    if (config[field] === undefined) throw new Error(`Missing branch protection policy field: ${field}`);
  }
  if (!Array.isArray(config.requiredChecks) || !config.requiredChecks.length) {
    throw new Error("requiredChecks must contain at least one check name");
  }
  return config;
}

function githubRequest({ token, repo, method, apiPath, payload = undefined }) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.github.com/repos/${repo.owner}/${repo.repo}${apiPath}`, {
      method,
      headers: {
        "User-Agent": "agent-loop-system",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
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

async function expectGithub(ctx, method, apiPath, payload, okStatuses) {
  const response = await githubRequest({ ...ctx, method, apiPath, payload });
  if (!okStatuses.includes(response.status)) {
    throw new Error(`GitHub ${method} ${apiPath} returned ${response.status}: ${response.raw.slice(0, 1000)}`);
  }
  return response;
}

function protectionPayload(policy) {
  return {
    required_status_checks: {
      strict: Boolean(policy.requireBranchesUpToDate),
      contexts: policy.requiredChecks
    },
    enforce_admins: Boolean(policy.enforceAdmins),
    required_pull_request_reviews: {
      dismiss_stale_reviews: Boolean(policy.dismissStaleReviews),
      require_code_owner_reviews: Boolean(policy.requireCodeOwnerReviews),
      required_approving_review_count: Number(policy.requiredApprovingReviewCount),
      require_last_push_approval: Boolean(policy.requireLastPushApproval)
    },
    restrictions: null,
    required_conversation_resolution: Boolean(policy.requiredConversationResolution),
    allow_force_pushes: Boolean(policy.allowForcePushes),
    allow_deletions: Boolean(policy.allowDeletions)
  };
}

function readCheckContexts(protection) {
  const statusChecks = protection.required_status_checks;
  if (!statusChecks) return [];
  const contexts = Array.isArray(statusChecks.contexts) ? statusChecks.contexts : [];
  const checks = Array.isArray(statusChecks.checks) ? statusChecks.checks.map((check) => check.context).filter(Boolean) : [];
  return Array.from(new Set([...contexts, ...checks])).sort();
}

function protectionStatus({ policy, protection }) {
  const missing = [];
  const contexts = readCheckContexts(protection);
  const expectedContexts = [...policy.requiredChecks].sort();
  const review = protection.required_pull_request_reviews || {};

  for (const check of expectedContexts) {
    if (!contexts.includes(check)) missing.push(`required_check_missing:${check}`);
  }
  for (const check of contexts) {
    if (!expectedContexts.includes(check)) missing.push(`unexpected_required_check:${check}`);
  }
  if (Boolean(protection.required_status_checks?.strict) !== Boolean(policy.requireBranchesUpToDate)) {
    missing.push("require_branches_up_to_date_mismatch");
  }
  if (Number(review.required_approving_review_count || 0) !== Number(policy.requiredApprovingReviewCount)) {
    missing.push("required_approving_review_count_mismatch");
  }
  if (Boolean(review.dismiss_stale_reviews) !== Boolean(policy.dismissStaleReviews)) {
    missing.push("dismiss_stale_reviews_mismatch");
  }
  if (Boolean(review.require_code_owner_reviews) !== Boolean(policy.requireCodeOwnerReviews)) {
    missing.push("require_code_owner_reviews_mismatch");
  }
  if (Boolean(review.require_last_push_approval) !== Boolean(policy.requireLastPushApproval)) {
    missing.push("require_last_push_approval_mismatch");
  }
  if (Boolean(protection.required_conversation_resolution?.enabled) !== Boolean(policy.requiredConversationResolution)) {
    missing.push("required_conversation_resolution_mismatch");
  }
  if (Boolean(protection.enforce_admins?.enabled) !== Boolean(policy.enforceAdmins)) {
    missing.push("enforce_admins_mismatch");
  }
  if (Boolean(protection.allow_force_pushes?.enabled) !== Boolean(policy.allowForcePushes)) {
    missing.push("allow_force_pushes_mismatch");
  }
  if (Boolean(protection.allow_deletions?.enabled) !== Boolean(policy.allowDeletions)) {
    missing.push("allow_deletions_mismatch");
  }

  return {
    ok: missing.length === 0,
    missing,
    observed: {
      checks: contexts,
      requireBranchesUpToDate: Boolean(protection.required_status_checks?.strict),
      requiredApprovingReviewCount: Number(review.required_approving_review_count || 0),
      dismissStaleReviews: Boolean(review.dismiss_stale_reviews),
      requireCodeOwnerReviews: Boolean(review.require_code_owner_reviews),
      requireLastPushApproval: Boolean(review.require_last_push_approval),
      requiredConversationResolution: Boolean(protection.required_conversation_resolution?.enabled),
      enforceAdmins: Boolean(protection.enforce_admins?.enabled),
      allowForcePushes: Boolean(protection.allow_force_pushes?.enabled),
      allowDeletions: Boolean(protection.allow_deletions?.enabled)
    }
  };
}

async function readProtection(ctx, branch) {
  const response = await githubRequest({ ...ctx, method: "GET", apiPath: `/branches/${encodeURIComponent(branch)}/protection` });
  if (response.status === 404) return { protected: false, response };
  if (response.status !== 200) throw new Error(`GitHub GET branch protection returned ${response.status}: ${response.raw.slice(0, 1000)}`);
  return { protected: true, response };
}

async function applyProtection(ctx, branch, policy) {
  const response = await expectGithub(ctx, "PUT", `/branches/${encodeURIComponent(branch)}/protection`, protectionPayload(policy), [200]);
  appendLog("logs/github-governance.log", `branch_protection_applied repo=${ctx.repo.owner}/${ctx.repo.repo} branch=${branch}`);
  return response.body;
}

async function deleteProtection(ctx, branch) {
  const response = await githubRequest({ ...ctx, method: "DELETE", apiPath: `/branches/${encodeURIComponent(branch)}/protection` });
  if (![204, 404].includes(response.status)) {
    appendLog("logs/error.log", `branch_protection_cleanup_failed branch=${branch} status=${response.status} body=${JSON.stringify(response.body).slice(0, 500)}`);
  }
}

async function deleteBranch(ctx, branch) {
  const response = await githubRequest({ ...ctx, method: "DELETE", apiPath: `/git/refs/heads/${encodeURIComponent(branch)}` });
  if (![204, 404].includes(response.status)) {
    appendLog("logs/error.log", `branch_cleanup_failed branch=${branch} status=${response.status} body=${JSON.stringify(response.body).slice(0, 500)}`);
  }
}

function printResult(label, result) {
  console.log(`${label} ${JSON.stringify(result)}`);
}

async function checkBranch(ctx, policy, branch) {
  const current = await readProtection(ctx, branch);
  if (!current.protected) {
    const result = { ok: false, repo: `${ctx.repo.owner}/${ctx.repo.repo}`, branch, protected: false, blockers: ["branch_not_protected"] };
    printResult("BRANCH_PROTECTION_BLOCKED", result);
    appendLog("logs/github-governance.log", `branch_protection_blocked repo=${result.repo} branch=${branch} blockers=${JSON.stringify(result.blockers)}`);
    process.exitCode = 2;
    return result;
  }
  const status = protectionStatus({ policy, protection: current.response.body });
  const result = { ok: status.ok, repo: `${ctx.repo.owner}/${ctx.repo.repo}`, branch, protected: true, blockers: status.missing, observed: status.observed };
  printResult(status.ok ? "BRANCH_PROTECTION_OK" : "BRANCH_PROTECTION_BLOCKED", result);
  appendLog("logs/github-governance.log", `branch_protection_check repo=${result.repo} branch=${branch} ok=${result.ok} blockers=${JSON.stringify(result.blockers)}`);
  if (!status.ok) process.exitCode = 2;
  return result;
}

async function applyBranch(ctx, policy, branch) {
  if (process.env.AGENT_LOOP_GITHUB_APPLY_BRANCH_PROTECTION !== "1") {
    throw new Error("Set AGENT_LOOP_GITHUB_APPLY_BRANCH_PROTECTION=1 to apply branch protection.");
  }
  await applyProtection(ctx, branch, policy);
  return checkBranch(ctx, policy, branch);
}

async function verifyStaging(ctx, policy) {
  if (process.env.AGENT_LOOP_GITHUB_BRANCH_PROTECTION_STAGING !== "1") {
    throw new Error("Set AGENT_LOOP_GITHUB_BRANCH_PROTECTION_STAGING=1 to run live staging branch protection verification.");
  }
  const id = String(Date.now());
  const stagingBranch = `agent-loop-protection-${id}`;
  let created = false;
  try {
    const repoInfo = await expectGithub(ctx, "GET", "", undefined, [200]);
    const defaultBranch = repoInfo.body.default_branch || policy.branch || "main";
    const baseRef = await expectGithub(ctx, "GET", `/git/ref/heads/${encodeURIComponent(defaultBranch)}`, undefined, [200]);
    const sha = baseRef.body.object?.sha;
    if (!sha) throw new Error(`Could not resolve sha for ${defaultBranch}`);
    await expectGithub(ctx, "POST", "/git/refs", { ref: `refs/heads/${stagingBranch}`, sha }, [201]);
    created = true;
    await applyProtection(ctx, stagingBranch, policy);
    const check = await checkBranch(ctx, policy, stagingBranch);
    if (!check.ok) throw new Error(`Staging branch protection did not match policy: ${check.blockers.join(",")}`);
    console.log(`VERIFY_BRANCH_PROTECTION_STAGING_OK repo=${ctx.repo.owner}/${ctx.repo.repo} branch=${stagingBranch}`);
  } finally {
    if (created) {
      await deleteProtection(ctx, stagingBranch);
      await deleteBranch(ctx, stagingBranch);
    }
  }
}

try {
  const policy = readConfig();
  const repo = githubRepoConfig();
  const { token, source } = githubToken();
  if (!repo.owner || !repo.repo) throw new Error("GitHub repo is not configured.");
  if (!token) throw new Error("GitHub token is required for branch protection policy checks.");
  const ctx = { repo, token, tokenSource: source };
  const branch = branchArg || policy.branch || "main";
  if (action === "check") {
    await checkBranch(ctx, policy, branch);
  } else if (action === "apply") {
    await applyBranch(ctx, policy, branch);
  } else if (action === "verify-staging") {
    await verifyStaging(ctx, policy);
  } else {
    throw new Error(`Unsupported action: ${action}`);
  }
} catch (error) {
  appendLog("logs/error.log", `branch_protection_policy_failed action=${action} branch=${branchArg || "default"} error=${JSON.stringify(error.message)}`);
  console.error(`BRANCH_PROTECTION_POLICY_FAILED: ${error.message}`);
  process.exit(1);
}
