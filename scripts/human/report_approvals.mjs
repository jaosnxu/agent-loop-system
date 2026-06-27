#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureDir, systemRoot } from "../lib/common.mjs";

const [outArg = ""] = process.argv.slice(2);
const approvalsPath = path.join(systemRoot, "queue/human-approvals.json");
const outPath = outArg ? path.resolve(systemRoot, outArg) : "";
const data = fs.existsSync(approvalsPath) ? JSON.parse(fs.readFileSync(approvalsPath, "utf8")) : { version: "0.1.0", requests: [] };
const requests = data.requests || [];
const pending = requests.filter((request) => request.status === "pending");
const body = [
  "# Human Approval Report",
  "",
  `- Total Requests: ${requests.length}`,
  `- Pending Requests: ${pending.length}`,
  "",
  "| Approval ID | Task ID | Status | Operation | Role | Requested At | Target |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...requests.map((request) => `| ${request.approvalId} | ${request.taskId} | ${request.status} | ${request.tool}:${request.operation} | ${request.role} | ${request.requestedAt || "unset"} | ${String(request.target || request.command || "").replaceAll("|", "\\|")} |`),
  ""
].join("\n");

if (outPath) {
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, body);
}

console.log(body);
