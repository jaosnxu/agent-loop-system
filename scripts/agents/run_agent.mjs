#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
    skills: ["skills/loop-engineering/SKILL.md", "skills/triage-agent/SKILL.md"]
  },
  development: {
    prompt: "prompts/agents/development-agent.md",
    skills: ["skills/loop-engineering/SKILL.md", "skills/development-agent/SKILL.md"]
  },
  prototyper: {
    prompt: "prompts/agents/prototyper.md",
    skills: ["skills/loop-engineering/SKILL.md", "skills/prototyper-agent/SKILL.md"]
  },
  tester: {
    prompt: "prompts/agents/tester.md",
    skills: ["skills/loop-engineering/SKILL.md", "skills/tester-agent/SKILL.md"]
  },
  review: {
    prompt: "prompts/agents/review-agent.md",
    skills: ["skills/loop-engineering/SKILL.md", "skills/review-agent/SKILL.md"]
  },
  scoring: {
    prompt: "prompts/agents/scoring-agent.md",
    skills: ["skills/loop-engineering/SKILL.md", "skills/scoring-agent/SKILL.md"]
  }
};

function readRequired(relativePath) {
  const full = path.join(systemRoot, relativePath);
  if (!fs.existsSync(full)) throw new Error(`Missing required file: ${relativePath}`);
  return fs.readFileSync(full, "utf8");
}

function fileEvidence(relativePath) {
  const content = readRequired(relativePath);
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");
  return `${relativePath}:bytes=${content.length}:sha256=${sha256}`;
}

try {
  if (!roleConfig[role]) throw new Error(`Unsupported role: ${role}`);
  validateTaskId(taskId);
  const state = readState(taskId);
  const config = roleConfig[role];
  const memoryFile = `memory/tasks/${taskId}.md`;
  const readFiles = [config.prompt, ...config.skills, ...(fs.existsSync(path.join(systemRoot, memoryFile)) ? [memoryFile] : [])];
  const fileChecks = readFiles.map(fileEvidence);
  const skillChecks = config.skills.map(fileEvidence);
  const requirement = getField(state, "Requirement");
  const acceptance = getField(state, "Acceptance");
  const type = getField(state, "Task Type");
  if (["prototype", "development"].includes(type) && (!requirement.trim() || !acceptance.trim())) {
    throw new Error(`Task spec incomplete for role=${role}`);
  }
  let text = state;
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Action Journal", `${nowIso()} actor=${role} action="read mandatory prompt and Skill files" target=${JSON.stringify(readFiles.join(","))} result=${JSON.stringify(fileChecks.join(","))} next_check="use these file checksums as role constraints before doing work"`);
  text = appendSectionItem(text, "Evidence", `${nowIso()} role=${role} read=${fileChecks.join(",")} skill_checks=${JSON.stringify(skillChecks)} requirement=${JSON.stringify(requirement.slice(0, 120))} acceptance=${JSON.stringify(acceptance.slice(0, 120))}`);
  writeState(taskId, text);
  syncBoard();
  appendLog("logs/orchestrator.log", `agent_role_ready role=${role} task=${taskId} files=${JSON.stringify(fileChecks)}`);
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
