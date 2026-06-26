import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { systemRoot } from "./common.mjs";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    result[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return result;
}

function repoFromRemote() {
  const repoRoot = path.resolve(systemRoot, "..");
  const result = spawnSync("git", ["-C", repoRoot, "remote", "get-url", "origin"], { encoding: "utf8" });
  if (result.status !== 0) return { owner: "", repo: "", source: "none" };
  const url = result.stdout.trim();
  const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (!match) return { owner: "", repo: "", source: "none" };
  return { owner: match[1], repo: match[2], source: "git_remote" };
}

export function githubRepoConfig() {
  if (process.env.GITHUB_OWNER && process.env.GITHUB_REPO) {
    return { owner: process.env.GITHUB_OWNER, repo: process.env.GITHUB_REPO, source: "env" };
  }

  const localEnv = parseEnvFile(path.join(systemRoot, "config/github.local.env"));
  if (localEnv.GITHUB_OWNER && localEnv.GITHUB_REPO) {
    return { owner: localEnv.GITHUB_OWNER, repo: localEnv.GITHUB_REPO, source: "local_env" };
  }

  return repoFromRemote();
}

export function githubToken() {
  if (process.env.GITHUB_TOKEN) return { token: process.env.GITHUB_TOKEN, source: "env" };
  const result = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
  if (result.status === 0 && result.stdout.trim()) return { token: result.stdout.trim(), source: "gh" };
  return { token: "", source: "none" };
}
