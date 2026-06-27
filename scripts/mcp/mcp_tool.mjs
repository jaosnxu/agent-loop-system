#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { systemRoot, appendLog, ensureDir } from "../lib/common.mjs";
import { logError } from "../lib/error_logger.mjs";
import { githubRepoConfig, githubToken } from "../lib/github_config.mjs";
import { estimateTokensFromText, recordBudgetUsage } from "../state/budget_lib.mjs";

const mainRepoRoot = path.resolve(systemRoot, "..");
const worktreesRoot = path.resolve(systemRoot, "..", "worktrees");
const permissionConfig = JSON.parse(fs.readFileSync(path.join(systemRoot, "config/tool-permissions.json"), "utf8"));

function allowed(role, tool, operation) {
  const perms = permissionConfig.roles?.[role]?.[tool] || [];
  return perms.includes(operation) || perms.includes(`${tool}:${operation}`);
}

function isCritical(tool, operation) {
  return (permissionConfig.criticalOperationsRequireHumanGate || []).includes(`${tool}:${operation}`);
}

function taskIdFromTarget(target = "") {
  try {
    const parsed = JSON.parse(target);
    if (parsed.taskId) return parsed.taskId;
  } catch {}
  const resolved = path.resolve(target || systemRoot);
  if (resolved.startsWith(worktreesRoot)) {
    const relative = path.relative(worktreesRoot, resolved);
    return relative.split(path.sep)[0] || "unbound";
  }
  return "unbound";
}

function requestApproval({ role, tool, operation, target, command }) {
  const approvalsPath = path.join(systemRoot, "queue/human-approvals.json");
  ensureDir(path.dirname(approvalsPath));
  const approvals = fs.existsSync(approvalsPath) ? JSON.parse(fs.readFileSync(approvalsPath, "utf8")) : { version: "0.1.0", requests: [] };
  const approvalId = `approval-${Date.now()}`;
  let taskId = taskIdFromTarget(command || "");
  if (taskId === "unbound") taskId = taskIdFromTarget(target || "");
  const request = {
    approvalId,
    taskId,
    status: "pending",
    role,
    tool,
    operation,
    target: target || "",
    command: command || "",
    reason: "critical operation requires human gate",
    requestedAt: new Date().toISOString()
  };
  approvals.requests.push(request);
  fs.writeFileSync(approvalsPath, `${JSON.stringify(approvals, null, 2)}\n`);
  appendLog("logs/human-gate.log", `approval_requested approval_id=${approvalId} task=${taskId} role=${role} operation=${tool}:${operation} target=${JSON.stringify(target || command || "")}`);
  return request;
}

function assertReadonlyCommand(command) {
  const blocked = /(^|[;&|]\s*)(rm|mv|cp|touch|mkdir|rmdir|chmod|chown|git\s+(commit|push|merge|reset|checkout|branch\s+-D)|npm\s+install|pnpm\s+install|yarn\s+add|curl\s+.*\|\s*sh)\b/;
  if (blocked.test(command)) {
    throw new Error(`Readonly shell blocked command: ${command}`);
  }
}

function inAllowedPath(target) {
  const resolved = path.resolve(target);
  return resolved.startsWith(worktreesRoot) || resolved.startsWith(mainRepoRoot);
}

function assertWorktreeWrite(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(worktreesRoot)) return;
  const relative = path.relative(worktreesRoot, resolved);
  const taskId = relative.split(path.sep)[0];
  const worktree = path.join(worktreesRoot, taskId);
  const result = spawnSync("git", ["-C", worktree, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout.trim() !== "true") {
    throw new Error(`Write target is not a valid git worktree: ${worktree}`);
  }
  const common = spawnSync("git", ["-C", worktree, "rev-parse", "--git-common-dir"], { encoding: "utf8" });
  const gitDir = spawnSync("git", ["-C", worktree, "rev-parse", "--git-dir"], { encoding: "utf8" });
  if (common.status !== 0 || gitDir.status !== 0 || common.stdout.trim() === gitDir.stdout.trim()) {
    throw new Error(`Write target appears to be main worktree: ${worktree}`);
  }
}

function log(role, tool, operation, target, result) {
  appendLog("logs/tool-calls.log", `role=${role} tool=${tool} operation=${operation} target=${JSON.stringify(target)} result=${result}`);
}

function taskIdForUsage(target, command) {
  let taskId = taskIdFromTarget(command || "");
  if (taskId === "unbound") taskId = taskIdFromTarget(target || "");
  return taskId;
}

function recordUsage({ role, tool, operation, target, content, command, result, resultPayload }) {
  const taskId = taskIdForUsage(target, command);
  const tokenEstimate = estimateTokensFromText({ target, content, command, resultPayload });
  return recordBudgetUsage({
    taskId,
    source: "mcp_tool",
    actor: role,
    tool,
    operation,
    target: target || command || "",
    result,
    tokenEstimate,
    toolCalls: 1,
    details: { contentBytes: String(content || "").length, commandBytes: String(command || "").length }
  });
}

function completeTool({ role, tool, operation, target, content, command, result, resultPayload }) {
  log(role, tool, operation, target || command, result);
  recordUsage({ role, tool, operation, target, content, command, result, resultPayload });
}

export async function callTool({ role, tool, operation, target, content, command }) {
  try {
    if (isCritical(tool, operation)) {
      const approval = requestApproval({ role, tool, operation, target, command });
      throw new Error(`HUMAN_GATE_REQUIRED approval_id=${approval.approvalId} tool=${tool} operation=${operation}`);
    }
    if (!allowed(role, tool, operation)) {
      throw new Error(`Permission denied role=${role} tool=${tool} operation=${operation}`);
    }
    if (tool === "filesystem") {
      if (!inAllowedPath(target)) throw new Error(`Path denied: ${target}`);
      if (operation === "read") {
        const text = fs.readFileSync(target, "utf8");
        completeTool({ role, tool, operation, target, content, command, result: "passed", resultPayload: text });
        return { ok: true, text };
      }
      if (operation === "write") {
        assertWorktreeWrite(target);
        ensureDir(path.dirname(target));
        fs.writeFileSync(target, content || "");
        completeTool({ role, tool, operation, target, content, command, result: "passed", resultPayload: { bytes: String(content || "").length } });
        return { ok: true };
      }
    }
    if (tool === "shell" && operation === "execute") {
      const out = spawnSync("/bin/zsh", ["-lc", command], { cwd: target || systemRoot, encoding: "utf8" });
      completeTool({ role, tool, operation, target, content, command, result: out.status === 0 ? "passed" : "failed", resultPayload: { stdout: out.stdout, stderr: out.stderr, status: out.status } });
      return { ok: out.status === 0, status: out.status, stdout: out.stdout, stderr: out.stderr };
    }
    if (tool === "shell" && operation === "execute_readonly") {
      assertReadonlyCommand(command || target);
      const out = spawnSync("/bin/zsh", ["-lc", command || target], { cwd: target && command ? target : systemRoot, encoding: "utf8" });
      completeTool({ role, tool, operation, target, content, command: command || target, result: out.status === 0 ? "passed" : "failed", resultPayload: { stdout: out.stdout, stderr: out.stderr, status: out.status } });
      return { ok: out.status === 0, status: out.status, stdout: out.stdout, stderr: out.stderr };
    }
    if (tool === "browser" && operation === "test") {
      let reportPath = content || "";
      let requirePlaywright = false;
      if (content?.trim().startsWith("{")) {
        const payload = JSON.parse(content);
        reportPath = payload.reportPath || "";
        requirePlaywright = payload.requirePlaywright === true;
      }
      const args = ["scripts/mcp/browser_test.mjs", target, reportPath, ...(requirePlaywright ? ["--require-playwright"] : [])];
      const out = spawnSync(process.execPath, args, { cwd: systemRoot, encoding: "utf8" });
      completeTool({ role, tool, operation, target, content, command, result: out.status === 0 ? "passed" : "failed", resultPayload: { stdout: out.stdout, stderr: out.stderr, status: out.status } });
      return { ok: out.status === 0, status: out.status, stdout: out.stdout, stderr: out.stderr };
    }
    if (tool === "github" && operation.endsWith(":read")) {
      const { token, source } = githubToken();
      const repo = githubRepoConfig();
      const url = target || (repo.owner && repo.repo ? `https://api.github.com/repos/${repo.owner}/${repo.repo}` : "https://api.github.com/rate_limit");
      const data = await new Promise((resolve, reject) => {
        const req = https.request(url, { headers: { "User-Agent": "agent-loop-system", ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, (res) => {
          let body = "";
          res.on("data", (chunk) => body += chunk);
          res.on("end", () => resolve({ status: res.statusCode, authSource: source, repo, body: body.slice(0, 500), bodyText: body }));
        });
        req.on("error", reject);
        req.end();
      });
      const ok = data.status >= 200 && data.status < 400;
      completeTool({ role, tool, operation, target: url, content, command, result: ok ? "passed" : `failed_http_${data.status}`, resultPayload: data.bodyText || data.body });
      return { ok, data };
    }
    throw new Error(`Unsupported tool operation ${tool}:${operation}`);
  } catch (error) {
    completeTool({ role, tool, operation, target, content, command, result: "blocked", resultPayload: error.message });
    logError("ERROR", "mcp_tool", error, { role, tool, operation, target, command });
    return { ok: false, error: error.message };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [role, tool, operation, target = "", payload = ""] = process.argv.slice(2);
  const result = await callTool({ role, tool, operation, target, content: payload, command: payload || target });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}
