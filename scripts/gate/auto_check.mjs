#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { appendLog, systemRoot } from "../lib/common.mjs";

const targetArg = process.argv[2] || ".";
const target = path.resolve(process.cwd(), targetArg);
const failures = [];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "build", ".next"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

try {
  if (!fs.existsSync(target)) {
    throw new Error(`Target path not found: ${target}`);
  }

  const files = walk(target);
  const jsFiles = files.filter((file) => /\.(mjs|js|cjs)$/.test(file));
  const jsonFiles = files.filter((file) => /\.json$/.test(file));

  for (const file of jsFiles) {
    const result = run(process.execPath, ["--check", file], systemRoot);
    if (result.status !== 0) failures.push(`${file}: ${result.stderr || result.stdout}`);
  }

  for (const file of jsonFiles) {
    try {
      JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      failures.push(`${file}: invalid JSON: ${error.message}`);
    }
  }

  const badWhitespace = files.filter((file) => {
    if (!/\.(md|mjs|js|json|sh)$/.test(file)) return false;
    const text = fs.readFileSync(file, "utf8");
    return text.split("\n").some((line) => /[ \t]+$/.test(line));
  });
  if (badWhitespace.length) {
    failures.push(`Trailing whitespace found in: ${badWhitespace.join(", ")}`);
  }

  if (failures.length) {
    appendLog("logs/gate.log", `AUTO_CHECK_BLOCKED target=${target} failures=${JSON.stringify(failures)}`);
    console.log("GATE_BLOCKED");
    for (const failure of failures) console.log(`- ${failure}`);
    process.exit(2);
  }

  appendLog("logs/gate.log", `AUTO_CHECK_PASSED target=${target}`);
  console.log("GATE_PASSED");
} catch (error) {
  appendLog("logs/gate.log", `AUTO_CHECK_ERROR target=${target} error=${JSON.stringify(error.message)}`);
  console.error(`GATE_ERROR: ${error.message}`);
  process.exit(1);
}
