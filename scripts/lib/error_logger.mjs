import { appendLog } from "./common.mjs";

export function logError(level, scope, error, context = {}) {
  const message = error instanceof Error ? error.message : String(error);
  appendLog("logs/error.log", `level=${level} scope=${scope} message=${JSON.stringify(message)} context=${JSON.stringify(context)}`);
}
