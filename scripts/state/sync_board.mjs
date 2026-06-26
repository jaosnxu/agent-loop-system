#!/usr/bin/env node
import { appendLog } from "../lib/common.mjs";
import { syncBoard } from "./sync_board_lib.mjs";

try {
  syncBoard();
  appendLog("logs/state.log", "task_board_synced");
  console.log("TASK_BOARD_SYNCED");
} catch (error) {
  appendLog("logs/state.log", `task_board_sync_failed error=${JSON.stringify(error.message)}`);
  console.error(`TASK_BOARD_SYNC_FAILED: ${error.message}`);
  process.exit(1);
}
