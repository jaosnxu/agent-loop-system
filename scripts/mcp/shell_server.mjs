#!/usr/bin/env node
import readline from "node:readline";
import { spawnSync } from "node:child_process";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function error(id, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } })}\n`);
}

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (msg.method === "tools/list") {
      reply(msg.id, { tools: [{ name: "shell_execute", description: "Execute allowlisted shell commands" }] });
      return;
    }
    if (msg.method === "tools/call" && msg.params?.name === "shell_execute") {
      const command = String(msg.params.arguments?.command || "");
      if (!/^(pwd|ls|cat|node|npm|git|echo|test|rg|sed|python3)(\s|$)/.test(command)) {
        error(msg.id, "Command not allowlisted");
        return;
      }
      const out = spawnSync("/bin/zsh", ["-lc", command], { encoding: "utf8" });
      reply(msg.id, { content: [{ type: "text", text: `status=${out.status}\n${out.stdout}${out.stderr}` }] });
      return;
    }
    reply(msg.id, {});
  } catch (err) {
    error(null, err.message);
  }
});
