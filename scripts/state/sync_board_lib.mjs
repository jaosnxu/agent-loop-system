import fs from "node:fs";
import path from "node:path";
import { systemRoot, getField, ensureDir } from "../lib/common.mjs";

export function syncBoard() {
  const statesDir = path.join(systemRoot, "states");
  ensureDir(statesDir);
  const rows = [];
  for (const file of fs.readdirSync(statesDir).sort()) {
    if (!/^state_.+\.md$/.test(file)) continue;
    const text = fs.readFileSync(path.join(statesDir, file), "utf8");
    const taskId = getField(text, "Task ID") || file.replace(/^state_/, "").replace(/\.md$/, "");
    rows.push({
      taskId,
      stage: getField(text, "Current Stage") || "unknown",
      priority: getField(text, "Priority") || "unset",
      risk: getField(text, "Risk Level") || "unset",
      worktree: getField(text, "Worktree Path") || `../worktrees/${taskId}`,
      updatedAt: getField(text, "Updated At") || "unset",
      nextAction: (text.match(/## Next Action\n\n- ([^\n]+)/) || [])[1] || "unset"
    });
  }
  const body = [
    "# Task Board",
    "",
    "| Task ID | Current Stage | Priority | Risk | Worktree | Updated At | Next Action |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.taskId} | ${row.stage} | ${row.priority} | ${row.risk} | ${row.worktree} | ${row.updatedAt} | ${row.nextAction.replaceAll("|", "\\|")} |`),
    ""
  ].join("\n");
  fs.writeFileSync(path.join(systemRoot, "task-board.md"), body);
}
