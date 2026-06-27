#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { appendLog, ensureDir, systemRoot, validateTaskId } from "../lib/common.mjs";

const [approvalId, decision, actor = process.env.USER || "unknown", reason = "human decision"] = process.argv.slice(2);
const approvalsPath = path.join(systemRoot, "queue/human-approvals.json");

function usage() {
  console.error("Usage: node scripts/human/resolve_approval.mjs APPROVAL_ID approved|rejected [actor] [reason]");
  process.exit(64);
}

function run(script, args, allowFailure = false) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: systemRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${script} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function runShell(command, args, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd: systemRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function readApprovals() {
  if (!fs.existsSync(approvalsPath)) {
    throw new Error("Approval queue not found: queue/human-approvals.json");
  }
  return JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
}

function stateExists(taskId) {
  return taskId && taskId !== "unbound" && fs.existsSync(path.join(systemRoot, `states/state_${taskId}.md`));
}

try {
  if (!approvalId || !["approved", "rejected"].includes(decision)) usage();

  ensureDir(path.dirname(approvalsPath));
  const approvals = readApprovals();
  const requests = approvals.requests || [];
  const request = requests.find((item) => item.approvalId === approvalId);
  if (!request) throw new Error(`Approval request not found: ${approvalId}`);
  if (request.status !== "pending") throw new Error(`Approval request is not pending: ${approvalId} status=${request.status}`);

  request.status = decision;
  request.decidedAt = new Date().toISOString();
  request.decidedBy = actor;
  request.decisionReason = reason;
  fs.writeFileSync(approvalsPath, `${JSON.stringify(approvals, null, 2)}\n`);

  const operation = `approval_request:${approvalId}:${request.tool}:${request.operation}`;
  if (stateExists(request.taskId)) {
    validateTaskId(request.taskId);
    run("scripts/human/record_gate.mjs", [request.taskId, decision, operation, actor, reason]);
    if (decision === "approved") {
      run("scripts/state/update_stage.mjs", [request.taskId, "human_approved", `approval ${approvalId} approved; await explicit continuation`]);
      run("scripts/state/record_action.mjs", [
        request.taskId,
        "human-gate",
        "approval request approved",
        approvalId,
        `${request.tool}:${request.operation}`,
        "run the operation-specific continuation script"
      ], true);
    } else {
      run("scripts/state/terminate_task.mjs", [request.taskId, `approval ${approvalId} rejected: ${reason}`]);
      runShell("scripts/worktree/clean_worktree.sh", [request.taskId], true);
    }
  }

  appendLog("logs/human-gate.log", `approval_resolved approval_id=${approvalId} task=${request.taskId} decision=${decision} actor=${JSON.stringify(actor)} reason=${JSON.stringify(reason)}`);
  console.log(`APPROVAL_RESOLVED approval=${approvalId} task=${request.taskId} decision=${decision}`);
} catch (error) {
  appendLog("logs/human-gate.log", `approval_resolve_failed approval_id=${approvalId || "unset"} decision=${decision || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`APPROVAL_RESOLVE_FAILED: ${error.message}`);
  process.exit(1);
}
