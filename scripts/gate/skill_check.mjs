#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { appendLog, systemRoot, validateTaskId } from "../lib/common.mjs";

const [taskId] = process.argv.slice(2);

const requiredFiles = [
  "skills/loop-engineering/SKILL.md",
  "skills/triage-agent/SKILL.md",
  "skills/development-agent/SKILL.md",
  "skills/prototyper-agent/SKILL.md",
  "skills/tester-agent/SKILL.md",
  "skills/review-agent/SKILL.md",
  "skills/scoring-agent/SKILL.md"
];

try {
  validateTaskId(taskId);
  const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(systemRoot, file)));
  if (missing.length) {
    appendLog("logs/gate.log", `SKILL_CHECK_BLOCKED task=${taskId} missing=${JSON.stringify(missing)}`);
    console.log("SKILL_CHECK_BLOCKED");
    for (const file of missing) console.log(`- missing ${file}`);
    process.exit(2);
  }
  appendLog("logs/gate.log", `SKILL_CHECK_PASSED task=${taskId} files=${requiredFiles.length}`);
  console.log("SKILL_CHECK_PASSED");
} catch (error) {
  appendLog("logs/gate.log", `SKILL_CHECK_ERROR task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`SKILL_CHECK_ERROR: ${error.message}`);
  process.exit(1);
}
