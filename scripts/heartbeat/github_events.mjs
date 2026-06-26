import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { systemRoot, appendLog } from "../lib/common.mjs";
import { addTask } from "../queue/queue_lib.mjs";
import { githubRepoConfig, githubToken } from "../lib/github_config.mjs";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(systemRoot, relativePath), "utf8"));
}

function fetchJson(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      headers: {
        "User-Agent": "agent-loop-system",
        "Accept": "application/vnd.github+json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub API ${res.statusCode}: ${body.slice(0, 200)}`));
        } else {
          resolve(JSON.parse(body));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function eventKey(kind, item) {
  return `github:${kind}:${item.id || item.number}`;
}

function labelsOf(item) {
  return (item.labels || []).map((label) => typeof label === "string" ? label : label.name).filter(Boolean);
}

function passesFilters(item, config) {
  const labels = labelsOf(item);
  if (config.issueLabels?.length && !config.issueLabels.some((label) => labels.includes(label))) return false;
  if (config.titleKeywords?.length && !config.titleKeywords.some((word) => item.title?.includes(word))) return false;
  return true;
}

export async function pollGitHubEvents() {
  const config = readJson("config/github-events.config.json");
  const processedPath = path.join(systemRoot, "queue/processed-events.json");
  const processed = fs.existsSync(processedPath) ? JSON.parse(fs.readFileSync(processedPath, "utf8")) : { version: "0.1.0", events: [] };
  const seen = new Set(processed.events);
  const created = [];
  let issues = [];
  let pullRequests = [];

  const repo = githubRepoConfig();
  const auth = githubToken();

  if (config.enabled && auth.token && repo.owner && repo.repo) {
    const base = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
    if (config.includeIssues) {
      issues = (await fetchJson(`${base}/issues?state=open&per_page=30`, auth.token)).filter((item) => !item.pull_request);
    }
    if (config.includePullRequests) {
      pullRequests = await fetchJson(`${base}/pulls?state=open&per_page=30`, auth.token);
    }
    appendLog("logs/heartbeat.log", `github_poll source=${repo.source} owner=${repo.owner} repo=${repo.repo}`);
  } else {
    const fixture = readJson(config.fixtureFile);
    issues = fixture.issues || [];
    pullRequests = fixture.pullRequests || [];
    appendLog("logs/heartbeat.log", `github_poll_fixture reason=missing_enabled_or_repo enabled=${config.enabled} repo_source=${repo.source} token_source=${auth.source}`);
  }

  for (const [kind, items] of [["issue", issues], ["pr", pullRequests]]) {
    for (const item of items) {
      if (!passesFilters(item, config)) continue;
      const key = eventKey(kind, item);
      if (seen.has(key)) continue;
      const taskId = `${kind}-${item.number}`;
      const result = addTask({
        taskId,
        title: item.title || `${kind} ${item.number}`,
        priority: kind === "pr" ? "P1" : "P2",
        dedupeKey: key,
        source: key,
        type: "example"
      });
      seen.add(key);
      processed.events.push(key);
      created.push({ key, taskId, added: result.added });
      appendLog("logs/heartbeat.log", `github_event_queued key=${key} task=${taskId} added=${result.added}`);
    }
  }

  fs.writeFileSync(processedPath, `${JSON.stringify(processed, null, 2)}\n`);
  return created;
}
