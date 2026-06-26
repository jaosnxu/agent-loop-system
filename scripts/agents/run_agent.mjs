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
  setField,
  systemRoot,
  validateTaskId,
  writeState
} from "../lib/common.mjs";
import { syncBoard } from "../state/sync_board_lib.mjs";

const [role, taskId] = process.argv.slice(2);

const roleConfig = {
  triage: {
    prompt: "prompts/agents/triage-agent.md",
    skills: ["SKILLS/loop-engineering.md", "SKILLS/agent-roles.md", "SKILLS/triage-rules.md"]
  },
  development: {
    prompt: "prompts/agents/development-agent.md",
    skills: ["SKILLS/loop-engineering.md", "SKILLS/agent-roles.md", "SKILLS/code-standard.md", "SKILLS/forbidden-list.md"]
  },
  prototyper: {
    prompt: "prompts/agents/prototyper.md",
    skills: ["SKILLS/loop-engineering.md", "SKILLS/agent-roles.md", "SKILLS/design-standard.md", "SKILLS/forbidden-list.md"]
  },
  tester: {
    prompt: "prompts/agents/tester.md",
    skills: ["SKILLS/loop-engineering.md", "SKILLS/agent-roles.md", "SKILLS/design-standard.md"]
  },
  review: {
    prompt: "prompts/agents/review-agent.md",
    skills: ["SKILLS/loop-engineering.md", "SKILLS/agent-roles.md", "SKILLS/review-standard.md", "SKILLS/forbidden-list.md"]
  },
  scoring: {
    prompt: "prompts/agents/scoring-agent.md",
    skills: ["SKILLS/loop-engineering.md", "SKILLS/agent-roles.md", "SKILLS/review-standard.md", "SKILLS/triage-rules.md", "SKILLS/forbidden-list.md"]
  }
};

function readRequired(relativePath) {
  const full = path.join(systemRoot, relativePath);
  if (!fs.existsSync(full)) throw new Error(`Missing required file: ${relativePath}`);
  return fs.readFileSync(full, "utf8");
}

try {
  if (!roleConfig[role]) throw new Error(`Unsupported role: ${role}`);
  validateTaskId(taskId);
  const state = readState(taskId);
  const config = roleConfig[role];
  const readFiles = [config.prompt, ...config.skills];
  const sizes = readFiles.map((file) => `${file}:${readRequired(file).length}`);
  const requirement = getField(state, "Requirement");
  const acceptance = getField(state, "Acceptance");
  const type = getField(state, "Task Type");
  if (["prototype", "development"].includes(type) && (!requirement.trim() || !acceptance.trim())) {
    throw new Error(`Task spec incomplete for role=${role}`);
  }
  let text = state;
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Action Journal", `${nowIso()} actor=${role} action="read mandatory prompt and Skill files" target=${JSON.stringify(readFiles.join(","))} result=${JSON.stringify(sizes.join(","))} next_check="use these files as role constraints before doing work"`);
  text = appendSectionItem(text, "Evidence", `${nowIso()} role=${role} read=${sizes.join(",")} requirement=${JSON.stringify(requirement.slice(0, 120))} acceptance=${JSON.stringify(acceptance.slice(0, 120))}`);
  writeState(taskId, text);
  syncBoard();
  appendLog("logs/orchestrator.log", `agent_role_ready role=${role} task=${taskId} files=${JSON.stringify(sizes)}`);
  const delegate = spawnSync(process.execPath, ["scripts/agents/codex_delegate.mjs", role, taskId, config.prompt], { cwd: systemRoot, encoding: "utf8" });
  appendLog("logs/orchestrator.log", `agent_codex_delegate role=${role} task=${taskId} status=${delegate.status}`);
  if (delegate.status !== 0) {
    throw new Error(delegate.stderr || delegate.stdout || `Codex delegate failed for role=${role}`);
  }
  console.log(`AGENT_READY role=${role} task=${taskId}`);
} catch (error) {
  appendLog("logs/error.log", `agent_role_failed role=${role || "unset"} task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`AGENT_FAILED: ${error.message}`);
  process.exit(1);
}
