#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { appendLog, systemRoot, validateTaskId } from "../lib/common.mjs";
import { logToolCall } from "../lib/tool_logger.mjs";

const [taskId, target = "."] = process.argv.slice(2);
const resolvedTarget = path.resolve(process.cwd(), target);

function runNode(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: systemRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
}

function recordFailure(reason, { label, rootCause, fixPlan, nextChecks }) {
  return runNode("scripts/state/record_failure.mjs", [
    taskId,
    reason,
    `--label=${label}`,
    `--root-cause=${rootCause}`,
    `--fix-plan=${fixPlan}`,
    `--next-checks=${nextChecks}`
  ]);
}

try {
  validateTaskId(taskId);
  logToolCall({
    role: "gate",
    tool: "gate",
    operation: "safety_brake",
    target: taskId,
    result: "started"
  });
  const safety = runNode("scripts/gate/safety_brake.mjs", [taskId]);
  logToolCall({
    role: "gate",
    tool: "gate",
    operation: "safety_brake",
    target: taskId,
    result: safety.status === 0 ? "passed" : "blocked"
  });
  if (safety.status !== 0) {
    logToolCall({
      role: "gate",
      tool: "state",
      operation: "record_failure",
      target: taskId,
      result: "started"
    });
    recordFailure(`Safety brake blocked: ${safety.stdout || safety.stderr}`, {
      label: "safety_brake",
      rootCause: `Safety brake limit was reached: ${safety.stdout || safety.stderr}`,
      fixPlan: "Stop the current loop, inspect iteration/no-progress/budget counters, and reduce repeated work before any retry.",
      nextChecks: "Verify task is terminated or deliberately reset by an operator before resuming."
    });
    logToolCall({
      role: "gate",
      tool: "state",
      operation: "record_failure",
      target: taskId,
      result: "completed"
    });
    appendLog("logs/gate.log", `RUN_GATE_BLOCKED_BY_SAFETY task=${taskId}`);
    process.stdout.write(safety.stdout);
    process.stderr.write(safety.stderr);
    process.exit(2);
  }

  logToolCall({
    role: "gate",
    tool: "gate",
    operation: "skill_check",
    target: taskId,
    result: "started"
  });
  const skills = runNode("scripts/gate/skill_check.mjs", [taskId]);
  logToolCall({
    role: "gate",
    tool: "gate",
    operation: "skill_check",
    target: taskId,
    result: skills.status === 0 ? "passed" : "blocked"
  });
  if (skills.status !== 0) {
    recordFailure(`Skill check blocked: ${skills.stdout || skills.stderr}`, {
      label: "skill_check",
      rootCause: `Required Skill rule files are missing or invalid: ${skills.stdout || skills.stderr}`,
      fixPlan: "Restore the required Skill files or fix their format before rerunning any agent role.",
      nextChecks: "Rerun skill_check and confirm every required Skill path is readable."
    });
    appendLog("logs/gate.log", `RUN_GATE_BLOCKED_BY_SKILL_CHECK task=${taskId}`);
    process.stdout.write(skills.stdout);
    process.stderr.write(skills.stderr);
    process.exit(2);
  }

  logToolCall({
    role: "gate",
    tool: "gate",
    operation: "auto_check",
    target: resolvedTarget,
    result: "started"
  });
  const auto = runNode("scripts/gate/auto_check.mjs", [resolvedTarget]);
  logToolCall({
    role: "gate",
    tool: "gate",
    operation: "auto_check",
    target: resolvedTarget,
    result: auto.status === 0 ? "passed" : "blocked"
  });
  if (auto.status !== 0) {
    logToolCall({
      role: "gate",
      tool: "state",
      operation: "record_failure",
      target: taskId,
      result: "started"
    });
    recordFailure(`Auto check blocked: ${auto.stdout || auto.stderr}`, {
      label: "auto_check",
      rootCause: `Automated syntax/format gate failed: ${auto.stdout || auto.stderr}`,
      fixPlan: "Development Agent must inspect the auto_check output, fix the concrete syntax or format issue in the worktree, then rerun the gate.",
      nextChecks: "Rerun auto_check and inspect logs/gate.log for RUN_GATE_PASSED."
    });
    logToolCall({
      role: "gate",
      tool: "state",
      operation: "record_failure",
      target: taskId,
      result: "completed"
    });
    appendLog("logs/gate.log", `RUN_GATE_BLOCKED_BY_AUTO_CHECK task=${taskId}`);
    process.stdout.write(auto.stdout);
    process.stderr.write(auto.stderr);
    process.exit(2);
  }

  logToolCall({
    role: "gate",
    tool: "gate",
    operation: "acceptance_check",
    target: resolvedTarget,
    result: "started"
  });
  const acceptance = runNode("scripts/gate/acceptance_check.mjs", [taskId, resolvedTarget]);
  logToolCall({
    role: "gate",
    tool: "gate",
    operation: "acceptance_check",
    target: resolvedTarget,
    result: acceptance.status === 0 ? "passed" : "blocked"
  });
  if (acceptance.status !== 0) {
    recordFailure(`Acceptance check blocked: ${acceptance.stdout || acceptance.stderr}`, {
      label: "acceptance_check",
      rootCause: `Acceptance gate failed against task requirement: ${acceptance.stdout || acceptance.stderr}`,
      fixPlan: "Development Agent must update the artifact to satisfy the explicit acceptance criteria, not weaken the gate.",
      nextChecks: "Rerun acceptance_check and verify every acceptance criterion has evidence."
    });
    appendLog("logs/gate.log", `RUN_GATE_BLOCKED_BY_ACCEPTANCE task=${taskId}`);
    process.stdout.write(acceptance.stdout);
    process.stderr.write(acceptance.stderr);
    process.exit(2);
  }

  appendLog("logs/gate.log", `RUN_GATE_PASSED task=${taskId} target=${resolvedTarget}`);
  console.log("RUN_GATE_PASSED");
} catch (error) {
  appendLog("logs/gate.log", `RUN_GATE_ERROR task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`RUN_GATE_ERROR: ${error.message}`);
  process.exit(1);
}
