#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import config from "../../config/heartbeat.config.js";
import { appendLog, systemRoot } from "../lib/common.mjs";

const intervalMs = Math.max(1, Number(config.intervalMinutes || 30)) * 60 * 1000;
let running = false;

function tick() {
  if (running) {
    appendLog(config.paths.logFile, "heartbeat_skip previous_tick_still_running");
    return;
  }
  running = true;
  const result = spawnSync(process.execPath, ["scripts/heartbeat/heartbeat_once.mjs"], {
    cwd: systemRoot,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.stdout.trim()) appendLog(config.paths.logFile, `daemon_stdout ${JSON.stringify(result.stdout.trim())}`);
  if (result.stderr.trim()) appendLog(config.paths.logFile, `daemon_stderr ${JSON.stringify(result.stderr.trim())}`);
  running = false;
}

appendLog(config.paths.logFile, `heartbeat_daemon_started interval_minutes=${config.intervalMinutes}`);
tick();
setInterval(tick, intervalMs);
