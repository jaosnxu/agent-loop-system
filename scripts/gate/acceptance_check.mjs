#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { appendLog, getField, readState, systemRoot, validateTaskId } from "../lib/common.mjs";

const [taskId, targetArg = "."] = process.argv.slice(2);
const target = path.resolve(process.cwd(), targetArg);

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

function contentOfTarget() {
  return walk(target)
    .filter((file) => /\.(html|md|js|mjs|json|txt)$/.test(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
}

function splitCriteria(text) {
  return String(text || "")
    .split(/\n|;|；/)
    .map((line) => line.replace(/^[-*\d.、\s]+/, "").trim())
    .filter(Boolean);
}

function covered(criterion, text) {
  const rules = [
    [["合同台账", "合同列表"], ["合同台账", "Реестр договоров"]],
    [["合同上传", "上传合同"], ["合同上传", "Загрузка договора"]],
    [["AI 合同审查", "AI审查", "合同审查"], ["AI 合同审查", "AI-проверка договора"]],
    [["审批流", "审批"], ["审批流", "Маршрут согласования"]],
    [["知识库", "问答"], ["知识库", "База знаний"]],
    [["任务详情", "任务协同"], ["任务详情", "Детали задачи"]],
    [["默认俄语", "俄语"], ["lang=\"ru\"", "Рабочая панель"]],
    [["中国节点", "变中文", "中文"], ["RU → CN", "合同与任务协同平台"]],
    [["普通员工", "不可见服务器", "服务器切换"], ["data-admin-only=\"true\""]],
    [["服务器切换", "模拟", "真实多节点"], ["服务器切换为交互逻辑模拟", "не реальным многоузловым развертыванием"]],
    [["不得出现", "奶茶", "点单", "库存", "菜单", "门店收银"], ["CHUCHUTEA Панель магазина", "奶茶点单", "点单系统", "门店收银"]]
  ];
  const matched = rules.find(([needles]) => needles.some((needle) => criterion.includes(needle)));
  if (!matched) return true;
  const [, evidence] = matched;
  if (criterion.includes("不得出现") || criterion.includes("不可出现")) {
    return evidence.every((item) => !text.includes(item));
  }
  return evidence.every((item) => text.includes(item));
}

try {
  validateTaskId(taskId);
  if (!fs.existsSync(target)) throw new Error(`Target path not found: ${target}`);
  const stateText = readState(taskId);
  const requirement = getField(stateText, "Requirement");
  const acceptance = getField(stateText, "Acceptance");
  const taskType = getField(stateText, "Task Type");
  if (["prototype", "development"].includes(taskType)) {
    if (!requirement.trim()) throw new Error("Missing Requirement in state.");
    if (!acceptance.trim()) throw new Error("Missing Acceptance in state.");
  }
  const text = contentOfTarget();
  const failures = [];
  if (requirement.trim() && !text.includes("Requirement Coverage") && !text.includes(requirement.slice(0, Math.min(40, requirement.length)))) {
    failures.push("requirement_not_represented_in_artifact");
  }
  for (const criterion of splitCriteria(acceptance)) {
    const ok = covered(criterion, text);
    appendLog("logs/gate.log", `ACCEPTANCE_GATE_CHECK task=${taskId} criterion=${JSON.stringify(criterion)} result=${ok ? "pass" : "fail"}`);
    if (!ok) failures.push(criterion);
  }
  if (failures.length) {
    appendLog("logs/gate.log", `ACCEPTANCE_GATE_BLOCKED task=${taskId} failures=${JSON.stringify(failures)}`);
    console.log("ACCEPTANCE_GATE_BLOCKED");
    for (const failure of failures) console.log(`- ${failure}`);
    process.exit(2);
  }
  appendLog("logs/gate.log", `ACCEPTANCE_GATE_PASSED task=${taskId} target=${target}`);
  console.log("ACCEPTANCE_GATE_PASSED");
} catch (error) {
  appendLog("logs/gate.log", `ACCEPTANCE_GATE_ERROR task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  console.error(`ACCEPTANCE_GATE_ERROR: ${error.message}`);
  process.exit(1);
}
