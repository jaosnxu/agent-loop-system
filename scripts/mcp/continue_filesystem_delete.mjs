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
import { syncBoard } from "../state/sync_board_lib.mjs";

const [approvalId, ...rest] = process.argv.slice(2);
const approvalsPath = path.join(systemRoot, "queue/human-approvals.json");
const worktreesRoot = path.resolve(systemRoot, "..", "worktrees");

function usage() {
  console.error("Usage: node scripts/mcp/continue_filesystem_delete.mjs APPROVAL_ID [--mode=dry-run|live] [--live-approval-id=ID] [--confirm-live]");
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

function normalizeTarget(rawTarget = "") {
  if (!rawTarget || typeof rawTarget !== "string") return "";
  return path.resolve(path.isAbsolute(rawTarget) ? rawTarget : path.join(systemRoot, rawTarget));
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function nearestExistingPath(target) {
  let current = target;
  while (!fs.existsSync(current)) {
    const next = path.dirname(current);
    if (next === current) return "";
    current = next;
  }
  return current;
}

function safeRealTarget(target) {
  if (fs.existsSync(target)) return fs.realpathSync.native(target);
  const existing = nearestExistingPath(target);
  if (!existing) return target;
  const realExisting = fs.realpathSync.native(existing);
  const suffix = path.relative(existing, target);
  return suffix ? path.resolve(realExisting, suffix) : realExisting;
}

function inferTaskIdFromTarget(target) {
  const resolved = normalizeTarget(target);
  if (!resolved) return "unbound";
  const relative = path.relative(worktreesRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !relative) return "unbound";
  return relative.split(path.sep)[0] || "unbound";
}

function stateExists(taskId) {
  return taskId && taskId !== "unbound" && fs.existsSync(path.join(systemRoot, `states/state_${taskId}.md`));
}

function runNode(args, allowFailure = false) {
  const result = spawnSync(process.execPath, args, { cwd: systemRoot, encoding: "utf8", stdio: "pipe" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result;
}

function assertValidWorktree(taskId) {
  validateTaskId(taskId);
  const worktree = path.join(worktreesRoot, taskId);
  const result = spawnSync("git", ["-C", worktree, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout.trim() !== "true") {
    return [`invalid_worktree_${worktree}`];
  }
  const common = spawnSync("git", ["-C", worktree, "rev-parse", "--git-common-dir"], { encoding: "utf8" });
  const gitDir = spawnSync("git", ["-C", worktree, "rev-parse", "--git-dir"], { encoding: "utf8" });
  if (common.status !== 0 || gitDir.status !== 0 || common.stdout.trim() === gitDir.stdout.trim()) {
    return [`main_worktree_denied_${worktree}`];
  }
  return [];
}

function resolvePrimary(primary) {
  const command = parseCommand(primary.command);
  const targetCandidate = command.target || command.path || primary.target || primary.command || "";
  const target = normalizeTarget(targetCandidate);
  const taskId = command.taskId || primary.taskId || inferTaskIdFromTarget(target);
  return { command, targetCandidate, target, taskId };
}

function verifyPrimary(primary, resolved) {
  const failures = [];
  if (primary.status !== "approved") failures.push(`approval_status_${primary.status}`);
  if (primary.tool !== "filesystem") failures.push(`unexpected_tool_${primary.tool}`);
  if (primary.operation !== "delete") failures.push(`unexpected_operation_${primary.operation}`);
  if (!resolved.taskId || resolved.taskId === "unbound") failures.push("task_unbound");
  if (!resolved.target) failures.push("target_missing");
  if (resolved.taskId && resolved.taskId !== "unbound") {
    failures.push(...assertValidWorktree(resolved.taskId));
    const inferred = inferTaskIdFromTarget(resolved.target);
    if (inferred !== resolved.taskId) failures.push(`task_target_mismatch_${inferred || "unbound"}`);
    const worktree = path.join(worktreesRoot, resolved.taskId);
    if (!isWithin(worktree, resolved.target)) failures.push("target_outside_task_worktree");
    if (resolved.target === worktree) failures.push("target_is_worktree_root");
    if (fs.existsSync(worktree)) {
      const realWorktree = fs.realpathSync.native(worktree);
      const realTarget = safeRealTarget(resolved.target);
      if (!isWithin(realWorktree, realTarget)) failures.push("target_realpath_outside_task_worktree");
    }
  }
  return failures;
}

function recordState(taskId, summary, blockedReasons, stageWhenReady = "filesystem_delete_ready", nextAction = "Run live delete continuation only after the second human gate is approved.") {
  if (!stateExists(taskId)) return;
  validateTaskId(taskId);
  let text = readState(taskId);
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Evidence", `${nowIso()} filesystem_delete_continuation ${summary}`);
  if (blockedReasons.length) {
    text = appendSectionItem(text, "Failure Records", `${nowIso()} FILESYSTEM_DELETE_CONTINUATION_BLOCKED ${blockedReasons.join(", ")}`);
    text = replaceNextAction(text, "Resolve filesystem delete continuation blockers, then rerun scripts/mcp/continue_filesystem_delete.mjs.");
  } else {
    text = setField(text, "Current Stage", stageWhenReady);
    text = appendSectionItem(text, "Completed Steps", `${nowIso()} stage=${stageWhenReady} note=filesystem delete continuation requirement=${JSON.stringify(getField(text, "Requirement").slice(0, 120))} acceptance=${JSON.stringify(getField(text, "Acceptance").slice(0, 120))}`);
    text = replaceNextAction(text, nextAction);
  }
  writeState(taskId, text);
  syncBoard();
  runNode(["scripts/memory/sync_task_memory.mjs", taskId], true);
}

function findExistingLiveApproval(approvals, primaryApprovalId, taskId, target) {
  return (approvals.requests || []).find((request) => {
    if (request.status !== "pending" || request.tool !== "filesystem" || request.operation !== "delete:live") return false;
    const command = parseCommand(request.command);
    return request.taskId === taskId &&
      command.primaryApprovalId === primaryApprovalId &&
      normalizeTarget(command.target || request.target || "") === target;
  });
}

function createLiveApproval({ approvals, taskId, primaryApprovalId, target }) {
  const existing = findExistingLiveApproval(approvals, primaryApprovalId, taskId, target);
  if (existing) return existing.approvalId;
  const approvalId = `approval-live-delete-${Date.now()}`;
  approvals.requests.push({
    approvalId,
    taskId,
    status: "pending",
    role: "development",
    tool: "filesystem",
    operation: "delete:live",
    target,
    command: JSON.stringify({ taskId, primaryApprovalId, action: "delete", target }),
    reason: "live filesystem delete requires second human gate",
    requestedAt: new Date().toISOString()
  });
  writeApprovals(approvals);
  if (stateExists(taskId)) {
    runNode(["scripts/human/record_gate.mjs", taskId, "pending", `filesystem_delete_live:${approvalId}`, "filesystem-continuation", "live filesystem delete requires second human approval"], true);
  }
  appendLog("logs/human-gate.log", `filesystem_delete_live_approval_requested approval_id=${approvalId} primary=${primaryApprovalId} task=${taskId} target=${JSON.stringify(target)}`);
  return approvalId;
}

function verifyLiveApproval(approvals, liveApprovalId, primaryApprovalId, taskId, target) {
  const request = (approvals.requests || []).find((item) => item.approvalId === liveApprovalId);
  if (!request) throw new Error(`Live approval request not found: ${liveApprovalId}`);
  const command = parseCommand(request.command);
  const failures = [];
  if (request.status !== "approved") failures.push(`live_approval_status_${request.status}`);
  if (request.tool !== "filesystem") failures.push(`live_approval_tool_${request.tool}`);
  if (request.operation !== "delete:live") failures.push(`live_approval_operation_${request.operation}`);
  if (request.taskId !== taskId) failures.push("live_approval_task_mismatch");
  if (command.primaryApprovalId !== primaryApprovalId) failures.push("live_approval_primary_mismatch");
  if (command.action !== "delete") failures.push("live_approval_action_mismatch");
  if (normalizeTarget(command.target || request.target || "") !== target) failures.push("live_approval_target_mismatch");
  return failures;
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
  const resolved = resolvePrimary(primary);
  const blockedReasons = verifyPrimary(primary, resolved);
  const existsBefore = resolved.target ? fs.existsSync(resolved.target) : false;
  const summary = [
    `approval=${approvalId}`,
    `task=${resolved.taskId}`,
    `mode=${mode}`,
    `target=${JSON.stringify(resolved.target)}`,
    `exists=${existsBefore ? "true" : "false"}`,
    `decision=${blockedReasons.length ? "blocked" : "ready"}`
  ].join(" ");

  if (blockedReasons.length) {
    recordState(resolved.taskId, summary, blockedReasons);
    appendLog("logs/human-gate.log", `filesystem_delete_continuation_blocked ${summary} blockers=${JSON.stringify(blockedReasons)}`);
    appendLog("logs/tool-calls.log", `role=development tool=filesystem operation=delete target=${JSON.stringify(resolved.target)} result=blocked`);
    console.log(`FILESYSTEM_DELETE_CONTINUATION_BLOCKED ${summary} blockers=${blockedReasons.join(",")}`);
    process.exit(2);
  }

  if (mode === "dry-run") {
    recordState(resolved.taskId, summary, [], "filesystem_delete_dry_run_ready");
    appendLog("logs/human-gate.log", `filesystem_delete_continuation_dry_run ${summary}`);
    appendLog("logs/tool-calls.log", `role=development tool=filesystem operation=delete:dry-run target=${JSON.stringify(resolved.target)} result=passed`);
    console.log(`FILESYSTEM_DELETE_DRY_RUN ${summary}`);
    process.exit(0);
  }

  if (!liveApprovalId) {
    const created = createLiveApproval({ approvals, taskId: resolved.taskId, primaryApprovalId: approvalId, target: resolved.target });
    console.log(`PENDING_LIVE_HUMAN primary=${approvalId} live_approval=${created} task=${resolved.taskId} action=delete`);
    process.exit(90);
  }

  const liveFailures = verifyLiveApproval(approvals, liveApprovalId, approvalId, resolved.taskId, resolved.target);
  if (liveFailures.length) {
    recordState(resolved.taskId, `${summary} live_approval=${liveApprovalId}`, liveFailures);
    appendLog("logs/tool-calls.log", `role=development tool=filesystem operation=delete:live target=${JSON.stringify(resolved.target)} result=blocked`);
    console.log(`FILESYSTEM_DELETE_CONTINUATION_BLOCKED ${summary} blockers=${liveFailures.join(",")}`);
    process.exit(2);
  }
  if (!confirmLive) throw new Error("Live filesystem delete requires --confirm-live after second human approval.");

  const existed = fs.existsSync(resolved.target);
  if (existed) fs.rmSync(resolved.target, { recursive: true, force: true });
  const stillExists = fs.existsSync(resolved.target);
  const liveSummary = `${summary} live_approval=${liveApprovalId} deleted=${existed ? "true" : "false"} still_exists=${stillExists ? "true" : "false"}`;
  const liveBlockers = stillExists ? ["target_still_exists_after_delete"] : [];
  recordState(resolved.taskId, liveSummary, liveBlockers, "filesystem_delete_completed", "Continue the task from the post-delete checkpoint.");
  appendLog("logs/human-gate.log", `filesystem_delete_continuation_live ${liveSummary}`);
  appendLog("logs/tool-calls.log", `role=development tool=filesystem operation=delete:live target=${JSON.stringify(resolved.target)} result=${liveBlockers.length ? "failed" : "passed"}`);
  console.log(`${liveBlockers.length ? "FILESYSTEM_DELETE_LIVE_FAILED" : "FILESYSTEM_DELETE_LIVE_DONE"} ${liveSummary}`);
  process.exit(liveBlockers.length ? 2 : 0);
} catch (error) {
  appendLog("logs/error.log", `filesystem_delete_continuation_failed approval=${approvalId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`FILESYSTEM_DELETE_CONTINUATION_FAILED: ${error.message}`);
  process.exit(1);
}
