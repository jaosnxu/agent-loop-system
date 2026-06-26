import { appendLog } from "./common.mjs";

export function logToolCall({ role, tool, operation, target, result }) {
  appendLog("logs/tool-calls.log", `role=${role} tool=${tool} operation=${operation} target=${JSON.stringify(target)} result=${result}`);
}
