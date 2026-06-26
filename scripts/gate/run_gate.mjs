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
    runNode("scripts/state/record_failure.mjs", [taskId, `Safety brake blocked: ${safety.stdout || safety.stderr}`]);
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
    runNode("scripts/state/record_failure.mjs", [taskId, `Skill check blocked: ${skills.stdout || skills.stderr}`]);
    appendLog("logs/gate.log", `RUN_GATE_BLOCKED_BY_SKILLS task=${taskId}`);
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
    runNode("scripts/state/record_failure.mjs", [taskId, `Auto check blocked: ${auto.stdout || auto.stderr}`]);
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
    runNode("scripts/state/record_failure.mjs", [taskId, `Acceptance check blocked: ${acceptance.stdout || acceptance.stderr}`]);
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
