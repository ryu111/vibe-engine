#!/usr/bin/env node
/**
 * Evolve Handler - /evolve CLI 入口
 *
 * 分析 Instincts 聚類並演化為更高級產物
 *
 * 用法：
 *   node evolve-handler.js [--domain <domain>] [--dry-run] [--threshold <n>]
 *
 * 對應章節：Ch5 記憶系統 - Instinct Evolution
 */

const { getProjectRoot, ensureVibeEngineDirs } = require('./lib/common');
const { InstinctManager } = require('./lib/instinct-manager');

function parseArgs(args) {
  const opts = { domain: null, dryRun: false, threshold: 3 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--domain' && args[i + 1]) {
      opts.domain = args[++i];
    }
    if (args[i] === '--dry-run') {
      opts.dryRun = true;
    }
    if (args[i] === '--threshold' && args[i + 1]) {
      opts.threshold = parseInt(args[++i]) || 3;
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const projectRoot = getProjectRoot();
  const paths = ensureVibeEngineDirs(projectRoot);
  const manager = new InstinctManager(paths.instincts);

  // 查找可演化聚類
  const clusters = opts.domain
    ? manager.findClusters(opts.threshold).filter(c => c.domain === opts.domain)
    : manager.findClusters(opts.threshold);

  const ready = clusters.filter(c => c.avgConfidence >= 0.6);

  if (ready.length === 0) {
    console.log(`Analyzed: ${manager.list().length} instincts`);
    console.log(`Clusters found: 0 (threshold: ${opts.threshold}+, confidence >= 0.6)`);
    console.log(`\nTry: --threshold ${Math.max(1, opts.threshold - 1)} or continue working to accumulate patterns`);
    return;
  }

  console.log(`Clusters ready for evolution: ${ready.length}`);

  for (const cluster of ready) {
    console.log(`\n📁 ${cluster.domain} (${cluster.count} instincts, avg confidence: ${cluster.avgConfidence.toFixed(2)})`);
    console.log(`   → Suggested: ${cluster.suggestedType}`);

    if (!opts.dryRun) {
      const result = manager.evolve(cluster);
      if (result.success) {
        console.log(`   ✅ Created ${result.type}: ${result.name}`);
      } else {
        console.log(`   ❌ ${result.error}`);
      }
    } else {
      console.log(`   (dry-run: would evolve to ${cluster.suggestedType})`);
    }
  }
}

module.exports = { main, parseArgs };

if (require.main === module) {
  main();
}
