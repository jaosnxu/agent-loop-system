#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { appendLog, systemRoot } from "../lib/common.mjs";

const [htmlPath, reportPath = ""] = process.argv.slice(2);

function staticFallback(file) {
  const html = fs.readFileSync(file, "utf8");
  const checks = [
    ["html present", html.includes("<html")],
    ["semantic selectors", html.includes("data-testid")],
    ["interactive script", html.includes("<script") && html.includes("addEventListener")],
    ["russian default", html.includes('lang="ru"') || html.includes("lang='ru'")],
    ["no obvious mojibake", !html.includes("�")]
  ];
  return { mode: "static_fallback", checks };
}

async function playwrightRun(file) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${path.resolve(file)}`);
  const title = await page.locator("body").innerText({ timeout: 3000 });
  const hasTestIds = await page.locator("[data-testid]").count();
  await browser.close();
  return {
    mode: "playwright",
    checks: [
      ["page rendered", title.trim().length > 0],
      ["semantic selectors", hasTestIds > 0]
    ]
  };
}

try {
  if (!htmlPath) throw new Error("Usage: browser_test.mjs HTML_PATH [REPORT_PATH]");
  if (!fs.existsSync(htmlPath)) throw new Error(`HTML not found: ${htmlPath}`);
  let result;
  try {
    result = await playwrightRun(htmlPath);
  } catch (error) {
    result = staticFallback(htmlPath);
    result.fallbackReason = error.message;
  }
  const passed = result.checks.filter(([, ok]) => ok).length;
  const failed = result.checks.length - passed;
  const lines = [
    "# Browser Test Report",
    "",
    `- Mode: ${result.mode}`,
    `- Passed: ${passed}`,
    `- Failed: ${failed}`,
    ...(result.fallbackReason ? [`- Fallback Reason: ${result.fallbackReason}`] : []),
    "",
    "## Checks",
    ...result.checks.map(([name, ok]) => `- ${ok ? "PASS" : "FAIL"} ${name}`),
    ""
  ];
  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, lines.join("\n"));
  }
  appendLog("logs/tool-calls.log", `role=tester tool=browser operation=test target=${JSON.stringify(htmlPath)} result=${failed ? "failed" : "passed"} mode=${result.mode}`);
  console.log(JSON.stringify({ ok: failed === 0, mode: result.mode, passed, failed, reportPath }, null, 2));
  process.exit(failed === 0 ? 0 : 2);
} catch (error) {
  appendLog("logs/error.log", `browser_test_failed target=${JSON.stringify(htmlPath || "")} error=${JSON.stringify(error.message)}`);
  console.error(`BROWSER_TEST_FAILED: ${error.message}`);
  process.exit(1);
}
