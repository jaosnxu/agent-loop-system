import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { appendLog, ensureDir, systemRoot } from "../lib/common.mjs";
import { addTask } from "../queue/queue_lib.mjs";
import { pollGitHubEvents } from "./github_events.mjs";

const processedPath = path.join(systemRoot, "queue/processed-events.json");

function readJson(relativePath, fallback = null) {
  const full = path.isAbsolute(relativePath) ? relativePath : path.join(systemRoot, relativePath);
  if (!fs.existsSync(full)) {
    if (fallback !== null) return fallback;
    throw new Error(`Missing JSON file: ${relativePath}`);
  }
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function fetchJson(urlString, headers = {}, timeoutMs = 10000) {
  const url = new URL(urlString);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Unsupported source protocol: ${url.protocol}`);
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "agent-loop-system",
        ...headers
      },
      timeout: Number(timeoutMs)
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => body += chunk);
      response.on("end", () => {
        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          reject(new Error(`HTTP source ${response.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        resolve(JSON.parse(body || "{}"));
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error(`HTTP source timeout after ${timeoutMs}ms`));
    });
    request.on("error", reject);
    request.end();
  });
}

function readProcessed() {
  ensureDir(path.dirname(processedPath));
  if (!fs.existsSync(processedPath)) return { version: "0.1.0", events: [] };
  return JSON.parse(fs.readFileSync(processedPath, "utf8"));
}

function writeProcessed(processed) {
  ensureDir(path.dirname(processedPath));
  fs.writeFileSync(processedPath, `${JSON.stringify(processed, null, 2)}\n`);
}

function labelsOf(item) {
  return (item.labels || []).map((label) => typeof label === "string" ? label : label.name).filter(Boolean);
}

function passesFilters(item, source) {
  const filters = source.filters || {};
  const labels = labelsOf(item);
  if (filters.labels?.length && !filters.labels.some((label) => labels.includes(label))) return false;
  if (filters.titleKeywords?.length && !filters.titleKeywords.some((word) => item.title?.includes(word))) return false;
  return true;
}

function safeTaskPart(value) {
  return String(value || "event")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "event";
}

function eventKey(source, event) {
  return `${source.id}:${event.kind || "event"}:${event.id || event.number || event.title}`;
}

function taskFromEvent(source, event) {
  const kind = safeTaskPart(event.kind || source.id);
  const id = safeTaskPart(event.taskId || event.number || event.id || event.title);
  return {
    taskId: event.taskId || `${kind}-${id}`,
    title: event.title || `${source.id} ${event.kind || "event"}`,
    priority: event.priority || source.defaultPriority || "P2",
    type: event.type || source.defaultType || "example",
    prd: event.prd || "",
    scope: event.scope || `heartbeat source ${source.id}`,
    requirement: event.requirement || `Process heartbeat event ${eventKey(source, event)}.`,
    acceptance: event.acceptance || "The task preserves source, requirement, acceptance, and dedupe evidence.",
    dedupeKey: event.dedupeKey || `heartbeat:${eventKey(source, event)}`,
    source: `heartbeat:${source.id}`
  };
}

function valueAtPath(payload, dotPath = "events") {
  if (!dotPath) return payload;
  return dotPath.split(".").reduce((value, key) => value?.[key], payload);
}

function headersForSource(source) {
  const headers = { ...(source.headers || {}) };
  for (const [header, envName] of Object.entries(source.headersEnv || {})) {
    if (process.env[envName]) headers[header] = process.env[envName];
  }
  return headers;
}

function normalizeEvents(payload, source) {
  const selected = Array.isArray(payload) ? payload : valueAtPath(payload, source.eventsPath || "events");
  if (!Array.isArray(selected)) throw new Error(`Source ${source.id} did not return an events array`);
  return selected;
}

async function queueEvents(source, events, sourceType) {
  const processed = readProcessed();
  const seen = new Set(processed.events || []);
  const created = [];
  for (const event of events) {
    if (!passesFilters(event, source)) continue;
    const task = taskFromEvent(source, event);
    if (seen.has(task.dedupeKey)) continue;
    const result = addTask(task);
    seen.add(task.dedupeKey);
    processed.events.push(task.dedupeKey);
    created.push({ key: task.dedupeKey, taskId: task.taskId, added: result.added, sourceId: source.id, type: sourceType });
    appendLog("logs/heartbeat.log", `heartbeat_source_event_queued source=${source.id} type=${sourceType} key=${task.dedupeKey} task=${task.taskId} added=${result.added}`);
  }
  writeProcessed(processed);
  return created;
}

async function pollFixtureSource(source) {
  const fixture = readJson(source.fixtureFile);
  return queueEvents(source, normalizeEvents(fixture, source), "fixture");
}

async function pollHttpJsonSource(source) {
  if (!source.url) throw new Error(`HTTP JSON source missing url: ${source.id}`);
  const payload = await fetchJson(source.url, headersForSource(source), source.timeoutMs || 10000);
  return queueEvents(source, normalizeEvents(payload, source), "http-json");
}

function sourceConfigPath() {
  return process.env.HEARTBEAT_SOURCES_CONFIG || "config/heartbeat.sources.json";
}

export async function pollHeartbeatSources() {
  const registryPath = sourceConfigPath();
  const registry = readJson(registryPath, { version: "0.1.0", sources: [{ id: "github", type: "github", enabled: true, configFile: "config/github-events.config.json" }] });
  const created = [];
  for (const source of registry.sources || []) {
    if (source.enabled === false) {
      appendLog("logs/heartbeat.log", `heartbeat_source_skipped source=${source.id} type=${source.type} reason=disabled`);
      continue;
    }
    if (!source.id || !source.type) {
      appendLog("logs/heartbeat.log", `heartbeat_source_skipped source=${source.id || "unset"} type=${source.type || "unset"} reason=missing_id_or_type`);
      continue;
    }
    if (source.type === "github") {
      const results = await pollGitHubEvents(source.configFile || "config/github-events.config.json");
      for (const result of results) created.push({ ...result, sourceId: source.id, type: "github" });
      appendLog("logs/heartbeat.log", `heartbeat_source_polled source=${source.id} type=github created=${results.length}`);
      continue;
    }
    if (source.type === "fixture") {
      const results = await pollFixtureSource(source);
      created.push(...results);
      appendLog("logs/heartbeat.log", `heartbeat_source_polled source=${source.id} type=fixture created=${results.length}`);
      continue;
    }
    if (source.type === "http-json") {
      const results = await pollHttpJsonSource(source);
      created.push(...results);
      appendLog("logs/heartbeat.log", `heartbeat_source_polled source=${source.id} type=http-json created=${results.length}`);
      continue;
    }
    appendLog("logs/heartbeat.log", `heartbeat_source_skipped source=${source.id} type=${source.type} reason=unsupported`);
  }
  appendLog("logs/heartbeat.log", `heartbeat_sources_done registry=${registryPath} created=${created.length}`);
  return created;
}
