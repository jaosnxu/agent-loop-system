import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const systemRoot = path.resolve(scriptDir, "../..");

export function nowIso() {
  return new Date().toISOString();
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function appendLog(relativePath, message) {
  const target = path.join(systemRoot, relativePath);
  ensureDir(path.dirname(target));
  fs.appendFileSync(target, `[${nowIso()}] ${message}\n`);
}

export function readText(relativePath) {
  return fs.readFileSync(path.join(systemRoot, relativePath), "utf8");
}

export function writeText(relativePath, text) {
  const target = path.join(systemRoot, relativePath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, text);
}

export function statePath(taskId) {
  return `states/state_${taskId}.md`;
}

export function validateTaskId(taskId) {
  if (!taskId || !/^[A-Za-z0-9._-]+$/.test(taskId)) {
    throw new Error("Invalid task id. Use letters, numbers, dot, underscore, or hyphen only.");
  }
}

export function readState(taskId) {
  validateTaskId(taskId);
  const relative = statePath(taskId);
  const full = path.join(systemRoot, relative);
  if (!fs.existsSync(full)) {
    throw new Error(`State file not found: ${relative}`);
  }
  return fs.readFileSync(full, "utf8");
}

export function getField(stateText, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stateText.match(new RegExp(`^- ${escaped}: (.*)$`, "m"));
  return match ? match[1].trim() : "";
}

export function setField(stateText, field, value) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^- ${escaped}: .*$`, "m");
  if (!re.test(stateText)) {
    throw new Error(`Missing field in state file: ${field}`);
  }
  return stateText.replace(re, `- ${field}: ${value}`);
}

export function appendSectionItem(stateText, sectionTitle, item) {
  const heading = `## ${sectionTitle}`;
  const idx = stateText.indexOf(heading);
  if (idx === -1) {
    throw new Error(`Missing section: ${heading}`);
  }
  const nextHeading = stateText.indexOf("\n## ", idx + heading.length);
  const end = nextHeading === -1 ? stateText.length : nextHeading;
  const before = stateText.slice(0, end).replace(/\n- None\s*$/m, "");
  const after = stateText.slice(end);
  return `${before}\n- ${item}\n${after.startsWith("\n") ? after.slice(1) : after}`;
}

export function writeState(taskId, stateText) {
  validateTaskId(taskId);
  writeText(statePath(taskId), stateText);
}

export function replaceNextAction(stateText, action) {
  return stateText.replace(/## Next Action\n\n(?:- .*\n?)+/, `## Next Action\n\n- ${action}\n`);
}

export function replaceGateStatus(stateText, gateName, value) {
  const escaped = gateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^- ${escaped}: .*$`, "m");
  if (!re.test(stateText)) {
    throw new Error(`Missing gate status: ${gateName}`);
  }
  return stateText.replace(re, `- ${gateName}: ${value}`);
}
