export default {
  intervalMinutes: 30,
  cron: {
    enabled: false,
    expression: "*/30 * * * *"
  },
  paths: {
    heartbeatRules: "HEARTBEAT.md",
    taskBoard: "task-board.md",
    statesDir: "states",
    logFile: "logs/heartbeat.log"
  },
  safety: {
    maxIterationsPerTask: 10,
    maxNoProgressIterations: 3,
    maxToolCallsPerTask: 200,
    maxTokenBudgetPerTask: 200000
  },
  concurrency: {
    maxRunningTasks: 1
  }
};
