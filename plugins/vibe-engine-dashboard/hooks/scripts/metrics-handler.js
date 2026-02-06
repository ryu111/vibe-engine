#!/usr/bin/env node
/**
 * Metrics Handler - /metrics CLI 入口
 *
 * 讀取 session 指標並渲染摘要
 *
 * 對應章節：Ch7 可觀測性
 */

const { MetricsStore } = require('./lib/metrics-store');
const { renderMetrics } = require('./lib/renderer');

function main() {
  const detail = process.argv.includes('--detail');
  const store = new MetricsStore();
  const stats = store.getStats();

  console.log(renderMetrics(stats, { detail }));
}

module.exports = { main };

if (require.main === module) {
  main();
}
