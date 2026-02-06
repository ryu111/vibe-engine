#!/usr/bin/env node
/**
 * Dashboard Handler - /dashboard CLI 入口
 *
 * 收集系統數據並渲染 Dashboard 面板
 *
 * 對應章節：Ch7 可觀測性
 */

const fs = require('fs');
const path = require('path');
const { renderDashboard } = require('./lib/renderer');
const { MetricsStore } = require('./lib/metrics-store');

function getProjectRoot() {
  let current = process.cwd();
  while (current !== '/') {
    if (fs.existsSync(path.join(current, '.vibe-engine')) ||
        fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

function safeReadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const projectRoot = getProjectRoot();
  const vibeDir = path.join(projectRoot, '.vibe-engine');
  const store = new MetricsStore(projectRoot);

  // 收集數據
  const recentMetrics = store.getRecent(4);
  const stats = store.getStats();
  const budget = safeReadJSON(path.join(vibeDir, 'budget.json'));

  const data = {
    currentTask: budget?.current_task || 'No active task',
    progress: budget?.progress || 0,
    agents: [],
    resources: {
      tokens: { used: budget?.tokens_used || 0, limit: budget?.tokens_limit || 100000 },
      cost: { used: budget?.cost_used || 0, limit: budget?.cost_limit || 1 }
    },
    recentLogs: recentMetrics,
    memoryCount: 0,
    toolCount: stats.totalCalls,
    contextPercent: 0,
    systemOk: true
  };

  console.log(renderDashboard(data));
}

module.exports = { main, safeReadJSON };

if (require.main === module) {
  main();
}
