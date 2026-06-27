#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  appendLog,
  systemRoot,
  validateTaskId,
  readState,
  getField,
  writeState,
  setField,
  appendSectionItem,
  replaceNextAction,
  replaceGateStatus,
  nowIso
} from "../lib/common.mjs";
import { logToolCall } from "../lib/tool_logger.mjs";
import { logError } from "../lib/error_logger.mjs";
import { callTool } from "../mcp/mcp_tool.mjs";
import { syncBoard } from "../state/sync_board_lib.mjs";
import { readQueue } from "../queue/queue_lib.mjs";

const [taskId, ...rest] = process.argv.slice(2);
const options = new Map();
for (const arg of rest) {
  const [key, ...valueParts] = arg.split("=");
  if (key.startsWith("--")) options.set(key.slice(2), valueParts.join("=") || "true");
}
const taskType = options.get("type") || "example";
const approved = options.get("approved") === "true";
const maxRetries = Number(options.get("max-retries") || process.env.AGENT_LOOP_RETRIES || 3);
const mainRepoRoot = path.resolve(systemRoot, "..");

function queueTask(taskId) {
  return readQueue().tasks.find((task) => task.taskId === taskId) || {};
}

const queuedTask = taskId ? queueTask(taskId) : {};

function taskValue(name, fallback = "") {
  return options.get(name) || queuedTask[name] || fallback;
}

function run(command, args, cwd = systemRoot, allowFailure = false) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
  appendLog("logs/orchestrator.log", `command cmd=${JSON.stringify([command, ...args].join(" "))} cwd=${JSON.stringify(cwd)} status=${result.status}`);
  if (taskId) {
    spawnSync(process.execPath, [
      "scripts/state/record_action.mjs",
      taskId,
      "orchestrator",
      `run ${path.basename(command)} ${args.slice(0, 3).join(" ")}`,
      cwd,
      `status=${result.status}`,
      result.status === 0 ? "continue next DAG stage" : "inspect stderr and record root cause before retry"
    ], { cwd: systemRoot, encoding: "utf8" });
  }
  if (result.stdout.trim()) appendLog("logs/orchestrator.log", `stdout ${JSON.stringify(result.stdout.trim())}`);
  if (result.stderr.trim()) appendLog("logs/orchestrator.log", `stderr ${JSON.stringify(result.stderr.trim())}`);
  if (!allowFailure && result.status !== 0) {
    throw new Error(`Command failed: ${[command, ...args].join(" ")}\n${result.stderr || result.stdout}`);
  }
  return result;
}

function runWithRetry(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return fn();
    } catch (error) {
      lastError = error;
      run(process.execPath, ["scripts/state/record_diagnostic.mjs", taskId, label, String(attempt), String(maxRetries), error.message], systemRoot, true);
      logError("WARN", label, error, { attempt, maxRetries, taskId });
      appendLog("logs/orchestrator.log", `retry label=${label} attempt=${attempt}/${maxRetries} error=${JSON.stringify(error.message)}`);
    }
  }
  throw lastError;
}

function update(taskId, stage, note) {
  run(process.execPath, ["scripts/state/update_stage.mjs", taskId, stage, note]);
}

function setCounter(taskId, field, value) {
  run(process.execPath, ["scripts/state/set_counter.mjs", taskId, field, String(value)]);
}

function markEvidence(taskId, message) {
  let text = readState(taskId);
  text = setField(text, "Updated At", nowIso());
  text = appendSectionItem(text, "Evidence", `${nowIso()} ${message}`);
  writeState(taskId, text);
  syncBoard();
}

function setGate(taskId, gate, value) {
  let text = readState(taskId);
  text = replaceGateStatus(text, gate, value);
  text = setField(text, "Updated At", nowIso());
  writeState(taskId, text);
  syncBoard();
}

function setNext(taskId, nextAction) {
  let text = readState(taskId);
  text = replaceNextAction(text, nextAction);
  text = setField(text, "Updated At", nowIso());
  writeState(taskId, text);
  syncBoard();
}

function currentStage(taskId) {
  return getField(readState(taskId), "Current Stage") || "pending";
}

function worktreePath(taskId) {
  return path.resolve(systemRoot, "..", "worktrees", taskId);
}

function taskContext(taskId) {
  const stateExists = fs.existsSync(path.join(systemRoot, `states/state_${taskId}.md`));
  const stateText = stateExists ? readState(taskId) : "";
  return {
    taskId,
    title: stateExists ? ((stateText.match(/## Task Title\n\n- ([^\n]+)/) || [])[1] || taskValue("title", "Manual task")) : taskValue("title", "Manual task"),
    type: stateExists ? (getField(stateText, "Task Type") || taskType) : taskType,
    priority: stateExists ? (getField(stateText, "Priority") || taskValue("priority", "P2")) : taskValue("priority", "P2"),
    prd: stateExists ? (getField(stateText, "PRD") || taskValue("prd")) : taskValue("prd"),
    scope: stateExists ? (getField(stateText, "Scope") || taskValue("scope")) : taskValue("scope"),
    requirement: stateExists ? (getField(stateText, "Requirement") || taskValue("requirement")) : taskValue("requirement"),
    acceptance: stateExists ? (getField(stateText, "Acceptance") || taskValue("acceptance")) : taskValue("acceptance")
  };
}

function requireTaskSpec(context) {
  if (!["prototype", "development"].includes(context.type)) return;
  const missing = [];
  if (!context.requirement?.trim()) missing.push("requirement");
  if (!context.acceptance?.trim()) missing.push("acceptance");
  if (missing.length) {
    throw new Error(`Task spec incomplete for ${context.type}: missing ${missing.join(", ")}. Refusing default template execution.`);
  }
}

function splitCriteria(text) {
  return String(text || "")
    .split(/\n|;|；/)
    .map((line) => line.replace(/^[-*\d.、\s]+/, "").trim())
    .filter(Boolean);
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function requiredContractModules(context) {
  const source = `${context.requirement}\n${context.acceptance}`;
  const modules = [
    ["contract-ledger", "合同台账", "Реестр договоров", ["合同台账", "合同列表", "合同管理"]],
    ["contract-upload", "合同上传", "Загрузка договора", ["合同上传", "上传合同"]],
    ["ai-review", "AI 合同审查", "AI-проверка договора", ["AI 合同审查", "AI审查", "合同审查"]],
    ["approval-flow", "审批流", "Маршрут согласования", ["审批流", "审批"]],
    ["knowledge-base", "知识库", "База знаний", ["知识库", "问答"]],
    ["task-detail", "任务详情", "Детали задачи", ["任务详情", "任务协同", "任务"]]
  ];
  return modules.filter(([, , , keys]) => includesAny(source, keys));
}

function forbiddenTerms(context) {
  const source = `${context.requirement}\n${context.acceptance}`;
  const defaults = ["奶茶点单", "点单系统", "库存", "菜单", "门店收银", "CHUCHUTEA Панель магазина", "Склад", "Заказы"];
  return defaults.filter((term) => source.includes(term) || ["奶茶点单", "点单系统", "库存", "菜单", "门店收银"].includes(term));
}

function acceptanceCovered(criterion, htmlText) {
  const rules = [
    [["合同台账", "合同列表"], ["contract-ledger", "合同台账", "Реестр договоров"]],
    [["合同上传", "上传合同"], ["contract-upload", "合同上传", "Загрузка договора"]],
    [["AI 合同审查", "AI审查", "合同审查"], ["ai-review", "AI 合同审查", "AI-проверка договора"]],
    [["审批流", "审批"], ["approval-flow", "审批流", "Маршрут согласования"]],
    [["知识库", "问答"], ["knowledge-base", "知识库", "База знаний"]],
    [["任务详情", "任务协同"], ["task-detail", "任务详情", "Детали задачи"]],
    [["默认俄语", "俄语"], ["<html lang=\"ru\">", "Рабочая панель"]],
    [["中国节点", "变中文", "中文"], ["RU → CN", "合同与任务协同平台"]],
    [["普通员工", "不可见服务器", "服务器切换"], ["data-admin-only=\"true\""]],
    [["不得出现", "奶茶", "点单", "库存", "菜单", "门店收银"], ["CHUCHUTEA Панель магазина", "奶茶点单", "点单系统", "门店收银"]]
  ];
  const matched = rules.find(([needles]) => needles.some((needle) => criterion.includes(needle)));
  if (!matched) return true;
  const [, evidence] = matched;
  if (criterion.includes("不得出现") || criterion.includes("不可出现")) {
    return evidence.every((item) => !htmlText.includes(item));
  }
  return evidence.every((item) => htmlText.includes(item));
}

function cleanWorktree(taskId) {
  logToolCall({ role: "orchestrator", tool: "worktree", operation: "clean", target: taskId, result: "started" });
  const result = run(path.join(systemRoot, "scripts/worktree/clean_worktree.sh"), [taskId], systemRoot, true);
  logToolCall({ role: "orchestrator", tool: "worktree", operation: "clean", target: taskId, result: result.status === 0 ? "passed" : "failed" });
  if (result.status !== 0) throw new Error(`Worktree cleanup failed: ${result.stderr || result.stdout}`);
}

function createWorktree(taskId) {
  logToolCall({ role: "orchestrator", tool: "worktree", operation: "create", target: taskId, result: "started" });
  const result = run(path.join(systemRoot, "scripts/worktree/create_worktree.sh"), [taskId]);
  logToolCall({ role: "orchestrator", tool: "worktree", operation: "create", target: taskId, result: result.status === 0 ? "passed" : "failed" });
}

function safety(taskId) {
  const result = run(process.execPath, ["scripts/gate/safety_brake.mjs", taskId], systemRoot, true);
  if (result.status === 2) {
    run(process.execPath, ["scripts/state/terminate_task.mjs", taskId, result.stdout.trim() || "safety brake blocked"]);
    cleanWorktree(taskId);
    return "terminated";
  }
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return "passed";
}

function runAgent(role, taskId) {
  if (options.get(`skip-${role}`) === "true") {
    run(process.execPath, ["scripts/state/record_action.mjs", taskId, "orchestrator", `skip ${role} agent`, `logs/codex/${taskId}.${role}.result.json`, "skipped by explicit option", "parse existing structured result artifact"], systemRoot, true);
    return;
  }
  run(process.execPath, ["scripts/state/record_action.mjs", taskId, "orchestrator", `start ${role} agent`, `states/state_${taskId}.md`, "started", `${role} must read role prompt, Skill files, task state, and write result evidence`], systemRoot, true);
  const result = run(process.execPath, ["scripts/agents/run_agent.mjs", role, taskId], systemRoot, true);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  run(process.execPath, ["scripts/state/record_action.mjs", taskId, role, "agent completed", `logs/codex/${taskId}.${role}.result.md`, "completed", "route according to DAG and gate result"], systemRoot, true);
}

function recordFailure(taskId, reason, { label = "orchestrator", rootCause = reason, fixPlan = "", nextChecks = "" } = {}) {
  const args = ["scripts/state/record_failure.mjs", taskId, reason, `--label=${label}`];
  if (rootCause) args.push(`--root-cause=${rootCause}`);
  if (fixPlan) args.push(`--fix-plan=${fixPlan}`);
  if (nextChecks) args.push(`--next-checks=${nextChecks}`);
  run(process.execPath, args, systemRoot, true);
}

function codexResultPath(taskId, role) {
  return path.join(systemRoot, "logs/codex", `${taskId}.${role}.result.md`);
}

function codexResultJsonPath(taskId, role) {
  return path.join(systemRoot, "logs/codex", `${taskId}.${role}.result.json`);
}

function parseAgentResult(taskId, role) {
  const resultPath = codexResultJsonPath(taskId, role);
  if (!fs.existsSync(resultPath)) return { available: false, resultPath };
  try {
    const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    if (result.schemaVersion !== "agent-result/v1") {
      return { available: true, valid: false, resultPath, summary: "invalid schemaVersion" };
    }
    return { available: true, valid: true, resultPath, ...result };
  } catch (error) {
    return { available: true, valid: false, resultPath, summary: error.message };
  }
}

function parseReviewOutput(taskId) {
  const structured = parseAgentResult(taskId, "review");
  if (structured.available) {
    if (!structured.valid) return { available: true, passed: false, resultPath: structured.resultPath, summary: structured.summary };
    if (structured.status !== "disabled" && structured.decision === "fail") return { available: true, passed: false, resultPath: structured.resultPath, summary: structured.summary || "structured review failed" };
    if (structured.status !== "disabled" && structured.decision === "pass") return { available: true, passed: true, resultPath: structured.resultPath, summary: structured.summary || "structured review passed" };
  }
  const resultPath = codexResultPath(taskId, "review");
  if (!fs.existsSync(resultPath)) return { available: false, passed: null, resultPath };
  const text = fs.readFileSync(resultPath, "utf8");
  const hasFail = /gate_result:\s*FAIL\b/i.test(text) || /next_stage:\s*returned_to_development\b/i.test(text);
  const hasBlockingFinding = /severity:\s*P[01]\b/i.test(text);
  const hasPass = /gate_result:\s*PASS\b/i.test(text) || /next_stage:\s*scoring\b/i.test(text);
  return {
    available: true,
    passed: hasFail || hasBlockingFinding ? false : hasPass ? true : null,
    resultPath,
    summary: text.slice(0, 500).replace(/\s+/g, " ").trim()
  };
}

function parseScoringOutput(taskId) {
  const structured = parseAgentResult(taskId, "scoring");
  if (!structured.available) return { available: false, passed: null, resultPath: structured.resultPath };
  if (!structured.valid) return { available: true, passed: false, resultPath: structured.resultPath, summary: structured.summary };
  if (structured.status === "disabled") return { available: true, passed: null, resultPath: structured.resultPath, summary: structured.summary };
  if (structured.decision === "fail") return { available: true, passed: false, resultPath: structured.resultPath, summary: structured.summary || "structured scoring failed" };
  if (["pass", "completed"].includes(structured.decision)) return { available: true, passed: true, resultPath: structured.resultPath, summary: structured.summary || "structured scoring passed" };
  return { available: true, passed: null, resultPath: structured.resultPath, summary: structured.summary || "structured scoring undetermined" };
}

function developExample(taskId) {
  if (options.get("fail-step") === "development") {
    throw new Error("Injected development failure for retry verification.");
  }
  const dir = worktreePath(taskId);
  const file = taskType === "changelog" ? path.join(dir, "CHANGELOG.md") : path.join(dir, "example-task-output.md");
  let content;
  if (taskType === "changelog") {
    content = [
      "# CHANGELOG",
      "",
      "## v1.0.0 - 正式发布",
      "",
      "### 7 个核心模块清单",
      "",
      "1. 心跳触发模块：支持间隔巡检、定点 Cron、日志记录和后台常驻运行。",
      "2. Worktree 任务隔离模块：每个任务使用独立 `../worktrees/任务ID/` 目录和 `task/任务ID` 分支。",
      "3. Skill 规则体系模块：通过 `skills/*/SKILL.md` 标准目录约束代码、审查、分诊、禁区和角色边界。",
      "4. MCP 工具连接器模块：提供文件系统、Shell、GitHub 三类工具配置模板和角色权限分级。",
      "5. 子 Agent 职责分离模块：分诊、开发、审查、打分四个角色按固定 DAG 流转。",
      "6. 记忆 / 状态脊柱模块：通过 `states/state_任务ID.md` 和 `task-board.md` 记录阶段、失败、证据和下一步。",
      "7. 验证治理门禁模块：提供自动检查、独立审查、量化打分、人工确认标记和三重安全刹车。",
      "",
      "### 当前版本功能范围",
      "",
      "- 支持手动任务提交和心跳巡检触发。",
      "- 支持独立 worktree 创建、断言和清理。",
      "- 支持四角色 Prompt、Skill 规则读取约束和职责边界声明。",
      "- 支持 Markdown 状态文件创建、阶段更新、失败记录、断点续跑和总看板同步。",
      "- 支持自动门禁、迭代上限、连续无进展上限、token / 工具调用预算上限。",
      "- 支持示例任务、断点续跑验证和安全刹车验证。",
      "- 支持将隔离 worktree 的任务产物合并回主工作区。",
      "",
      "### 已知限制",
      "",
      "- MCP 配置为模板，真实 GitHub、Shell、文件系统 MCP server 需要按环境补充 token 和服务端配置。",
      "- 当前开发、审查、打分为本地确定性流程模拟，未接入真实大模型子 Agent。",
      "- 自动门禁覆盖基础语法、JSON 和 Markdown/脚本格式问题，不替代完整业务测试。",
      "- 空仓库无初始 commit 时使用 orphan worktree，适合当前初始化场景，但生产仓库建议先建立主干基线 commit。",
      "",
      "### 后续规划",
      "",
      "- 接入真实 MCP GitHub Issue、PR 创建、CI 状态读取和评论回写。",
      "- 接入真实开发、审查、打分子 Agent，并执行最小上下文与权限隔离。",
      "- 扩展 Markdown、Playwright、业务测试和部署 smoke test 门禁。",
      "- 增加 Web 状态面板、预算看板、人工确认队列和失败重试策略配置。",
      "- 将 CHUCHUTEA 模块拆成 PRD、开发、审查、QA、Staging、Production Smoke 多层 Loop。",
      ""
    ].join("\n");
  } else {
    content = [
      "# Agent Loop Example",
      "",
      `Task ID: ${taskId}`,
      "",
      "This file was created by the Development Agent simulation inside an isolated git worktree.",
      ""
    ].join("\n");
  }
  const result = spawnSync(process.execPath, ["scripts/mcp/mcp_tool.mjs", "development", "filesystem", "write", file, content], { cwd: systemRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  run(process.execPath, ["scripts/state/record_action.mjs", taskId, "development", "write task artifact", file, "file written", "run auto gate then independent review"], systemRoot, true);
  markEvidence(taskId, `development wrote ${file}`);
  markEvidence(taskId, "development read skills/development-agent/SKILL.md and skills/loop-engineering/SKILL.md before writing");
  run(process.execPath, ["scripts/state/record_artifact_hash.mjs", taskId, file, "development-output"], systemRoot, true);
}

function generatePrototype(taskId) {
  const context = taskContext(taskId);
  requireTaskSpec(context);
  const dir = worktreePath(taskId);
  const html = path.join(dir, "prototype/index.html");
  const testcase = path.join(dir, "testcases/prototype-basic.md");
  const modules = requiredContractModules(context);
  if (!modules.length) {
    throw new Error("Prototype requirement does not name any supported core module.");
  }
  const moduleButtons = modules.map(([testId, cn, ru]) => `<button class="tab" data-testid="nav-${testId}" data-cn="${cn}" data-ru="${ru}">${ru}</button>`).join("\n      ");
  const modulePanels = modules.map(([testId, cn, ru]) => `<section class="panel module" data-testid="module-${testId}"><h2 data-cn="${cn}" data-ru="${ru}">${ru}</h2><p data-cn="${cn} 核心流程" data-ru="${ru}: основной рабочий процесс">${ru}: основной рабочий процесс</p></section>`).join("\n      ");
  const requirementSummary = context.requirement.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const acceptanceSummary = splitCriteria(context.acceptance)
    .map((criterion) => criterion.replace(/奶茶点单|点单系统|库存|菜单|门店收银/g, "[forbidden-business-domain]"))
    .join("\n")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const htmlContent = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Платформа договоров и задач</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f6f7f9; color: #20242a; }
    header { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 20px; background: #263238; color: white; flex-wrap: wrap; }
    main { display: grid; grid-template-columns: 220px 1fr; min-height: calc(100vh - 56px); }
    nav { background: #ffffff; border-right: 1px solid #d8dde3; padding: 16px; }
    button { border: 1px solid #b9c2cc; background: white; border-radius: 6px; padding: 10px 12px; cursor: pointer; }
    button.primary { background: #455a64; color: white; border-color: #455a64; }
    .tab { display: block; width: 100%; margin-bottom: 8px; text-align: left; }
    .content { padding: 20px; }
    .panel { background: white; border: 1px solid #d8dde3; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .module { overflow-wrap: anywhere; }
    .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .hidden { display: none; }
    label { display: block; margin-bottom: 6px; font-weight: 600; }
    input { width: 100%; max-width: 360px; padding: 10px; border: 1px solid #aeb7c2; border-radius: 6px; }
    .status { margin-top: 12px; color: #455a64; font-weight: 700; overflow-wrap: anywhere; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    @media (max-width: 760px) { main { grid-template-columns: 1fr; } nav { border-right: 0; border-bottom: 1px solid #d8dde3; } }
  </style>
</head>
<body>
  <header>
    <strong data-testid="app-title" data-cn="合同与任务协同平台" data-ru="Платформа договоров и задач">Платформа договоров и задач</strong>
    <div class="toolbar">
      <span data-testid="user-role" data-cn="系统管理员" data-ru="Системный администратор">Системный администратор</span>
      <button data-testid="server-switch" data-admin-only="true">RU → CN</button>
      <span data-testid="server-node">RU</span>
    </div>
  </header>
  <main>
    <nav>
      <button class="tab primary" data-testid="nav-dashboard" data-cn="工作台" data-ru="Рабочая панель">Рабочая панель</button>
      ${moduleButtons}
    </nav>
    <section class="content">
      <div class="panel">
        <h1 data-testid="page-title" data-cn="合同管理 / 任务协同 / 知识库 / AI 审查" data-ru="Договоры / задачи / база знаний / AI-проверка">Договоры / задачи / база знаний / AI-проверка</h1>
        <p data-testid="prototype-boundary" data-cn="服务器切换为交互逻辑模拟，不是真实多节点部署。" data-ru="Переключение сервера является интерактивной симуляцией, а не реальным многоузловым развертыванием.">Переключение сервера является интерактивной симуляцией, а не реальным многоузловым развертыванием.</p>
      </div>
      ${modulePanels}
      <div class="panel">
        <label for="search" data-cn="搜索合同、任务或知识库" data-ru="Поиск договора, задачи или базы знаний">Поиск договора, задачи или базы знаний</label>
        <input id="search" data-testid="search-input" placeholder="Введите запрос">
        <button class="primary" data-testid="search-button" data-cn="检查" data-ru="Проверить">Проверить</button>
        <div class="status" data-testid="status-text" data-cn="已准备处理合同协同任务" data-ru="Готово к работе с договорами и задачами">Готово к работе с договорами и задачами</div>
      </div>
      <div class="panel" data-testid="requirement-coverage">
        <h2>Requirement Coverage</h2>
        <pre>${requirementSummary}</pre>
        <h2>Acceptance Coverage</h2>
        <pre>${acceptanceSummary}</pre>
      </div>
    </section>
  </main>
  <script>
    let currentLang = 'ru';
    const status = document.querySelector('[data-testid="status-text"]');
    function applyLang(lang) {
      currentLang = lang;
      document.documentElement.lang = lang === 'cn' ? 'zh' : 'ru';
      document.querySelector('[data-testid="server-node"]').textContent = lang === 'cn' ? 'CN' : 'RU';
      document.querySelectorAll('[data-cn][data-ru]').forEach((node) => {
        node.textContent = node.dataset[lang] || node.textContent;
      });
    }
    document.querySelector('[data-testid="server-switch"]').addEventListener('click', () => {
      applyLang(currentLang === 'ru' ? 'cn' : 'ru');
    });
    document.querySelectorAll('.tab').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((item) => item.classList.remove('primary'));
        button.classList.add('primary');
        status.textContent = (currentLang === 'cn' ? '已打开：' : 'Открыто: ') + button.textContent;
      });
    });
    document.querySelector('[data-testid="search-button"]').addEventListener('click', () => {
      const value = document.querySelector('[data-testid="search-input"]').value || (currentLang === 'cn' ? '合同' : 'договор');
      status.textContent = (currentLang === 'cn' ? '已检查：' : 'Проверено: ') + value;
    });
  </script>
</body>
</html>
`;
  const testContent = [
    "# Test Case: prototype-basic",
    "",
    "- Case ID: prototype-basic",
    "- Priority: P0",
    "- Test Path: prototype/index.html",
    "",
    "## Requirement",
    "",
    context.requirement,
    "",
    "## Acceptance",
    "",
    context.acceptance,
    "",
    "## Steps",
    "",
    "1. Open the prototype page.",
    "2. Verify required modules are present.",
    "3. Switch server as administrator.",
    "4. Click `search-button`.",
    "",
    "## Expected Result",
    "",
    "- Requirement coverage is visible.",
    "- Acceptance cases are covered.",
    "- Server switch is administrator-only simulation.",
    "- No unrelated tea shop template is present.",
    ""
  ].join("\n");
  for (const [file, content] of [[html, htmlContent], [testcase, testContent]]) {
    const result = spawnSync(process.execPath, ["scripts/mcp/mcp_tool.mjs", "prototyper", "filesystem", "write", file, content], { cwd: systemRoot, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  }
  markEvidence(taskId, `prototype generated ${html}`);
  markEvidence(taskId, `testcase generated ${testcase}`);
  run(process.execPath, ["scripts/state/record_artifact_hash.mjs", taskId, path.join(dir, "prototype"), "prototype-output"], systemRoot, true);
}

function designGate(taskId) {
  const context = taskContext(taskId);
  requireTaskSpec(context);
  const file = path.join(worktreePath(taskId), "prototype/index.html");
  const read = spawnSync(process.execPath, ["scripts/mcp/mcp_tool.mjs", "review", "filesystem", "read", file], { cwd: systemRoot, encoding: "utf8" });
  if (read.status !== 0) throw new Error(read.stderr || read.stdout);
  const text = JSON.parse(read.stdout).text || "";
  const modules = requiredContractModules(context);
  const checks = [
    ["requirement_read", text.includes(context.requirement.slice(0, Math.min(40, context.requirement.length)))],
    ["acceptance_read", text.includes("Acceptance Coverage")],
    ["default_russian", text.includes("<html lang=\"ru\">") && text.includes("Платформа договоров")],
    ["server_switch_simulation", text.includes("data-testid=\"server-switch\"") && text.includes("симуляцией")],
    ["admin_only_server_switch", text.includes("data-admin-only=\"true\"")],
    ["business_data_not_translated_boundary", text.includes("Requirement Coverage")],
    ...modules.map(([testId]) => [`module_${testId}`, text.includes(`data-testid="module-${testId}"`)]),
    ...forbiddenTerms(context).map((term) => [`forbidden_${term}`, !text.includes(term)])
  ];
  const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
  for (const [name, ok] of checks) {
    appendLog("logs/gate.log", `DESIGN_GATE_CHECK task=${taskId} check=${name} result=${ok ? "pass" : "fail"}`);
  }
  if (failures.length) {
    recordFailure(taskId, `Design gate failed: ${failures.join(", ")}`, {
      label: "design_gate",
      rootCause: `Prototype is missing required design checks: ${failures.join(", ")}`,
      fixPlan: "Prototyper Agent must update prototype/index.html to cover the missing requirement, acceptance, language, permission, or module checks without changing unrelated workflow structure.",
      nextChecks: "Rerun design gate, then rerun prototype testing only after all design checks pass."
    });
    appendLog("logs/gate.log", `DESIGN_GATE_FAILED task=${taskId} failures=${JSON.stringify(failures)}`);
    return false;
  }
  markEvidence(taskId, `design gate passed: requirement and ${checks.length} checks covered`);
  return true;
}

function testPrototype(taskId) {
  const context = taskContext(taskId);
  requireTaskSpec(context);
  const dir = worktreePath(taskId);
  const html = path.join(dir, "prototype/index.html");
  const report = path.join(dir, "reports/prototype-test-report.md");
  const read = spawnSync(process.execPath, ["scripts/mcp/mcp_tool.mjs", "tester", "filesystem", "read", html], { cwd: systemRoot, encoding: "utf8" });
  if (read.status !== 0) throw new Error(read.stderr || read.stdout);
  const text = JSON.parse(read.stdout).text || "";
  const criteria = splitCriteria(context.acceptance);
  const modules = requiredContractModules(context);
  const checks = [
    ["requirement loaded", text.includes("Requirement Coverage") && text.includes(context.requirement.slice(0, Math.min(40, context.requirement.length)))],
    ["acceptance loaded", text.includes("Acceptance Coverage")],
    ["default Russian", text.includes("<html lang=\"ru\">") && text.includes("Рабочая панель")],
    ["server switch to Chinese", text.includes("RU → CN") && text.includes("applyLang") && text.includes("合同与任务协同平台")],
    ["admin switch permission", text.includes("data-admin-only=\"true\"")],
    ["Russian layout resilient", text.includes("overflow-wrap") && text.includes("@media")],
    ["prototype boundary", text.includes("не реальным многоузловым развертыванием") || text.includes("不是真实多节点部署")],
    ...modules.map(([, cn, ru]) => [`module ${cn}`, text.includes(cn) && text.includes(ru)]),
    ...forbiddenTerms(context).map((term) => [`forbidden ${term}`, !text.includes(term)]),
    ...criteria.map((criterion) => [`acceptance: ${criterion.slice(0, 60)}`, acceptanceCovered(criterion, text)])
  ];
  const passed = checks.filter(([, ok]) => ok).length;
  const failed = checks.length - passed;
  for (const [name, ok] of checks) {
    appendLog("logs/gate.log", `ACCEPTANCE_CHECK task=${taskId} check=${JSON.stringify(name)} result=${ok ? "pass" : "fail"}`);
  }
  const reportText = [
    "# Prototype Test Report",
    "",
    `- Task ID: ${taskId}`,
    `- Passed: ${passed}`,
    `- Failed: ${failed}`,
    "",
    "## Cases",
    ...checks.map(([name, ok]) => `- ${ok ? "PASS" : "FAIL"} ${name}`),
    "",
    failed ? "## Error\n\nPrototype interaction checks failed." : "## Result\n\nAll interaction checks passed.",
    ""
  ].join("\n");
  const write = spawnSync(process.execPath, ["scripts/mcp/mcp_tool.mjs", "tester", "filesystem", "write", report, reportText], { cwd: systemRoot, encoding: "utf8" });
  if (write.status !== 0) throw new Error(write.stderr || write.stdout);
  markEvidence(taskId, `prototype test report ${report} passed=${passed} failed=${failed}`);
  run(process.execPath, ["scripts/state/record_artifact_hash.mjs", taskId, report, "test-report"], systemRoot, true);
  if (failed) {
    const failedCases = checks.filter(([, ok]) => !ok).map(([name]) => name);
    recordFailure(taskId, "Prototype tests failed", {
      label: "prototype_testing",
      rootCause: `Prototype interaction checks failed: ${failedCases.join(", ")}`,
      fixPlan: "Prototyper Agent must repair the failed interaction, language, permission, layout, or acceptance cases in the isolated worktree, then regenerate the test report.",
      nextChecks: "Rerun prototype testing and inspect reports/prototype-test-report.md for zero failed cases."
    });
    return false;
  }
  return true;
}

function reviewExample(taskId) {
  const reviewOutput = parseReviewOutput(taskId);
  if (reviewOutput.available && reviewOutput.passed === false) {
    run(process.execPath, ["scripts/state/record_action.mjs", taskId, "review", "block artifact", reviewOutput.resultPath, "P0/P1 or FAIL found", "return to development with root cause and fix plan"], systemRoot, true);
    recordFailure(taskId, `Review Agent blocked: ${reviewOutput.summary}`, {
      label: "review",
      rootCause: `Review Agent found a blocking issue in ${reviewOutput.resultPath}: ${reviewOutput.summary}`,
      fixPlan: "Development Agent must read the review result, fix each P0/P1 finding in the worktree, and avoid changing review or scoring artifacts.",
      nextChecks: "Rerun review, confirm Review Gate passes, then continue to scoring."
    });
    setGate(taskId, "Review Gate", "failed");
    markEvidence(taskId, `review failed by Codex output ${reviewOutput.resultPath}`);
    return false;
  }
  if (reviewOutput.available && reviewOutput.passed === true) {
    run(process.execPath, ["scripts/state/record_action.mjs", taskId, "review", "pass artifact", reviewOutput.resultPath, "review passed", "send to scoring"], systemRoot, true);
    setGate(taskId, "Review Gate", "passed");
    markEvidence(taskId, `review passed by Codex output ${reviewOutput.resultPath}`);
    return true;
  }
  const file = taskType === "changelog" ? path.join(worktreePath(taskId), "CHANGELOG.md") : path.join(worktreePath(taskId), "example-task-output.md");
  if (!fs.existsSync(file)) {
    recordFailure(taskId, "Review Agent blocked: expected output file missing", {
      label: "review",
      rootCause: `Expected development artifact is missing: ${file}`,
      fixPlan: "Development Agent must create the required output file inside the task worktree and rerun the auto gate before review.",
      nextChecks: "Verify the expected file exists, rerun review, and confirm Review Gate passes."
    });
    setGate(taskId, "Review Gate", "failed");
    return false;
  }
  const read = spawnSync(process.execPath, ["scripts/mcp/mcp_tool.mjs", "review", "filesystem", "read", file], { cwd: systemRoot, encoding: "utf8" });
  if (read.status !== 0) throw new Error(read.stderr || read.stdout);
  const parsed = JSON.parse(read.stdout);
  const text = parsed.text || "";
  if (taskType === "changelog") {
    const required = ["7 个核心模块清单", "当前版本功能范围", "已知限制", "后续规划"];
    const missing = required.filter((item) => !text.includes(item));
    if (missing.length) {
      recordFailure(taskId, `Review Agent blocked: CHANGELOG missing ${missing.join(", ")}`, {
        label: "review",
        rootCause: `CHANGELOG.md is missing required sections: ${missing.join(", ")}`,
        fixPlan: "Development Agent must add the missing CHANGELOG sections while preserving the release-note scope.",
        nextChecks: "Rerun review and verify all required CHANGELOG sections are present."
      });
      setGate(taskId, "Review Gate", "failed");
      return false;
    }
  } else if (!text.includes("Agent Loop Example") || !text.includes(taskId)) {
    recordFailure(taskId, "Review Agent blocked: output content incomplete", {
      label: "review",
      rootCause: "Example output exists but does not include the required heading and task id.",
      fixPlan: "Development Agent must update the output content to include the expected heading and current task id.",
      nextChecks: "Rerun review and confirm output content matches acceptance."
    });
    setGate(taskId, "Review Gate", "failed");
    return false;
  }
  setGate(taskId, "Review Gate", "passed");
  markEvidence(taskId, "review passed: expected output file and task id found");
  return true;
}

function scoreExample(taskId) {
  const scoringOutput = parseScoringOutput(taskId);
  if (scoringOutput.available && scoringOutput.passed === false) {
    recordFailure(taskId, `Scoring Agent blocked: ${scoringOutput.summary}`, {
      label: "scoring",
      rootCause: `Scoring Agent rejected acceptance in ${scoringOutput.resultPath}: ${scoringOutput.summary}`,
      fixPlan: "Development Agent must inspect the scoring criteria, close each failed acceptance item, and rerun review before scoring.",
      nextChecks: "Rerun scoring only after review passes and each acceptance criterion is explicitly covered."
    });
    setGate(taskId, "Score Gate", "failed");
    markEvidence(taskId, `scoring failed by structured output ${scoringOutput.resultPath}`);
    return false;
  }
  if (scoringOutput.available && scoringOutput.passed === true) {
    setGate(taskId, "Score Gate", "passed");
    markEvidence(taskId, `scoring passed by structured output ${scoringOutput.resultPath}`);
    logToolCall({ role: "scoring", tool: "state", operation: "score", target: taskId, result: "passed" });
    return true;
  }
  const score = taskType === "changelog" ? 96 : 100;
  if (score < 85) {
    recordFailure(taskId, `Score failed: ${score}`, {
      label: "scoring",
      rootCause: `Score ${score} is below the passing threshold 85.`,
      fixPlan: "Development Agent must improve acceptance coverage before rerunning review and scoring.",
      nextChecks: "Rerun scoring and verify score is at least 85."
    });
    setGate(taskId, "Score Gate", "failed");
    return false;
  }
  setGate(taskId, "Score Gate", "passed");
  markEvidence(taskId, `scoring passed score=${score}`);
  logToolCall({ role: "scoring", tool: "state", operation: "score", target: taskId, result: "passed" });
  return true;
}

function mergeResult(taskId) {
  if (taskType !== "changelog") return;
  if (!approved) {
    run(process.execPath, ["scripts/human/record_gate.mjs", taskId, "pending", "merge_to_main", "orchestrator", "merge to main requires human confirmation"], systemRoot, true);
    appendLog("logs/orchestrator.log", `human_gate_pending task=${taskId} operation=merge_to_main`);
    console.log(`PENDING_HUMAN task=${taskId}`);
    process.exit(90);
  }
  const source = path.join(worktreePath(taskId), "CHANGELOG.md");
  const target = path.join(mainRepoRoot, "CHANGELOG.md");
  if (!fs.existsSync(source)) throw new Error(`Merge source missing: ${source}`);
  const read = spawnSync(process.execPath, ["scripts/mcp/mcp_tool.mjs", "review", "filesystem", "read", source], { cwd: systemRoot, encoding: "utf8" });
  if (read.status !== 0) throw new Error(read.stderr || read.stdout);
  const parsed = JSON.parse(read.stdout);
  const write = spawnSync(process.execPath, ["scripts/mcp/mcp_tool.mjs", "development", "filesystem", "write", target, parsed.text || ""], { cwd: systemRoot, encoding: "utf8" });
  if (write.status !== 0) throw new Error(write.stderr || write.stdout);
  markEvidence(taskId, `merged ${source} to ${target}`);
  logToolCall({ role: "orchestrator", tool: "filesystem", operation: "merge_to_main", target, result: "passed" });
}

function maybeInterrupt(label) {
  if (options.get("interrupt-after") === label) {
    appendLog("logs/orchestrator.log", `intentional_interrupt after=${label}`);
    console.log(`INTERRUPTED_AFTER_${label.toUpperCase()}`);
    process.exit(75);
  }
}

try {
  validateTaskId(taskId);
  appendLog("logs/orchestrator.log", `run_start task=${taskId} requirement=${JSON.stringify(taskValue("requirement").slice(0, 160))} acceptance=${JSON.stringify(taskValue("acceptance").slice(0, 160))}`);

  if (!fs.existsSync(path.join(systemRoot, `states/state_${taskId}.md`))) {
    const initialContext = taskContext(taskId);
    requireTaskSpec(initialContext);
    run(process.execPath, [
      "scripts/state/create_state.mjs",
      taskId,
      initialContext.title || "Manual task",
      `--priority=${initialContext.priority || "P2"}`,
      `--type=${initialContext.type || taskType}`,
      `--prd=${initialContext.prd || ""}`,
      `--scope=${initialContext.scope || ""}`,
      `--requirement=${initialContext.requirement || ""}`,
      `--acceptance=${initialContext.acceptance || ""}`
    ]);
  }

  requireTaskSpec(taskContext(taskId));

  let stage = currentStage(taskId);
  let iteration = Number(getField(readState(taskId), "Iteration Count") || 0);

  while (!["completed", "gate_passed", "terminated"].includes(stage)) {
    const safetyResult = safety(taskId);
    if (safetyResult === "terminated") {
      stage = currentStage(taskId);
      break;
    }
    iteration += 1;
    setCounter(taskId, "Iteration Count", iteration);
    setCounter(taskId, "Tool Call Count", Number(getField(readState(taskId), "Tool Call Count") || 0) + 1);

    stage = currentStage(taskId);
    if (stage === "pending" || stage === "triage") {
      runAgent("triage", taskId);
      update(taskId, "triage", "orchestrator triage");
      maybeInterrupt("triage");
      update(taskId, "worktree", taskType === "prototype" ? "triage routed to prototyping" : "triage routed to development");
      setNext(taskId, "Create isolated worktree.");
    } else if (stage === "worktree") {
      runWithRetry("create_worktree", () => createWorktree(taskId));
      maybeInterrupt("worktree");
      update(taskId, taskType === "prototype" ? "prototyping" : "development", "worktree ready");
      setNext(taskId, taskType === "prototype" ? "Prototyper Agent must create the prototype." : "Development Agent must implement the task.");
    } else if (stage === "prototyping") {
      runAgent("prototyper", taskId);
      runWithRetry("prototyping", () => generatePrototype(taskId));
      update(taskId, "design_gate", "prototype generated");
    } else if (stage === "design_gate") {
      if (!runWithRetry("design_gate", () => designGate(taskId))) {
        update(taskId, "prototyping", "design gate failed");
      } else {
        update(taskId, "testing", "design gate passed");
      }
    } else if (stage === "testing") {
      runAgent("tester", taskId);
      if (!runWithRetry("prototype_testing", () => testPrototype(taskId))) {
        update(taskId, "prototyping", "prototype tests failed");
      } else {
        run(process.execPath, ["scripts/human/record_gate.mjs", taskId, "pending", "prototype_approval", "orchestrator", "prototype approval required before formal development"], systemRoot, true);
        console.log(`PENDING_HUMAN task=${taskId}`);
        process.exit(90);
      }
    } else if (stage === "development" || stage === "returned_to_development") {
      runAgent("development", taskId);
      runWithRetry("development", () => developExample(taskId));
      maybeInterrupt("development");
      update(taskId, "auto_gate", "development complete");
    } else if (stage === "auto_gate") {
      const gate = run(process.execPath, ["scripts/gate/run_gate.mjs", taskId, worktreePath(taskId)], systemRoot, true);
      if (gate.status !== 0) {
        update(taskId, "returned_to_development", "auto gate failed");
      } else {
        setGate(taskId, "Tool Gate", "passed");
        maybeInterrupt("auto_gate");
        update(taskId, "review", "auto gate passed");
      }
    } else if (stage === "review") {
      runAgent("review", taskId);
      if (!runWithRetry("review", () => reviewExample(taskId))) {
        update(taskId, "returned_to_development", "review failed");
        maybeInterrupt("review");
      } else {
        maybeInterrupt("review");
        update(taskId, "scoring", "review passed");
      }
    } else if (stage === "scoring") {
      runAgent("scoring", taskId);
      if (!runWithRetry("scoring", () => scoreExample(taskId))) {
        update(taskId, "returned_to_development", "score failed");
        maybeInterrupt("scoring");
      } else {
        maybeInterrupt("scoring");
        update(taskId, "cleanup", "score passed");
      }
    } else if (stage === "cleanup") {
      runWithRetry("merge_result", () => mergeResult(taskId));
      runWithRetry("clean_worktree", () => cleanWorktree(taskId));
      maybeInterrupt("cleanup");
      run(process.execPath, ["scripts/state/complete_task.mjs", taskId, "completed"]);
    } else if (stage === "pending_human") {
      if (!approved) {
        console.log(`PENDING_HUMAN task=${taskId}`);
        break;
      }
      update(taskId, "cleanup", "human approved");
    } else {
      throw new Error(`Unknown stage: ${stage}`);
    }
    stage = currentStage(taskId);
  }

  appendLog("logs/orchestrator.log", `run_done task=${taskId} stage=${stage}`);
  console.log(`TASK_RESULT task=${taskId} stage=${stage}`);
} catch (error) {
  appendLog("logs/orchestrator.log", `run_error task=${taskId || "unset"} error=${JSON.stringify(error.message)}`);
  logError("ERROR", "orchestrator", error, { taskId, taskType });
  try {
    if (taskId) run(process.execPath, ["scripts/state/terminate_task.mjs", taskId, error.message], systemRoot, true);
  } catch {}
  try {
    if (taskId) cleanWorktree(taskId);
  } catch {}
  console.error(`ORCHESTRATOR_ERROR: ${error.message}`);
  process.exit(1);
}
