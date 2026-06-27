import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, nowIso, systemRoot, validateTaskId } from "../lib/common.mjs";

function compact(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").slice(0, max);
}

function serializable(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

function ensureSection(text, title) {
  if (text.includes(`## ${title}`)) return text;
  return `${text.trimEnd()}\n\n## ${title}\n\n- None\n`;
}

function appendSectionItem(text, sectionTitle, item) {
  text = ensureSection(text, sectionTitle);
  const heading = `## ${sectionTitle}`;
  const idx = text.indexOf(heading);
  const nextHeading = text.indexOf("\n## ", idx + heading.length);
  const end = nextHeading === -1 ? text.length : nextHeading;
  const before = text.slice(0, end).replace(/\n- None\s*$/m, "");
  const after = text.slice(end);
  return `${before}\n- ${item}\n${after.startsWith("\n") ? after.slice(1) : after}`;
}

export function structuredEvidencePath(taskId) {
  validateTaskId(taskId);
  return path.join(systemRoot, "memory/evidence", `${taskId}.jsonl`);
}

export function buildStructuredEvidence(taskId, payload = {}) {
  validateTaskId(taskId);
  const createdAt = nowIso();
  const base = {
    schemaVersion: "structured-evidence/v1",
    evidenceId: "",
    taskId,
    type: compact(payload.type || "event", 80),
    actor: compact(payload.actor || "system", 80),
    action: compact(payload.action || "unspecified", 160),
    target: compact(payload.target || "", 500),
    result: compact(payload.result || "", 500),
    nextCheck: compact(payload.nextCheck || "", 500),
    details: serializable(payload.details || {}),
    createdAt
  };
  const idSource = JSON.stringify({ ...base, evidenceId: "" });
  const suffix = crypto.createHash("sha256").update(idSource).digest("hex").slice(0, 12);
  return { ...base, evidenceId: `ev-${createdAt.replace(/[^0-9A-Za-z]+/g, "")}-${suffix}` };
}

export function appendStructuredEvidenceToState(stateText, entry) {
  const item = [
    `${entry.createdAt}`,
    `id=${entry.evidenceId}`,
    `type=${entry.type}`,
    `actor=${entry.actor}`,
    `action=${JSON.stringify(entry.action)}`,
    `target=${JSON.stringify(entry.target)}`,
    `result=${JSON.stringify(entry.result)}`,
    `next_check=${JSON.stringify(entry.nextCheck)}`
  ].join(" ");
  return appendSectionItem(stateText, "Structured Evidence", item);
}

export function writeStructuredEvidenceJsonl(entry) {
  const target = structuredEvidencePath(entry.taskId);
  ensureDir(path.dirname(target));
  fs.appendFileSync(target, `${JSON.stringify(entry)}\n`);
  return target;
}

export function recordStructuredEvidence(taskId, payload, stateText) {
  const entry = buildStructuredEvidence(taskId, payload);
  const evidencePath = writeStructuredEvidenceJsonl(entry);
  const text = appendStructuredEvidenceToState(stateText, entry);
  return { text, entry, evidencePath };
}
