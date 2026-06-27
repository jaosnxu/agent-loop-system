#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { appendLog, ensureDir, systemRoot } from "../lib/common.mjs";

const approvalsPath = path.join(systemRoot, "queue/human-approvals.json");
const defaultOperatorsPath = "config/human-gate.operators.json";

function parseArgs(args) {
  const options = new Map();
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const [key, ...value] = arg.slice(2).split("=");
    options.set(key, value.length ? value.join("=") : "true");
  }
  return options;
}

function readApprovals() {
  ensureDir(path.dirname(approvalsPath));
  if (!fs.existsSync(approvalsPath)) return { version: "0.1.0", requests: [] };
  return JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function readJsonIfExists(filePath) {
  const full = path.isAbsolute(filePath) ? filePath : path.join(systemRoot, filePath);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function loadOperators({ operatorConfigPath, fallbackToken }) {
  const config = readJsonIfExists(operatorConfigPath);
  if (!config) {
    return [{
      id: "operator",
      displayName: "Local Operator",
      role: "approver",
      tokenHash: sha256(fallbackToken),
      source: "startup-token"
    }];
  }
  const operators = [];
  for (const operator of config.operators || []) {
    if (operator.disabled) continue;
    const token = operator.tokenEnv ? process.env[operator.tokenEnv] : "";
    const tokenHash = operator.tokenHash || (token ? sha256(token) : "");
    if (!operator.id || !tokenHash) continue;
    operators.push({
      id: operator.id,
      displayName: operator.displayName || operator.id,
      role: operator.role || "viewer",
      tokenHash: tokenHash.replace(/^sha256:/, ""),
      source: operator.tokenEnv ? `env:${operator.tokenEnv}` : "hash"
    });
  }
  return operators;
}

function canDecide(operator) {
  return ["approver", "admin"].includes(operator?.role);
}

function summarize(requests) {
  return requests.reduce((acc, request) => {
    acc.total += 1;
    acc[request.status || "unknown"] = (acc[request.status || "unknown"] || 0) + 1;
    return acc;
  }, { total: 0, pending: 0, approved: 0, rejected: 0 });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function short(value, max = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function renderRequestCard(request, tokenValue, operator) {
  const operation = `${request.tool || "unknown"}:${request.operation || "unknown"}`;
  const target = request.target || request.command || "";
  const pending = request.status === "pending";
  const actions = pending && canDecide(operator) ? `
      <form method="post" action="/approve">
        <input type="hidden" name="token" value="${escapeHtml(tokenValue)}">
        <input type="hidden" name="approvalId" value="${escapeHtml(request.approvalId)}">
        <input name="reason" value="approved from Human Gate UI" aria-label="Reason">
        <button class="approve" type="submit">Approve</button>
      </form>
      <form method="post" action="/reject">
        <input type="hidden" name="token" value="${escapeHtml(tokenValue)}">
        <input type="hidden" name="approvalId" value="${escapeHtml(request.approvalId)}">
        <input name="reason" value="rejected from Human Gate UI" aria-label="Reason">
        <button class="reject" type="submit">Reject</button>
      </form>` : pending ? `<p class="closed">Viewer role can inspect this request but cannot approve or reject it.</p>` : `<p class="closed">Resolved by ${escapeHtml(request.decidedBy || "unknown")} at ${escapeHtml(request.decidedAt || "unset")}</p>`;
  return `
    <article class="request status-${escapeHtml(request.status || "unknown")}">
      <header>
        <h2>${escapeHtml(request.approvalId)}</h2>
        <span>${escapeHtml(request.status || "unknown")}</span>
      </header>
      <dl>
        <div><dt>Task</dt><dd>${escapeHtml(request.taskId || "unbound")}</dd></div>
        <div><dt>Operation</dt><dd>${escapeHtml(operation)}</dd></div>
        <div><dt>Role</dt><dd>${escapeHtml(request.role || "unknown")}</dd></div>
        <div><dt>Requested</dt><dd>${escapeHtml(request.requestedAt || "unset")}</dd></div>
        <div><dt>Reason</dt><dd>${escapeHtml(request.reason || "")}</dd></div>
        <div><dt>Target</dt><dd title="${escapeHtml(target)}">${escapeHtml(short(target))}</dd></div>
      </dl>
      <div class="actions">${actions}</div>
    </article>`;
}

function renderPage(tokenValue, operator, notice = "") {
  const data = readApprovals();
  const requests = data.requests || [];
  const summary = summarize(requests);
  const cards = requests.length ? requests.map((request) => renderRequestCard(request, tokenValue, operator)).join("\n") : "<p class=\"empty\">No approval requests.</p>";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Human Gate Approval Queue</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #17202a; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { margin: 0 0 14px; font-size: 28px; letter-spacing: 0; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 12px; margin: 18px 0 24px; }
    .metric { background: #fff; border: 1px solid #d9dee7; border-radius: 8px; padding: 14px; }
    .metric strong { display: block; font-size: 24px; }
    .request { background: #fff; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; margin-bottom: 14px; }
    .request header { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .request h2 { font-size: 18px; margin: 0; overflow-wrap: anywhere; }
    .request header span { border: 1px solid #c8d0dc; border-radius: 999px; padding: 4px 10px; font-size: 13px; text-transform: uppercase; }
    .status-pending { border-left: 5px solid #b56b00; }
    .status-approved { border-left: 5px solid #1d7f43; }
    .status-rejected { border-left: 5px solid #b42318; }
    dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; }
    dt { color: #607086; font-size: 12px; text-transform: uppercase; }
    dd { margin: 2px 0 0; overflow-wrap: anywhere; }
    .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
    form { display: grid; grid-template-columns: minmax(90px, 1fr) minmax(160px, 2fr) auto; gap: 8px; }
    input { min-width: 0; border: 1px solid #c8d0dc; border-radius: 6px; padding: 8px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 8px 12px; font: inherit; color: #fff; cursor: pointer; }
    .approve { background: #176b3a; }
    .reject { background: #9f1f16; }
    .notice { background: #e9f3ff; border: 1px solid #bdd7ff; border-radius: 8px; padding: 10px 12px; margin: 10px 0; }
    .empty, .closed { color: #607086; }
    @media (max-width: 760px) {
      main { padding: 18px; }
      .summary, dl, .actions, form { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Human Gate Approval Queue</h1>
    ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ""}
    <p class="closed">Operator: ${escapeHtml(operator.displayName || operator.id)} (${escapeHtml(operator.role)})</p>
    <section class="summary" aria-label="Approval summary">
      <div class="metric"><strong>${summary.total}</strong><span>Total</span></div>
      <div class="metric"><strong>${summary.pending}</strong><span>Pending</span></div>
      <div class="metric"><strong>${summary.approved}</strong><span>Approved</span></div>
      <div class="metric"><strong>${summary.rejected}</strong><span>Rejected</span></div>
    </section>
    <section>${cards}</section>
  </main>
</body>
</html>`;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  response.end(body);
}

function redirect(response, tokenValue, notice) {
  response.writeHead(303, { Location: `/?token=${encodeURIComponent(tokenValue)}&notice=${encodeURIComponent(notice)}`, "Cache-Control": "no-store" });
  response.end();
}

function resolveApproval({ approvalId, decision, actor, reason }) {
  const result = spawnSync(process.execPath, ["scripts/human/resolve_approval.mjs", approvalId, decision, actor, reason], {
    cwd: systemRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  appendLog("logs/human-gate.log", `approval_ui_decision approval_id=${approvalId} decision=${decision} actor=${JSON.stringify(actor)} status=${result.status}`);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "approval resolution failed");
  return result.stdout.trim();
}

const options = parseArgs(process.argv.slice(2));
const host = options.get("host") || "127.0.0.1";
const port = Number(options.get("port") || 8787);
const token = options.get("token") || crypto.randomBytes(18).toString("hex");
const operatorConfigPath = options.get("operators") || process.env.HUMAN_GATE_OPERATORS_CONFIG || defaultOperatorsPath;
const operators = loadOperators({ operatorConfigPath, fallbackToken: token });

function tokenFromRequest(request, url, form = null) {
  return request.headers["x-human-gate-token"] ||
    url.searchParams.get("token") ||
    form?.get("token") ||
    "";
}

function authenticate(tokenValue) {
  if (!tokenValue) return null;
  const hash = sha256(tokenValue);
  return operators.find((operator) => operator.tokenHash === hash) || null;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
    if (request.method === "GET" && url.pathname === "/health") {
      send(response, 200, JSON.stringify({ ok: true, operators: operators.length }, null, 2), "application/json; charset=utf-8");
      return;
    }
    if (request.method === "GET" && url.pathname === "/") {
      const tokenValue = tokenFromRequest(request, url);
      const operator = authenticate(tokenValue);
      if (!operator) {
        send(response, 401, "Unauthorized: valid operator token required");
        return;
      }
      send(response, 200, renderPage(tokenValue, operator, url.searchParams.get("notice") || ""), "text/html; charset=utf-8");
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/approvals") {
      const operator = authenticate(tokenFromRequest(request, url));
      if (!operator) {
        send(response, 401, "Unauthorized: valid operator token required");
        return;
      }
      const data = readApprovals();
      send(response, 200, JSON.stringify({ ok: true, operator: { id: operator.id, role: operator.role }, summary: summarize(data.requests || []), requests: data.requests || [] }, null, 2), "application/json; charset=utf-8");
      return;
    }
    if (request.method === "POST" && ["/approve", "/reject"].includes(url.pathname)) {
      const form = new URLSearchParams(await readBody(request));
      const tokenValue = tokenFromRequest(request, url, form);
      const operator = authenticate(tokenValue);
      if (!operator) {
        send(response, 401, "Unauthorized: valid operator token required");
        return;
      }
      if (!canDecide(operator)) {
        appendLog("logs/human-gate.log", `approval_ui_forbidden operator=${operator.id} role=${operator.role} path=${url.pathname}`);
        send(response, 403, "Forbidden: operator lacks approval permission");
        return;
      }
      const approvalId = form.get("approvalId") || "";
      const actor = operator.id;
      const reason = form.get("reason") || `${url.pathname.slice(1)} from Human Gate UI`;
      const decision = url.pathname === "/approve" ? "approved" : "rejected";
      const result = resolveApproval({ approvalId, decision, actor, reason });
      redirect(response, tokenValue, result);
      return;
    }
    send(response, 404, "Not found");
  } catch (error) {
    appendLog("logs/human-gate.log", `approval_ui_error error=${JSON.stringify(error.message)}`);
    send(response, 500, `Human Gate UI error: ${error.message}`);
  }
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  appendLog("logs/human-gate.log", `approval_ui_started host=${host} port=${actualPort} operators=${operators.length} operator_config=${JSON.stringify(operatorConfigPath)}`);
  console.log(`HUMAN_GATE_UI_READY url=http://${host}:${actualPort} token=${token} operators=${operators.length} open_url=http://${host}:${actualPort}/?token=${token}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    appendLog("logs/human-gate.log", `approval_ui_stopped signal=${signal}`);
    server.close(() => process.exit(0));
  });
}
