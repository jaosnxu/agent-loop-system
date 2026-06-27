#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { appendLog, getField, nowIso, readState, setField, systemRoot, validateTaskId, writeState } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";
import { spawnSync } from "node:child_process";
import { recordStructuredEvidence } from "./structured_evidence_lib.mjs";

const [taskId, targetArg = "", label = "artifact"] = process.argv.slice(2);

function walk(target, out = []) {
  if (!fs.existsSync(target)) return out;
  const stat = fs.statSync(target);
  if (stat.isFile()) return [...out, target];
  for (const entry of fs.readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function hashTarget(target) {
  const resolved = path.resolve(target);
  const files = walk(resolved);
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(resolved, file));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return { hash: hash.digest("hex"), files: files.length, resolved };
}

function ensureSection(text, title) {
  if (text.includes(`## ${title}`)) return text;
  return `${text.trimEnd()}\n\n## ${title}\n\n- None\n`;
}

function appendItem(text, sectionTitle, item) {
  text = ensureSection(text, sectionTitle);
  const heading = `## ${sectionTitle}`;
  const idx = text.indexOf(heading);
  const nextHeading = text.indexOf("\n## ", idx + heading.length);
  const end = nextHeading === -1 ? text.length : nextHeading;
  const before = text.slice(0, end).replace(/\n- None\s*$/m, "");
  const after = text.slice(end);
  return `${before}\n- ${item}\n${after.startsWith("\n") ? after.slice(1) : after}`;
}

function lastHash(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...text.matchAll(new RegExp(`label=${escaped} .*?hash=([a-f0-9]{64})`, "g"))];
  return matches.length ? matches[matches.length - 1][1] : "";
}

try {
  validateTaskId(taskId);
  if (!targetArg) throw new Error("Missing artifact target.");
  const target = path.resolve(systemRoot, targetArg);
  if (!fs.existsSync(target)) throw new Error(`Artifact target not found: ${target}`);
  const result = hashTarget(target);
  let text = readState(taskId);
  const previous = lastHash(text, label);
  const unchanged = previous && previous === result.hash;
  const currentNoProgress = Number(getField(text, "No Progress Count") || 0);
  text = ensureSection(text, "Artifact Hashes");
  text = setField(text, "Updated At", nowIso());
  text = setField(text, "No Progress Count", String(unchanged ? currentNoProgress + 1 : 0));
  text = appendItem(text, "Artifact Hashes", `${nowIso()} label=${label} target=${JSON.stringify(result.resolved)} files=${result.files} hash=${result.hash} previous=${previous || "none"} status=${unchanged ? "unchanged" : "changed"}`);
  text = appendItem(text, "Action Journal", `${nowIso()} actor=state action="record artifact hash" target=${JSON.stringify(result.resolved)} result=${unchanged ? "unchanged" : "changed"} next_check="safety brake or heartbeat must act on repeated no-progress"`);
  text = recordStructuredEvidence(taskId, {
    type: "artifact_hash",
    actor: "state",
    action: "record_artifact_hash",
    target: result.resolved,
    result: unchanged ? "unchanged" : "changed",
    nextCheck: "safety brake or heartbeat must act on repeated no-progress",
    details: { label, files: result.files, hash: result.hash, previous: previous || "none" }
  }, text).text;
  writeState(taskId, text);
  syncBoard();
  spawnSync(process.execPath, ["scripts/memory/sync_task_memory.mjs", taskId], { cwd: systemRoot, encoding: "utf8" });
  appendLog("logs/state.log", `artifact_hash task=${taskId} label=${label} hash=${result.hash} status=${unchanged ? "unchanged" : "changed"}`);
  console.log(`ARTIFACT_HASH_RECORDED task=${taskId} status=${unchanged ? "unchanged" : "changed"} hash=${result.hash}`);
} catch (error) {
  appendLog("logs/state.log", `artifact_hash_failed task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`ARTIFACT_HASH_FAILED: ${error.message}`);
  process.exit(1);
}
