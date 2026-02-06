#!/usr/bin/env node
/**
 * Stop Hook - 任務狀態聚合器 (Task State Aggregator)
 *
 * 職責劃分：
 * - routing-completion-validator：驗證路由計劃完成，生成重試指令（enforcement）
 * - completion-check：聚合 .vibe-engine/ 中各種狀態，生成整合完成摘要（aggregation）
 * - verification-engine：執行代碼驗證、auto-fix loop（quality）
 * - auto-progress：更新 PROGRESS.md（documentation）
 *
 * 規則：
 * 1. 如果有活躍路由計劃且有 pending tasks → 跳過（讓 routing-completion-validator 處理）
 * 2. 如果有活躍 auto-fix → 跳過（讓 verification-engine 處理）
 * 3. 否則，讀取各狀態檔案，提供整合的完成摘要
 * 4. 永遠不阻止（continue: true），只提供資訊性 systemMessage
 *
 * 對應章節：Ch2 閉環驗證
 */

const path = require('path');
const fs = require('fs');
const { readHookInput, writeHookOutput, buildSuccessOutput } = require('./lib/hook-io');
const { RoutingStateManager } = require('./lib/routing-state-manager');
const { getVibeEnginePaths, safeReadJSON } = require('./lib/common');

// ============================================================
// 狀態聚合
// ============================================================

/**
 * 聚合所有 .vibe-engine/ 狀態
 * @returns {{ routing, autoFix, budget, tasks }}
 */
function aggregateTaskState() {
  const paths = getVibeEnginePaths();
  const summary = {
    routing: null,
    autoFix: null,
    budget: null,
    tasks: null
  };

  // 1. 路由狀態
  try {
    const rsm = new RoutingStateManager();
    summary.routing = rsm.getSummary();
  } catch { /* ignore */ }

  // 2. Auto-Fix 狀態
  const autoFixPath = path.join(paths.root, 'auto-fix-state.json');
  summary.autoFix = safeReadJSON(autoFixPath, { active: false });

  // 3. 預算
  summary.budget = safeReadJSON(paths.budget, null);

  // 4. 任務檔案統計
  try {
    if (fs.existsSync(paths.tasks)) {
      const taskFiles = fs.readdirSync(paths.tasks).filter(f => f.endsWith('.yaml'));
      summary.tasks = { count: taskFiles.length };
    }
  } catch { /* ignore */ }

  return summary;
}

/**
 * 判斷是否讓其他 hook 處理
 * @param {object} summary - aggregateTaskState 的結果
 * @returns {{ defer: boolean, reason: string, handler: string }}
 */
function shouldDefer(summary) {
  // 活躍路由且有 pending → 讓 routing-completion-validator 處理
  if (summary.routing?.hasActivePlan && summary.routing?.pendingCount > 0) {
    return { defer: true, reason: 'active_routing', handler: 'routing-completion-validator' };
  }

  // 活躍 auto-fix → 讓 verification-engine 處理
  if (summary.autoFix?.active) {
    return { defer: true, reason: 'active_autofix', handler: 'verification-engine' };
  }

  return { defer: false, reason: '', handler: '' };
}

/**
 * 生成資訊性完成摘要
 * @param {object} summary - aggregateTaskState 的結果
 * @returns {string}
 */
function generateCompletionSummary(summary) {
  const lines = ['[Completion Summary]'];

  if (summary.routing?.planId) {
    const r = summary.routing;
    lines.push(`  Routing: ${r.status} (${r.progress})`);
  }

  if (summary.budget) {
    const cost = summary.budget.totalCost || summary.budget.cost || 0;
    lines.push(`  Budget: $${Number(cost).toFixed(2)} used`);
  }

  if (summary.tasks?.count > 0) {
    lines.push(`  Task files: ${summary.tasks.count}`);
  }

  return lines.join('\n');
}

// ============================================================
// Hook 入口
// ============================================================

async function main() {
  const { isHook } = await readHookInput();

  if (!isHook) {
    writeHookOutput(buildSuccessOutput({ suppressOutput: true }));
    return;
  }

  const summary = aggregateTaskState();
  const deferResult = shouldDefer(summary);

  if (deferResult.defer) {
    writeHookOutput(buildSuccessOutput({
      suppressOutput: true,
      systemMessage: `Active routing plan detected — deferring to ${deferResult.handler}`
    }));
    return;
  }

  const completionMessage = generateCompletionSummary(summary);

  writeHookOutput(buildSuccessOutput({
    systemMessage: completionMessage
  }));
}

// 導出供測試使用
module.exports = {
  aggregateTaskState,
  shouldDefer,
  generateCompletionSummary
};

// 直接執行時作為 hook 腳本
if (require.main === module) {
  main().catch(err => {
    writeHookOutput(buildSuccessOutput({
      suppressOutput: true
    }));
  });
}
