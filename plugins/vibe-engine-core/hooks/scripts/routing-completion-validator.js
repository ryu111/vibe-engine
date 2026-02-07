#!/usr/bin/env node
/**
 * Routing Completion Validator - 路由完成驗證器
 *
 * 功能：
 * 1. 在 Stop hook 中驗證路由計劃是否完成
 * 2. 如果未完成，注入強制繼續指令
 * 3. 追蹤重試次數，超過上限則報告失敗
 *
 * 觸發點：
 * - Stop hook（在 completion-check 之前）
 *
 * 對應章節：Ch1 協調引擎 - 閉環驗證
 */

const { RoutingStateManager } = require('./lib/routing-state-manager');
const { readHookInput, writeHookOutput, buildSuccessOutput } = require('./lib/hook-io');

/**
 * 檢查 Claude 的回覆中是否有完成標記
 */
function hasCompletionMarker(transcriptSummary, planId) {
  if (!transcriptSummary || !planId) return false;

  // 檢查 [Routing Complete: xxx] 標記
  const pattern = new RegExp(`\\[Routing Complete:\\s*${planId}\\]`, 'i');
  return pattern.test(transcriptSummary);
}

/**
 * 檢查是否有 Task tool 調用的證據
 */
function hasTaskToolUsage(hookInput) {
  // Stop hook 的輸入中可能包含工具使用資訊
  // 這需要根據實際的 hook 輸入格式調整
  const stopReason = hookInput.reason || '';
  const transcriptSummary = hookInput.transcript_summary || '';

  // 簡單檢查：是否提到了 agent 或 Task
  const agentPatterns = [
    /architect/i, /developer/i, /tester/i, /reviewer/i, /explorer/i,
    /Task\s*\(/i, /subagent_type/i
  ];

  return agentPatterns.some(p => p.test(transcriptSummary) || p.test(stopReason));
}

/**
 * 生成強制繼續指令
 */
function generateContinueDirective(pendingTasks, planId, retryInfo) {
  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║  🔄 ROUTING INCOMPLETE - 必須繼續執行                             ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Plan ID: ${planId.padEnd(53)}║`,
    `║  Retry: ${retryInfo.currentRetry}/${retryInfo.maxRetries}`.padEnd(65) + '║',
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
    '### 未執行的任務',
    ''
  ];

  // 列出未完成任務（最多顯示 5 個）
  const tasksToShow = pendingTasks.slice(0, 5);
  tasksToShow.forEach((task, i) => {
    lines.push(`${i + 1}. **[${task.agent}]** ${task.description}`);
  });

  if (pendingTasks.length > 5) {
    lines.push(`... 還有 ${pendingTasks.length - 5} 個任務`);
  }

  lines.push('');
  lines.push('### 必須立即執行');
  lines.push('');

  // 生成 Task 調用範例
  const firstTask = pendingTasks[0];
  if (firstTask) {
    lines.push('```');
    lines.push(`Task({`);
    lines.push(`  subagent_type: "vibe-engine-core:${firstTask.agent}",`);
    lines.push(`  description: "${firstTask.description.slice(0, 40)}...",`);
    lines.push(`  prompt: "${firstTask.description}"`);
    lines.push(`})`);
    lines.push('```');
  }

  lines.push('');
  lines.push('⛔ **不可跳過。不可說「你可以手動執行」。必須現在執行。**');
  lines.push(`⛔ **完成後標記: \`[Routing Complete: ${planId}]\`**`);
  lines.push('');

  return lines.join('\n');
}

/**
 * 生成失敗報告
 */
function generateFailureReport(pendingTasks, planId, retryInfo) {
  return [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║  ❌ ROUTING FAILED - 路由執行失敗                                 ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Plan ID: ${planId.padEnd(53)}║`,
    `║  Retries exhausted: ${retryInfo.maxRetries}/${retryInfo.maxRetries}`.padEnd(65) + '║',
    `║  Pending tasks: ${pendingTasks.length}`.padEnd(65) + '║',
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
    '路由計劃未能完成，已達到最大重試次數。',
    '',
    '未完成任務：',
    ...pendingTasks.slice(0, 3).map(t => `- [${t.agent}] ${t.description}`),
    '',
    '可能原因：',
    '1. 任務過於複雜，需要人工介入',
    '2. 存在阻塞性錯誤',
    '3. 預算不足',
    '',
    '建議：手動檢查並決定下一步行動。',
    ''
  ].join('\n');
}

/**
 * 主流程 — 簡化版
 * ralph-wiggum 的 Stop hook 負責阻止 Claude 停止
 * 此 hook 只負責：
 * 1. 檢查 routing state 並提供資訊
 * 2. 在所有任務完成時清理 routing state
 */
async function main() {
  const { hookInput, isHook } = await readHookInput();

  // 非 hook 模式
  if (!isHook) {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      reason: 'Not running as hook'
    }));
    return;
  }

  const cwd = hookInput.cwd || process.cwd();
  const routingManager = new RoutingStateManager(cwd);

  // 沒有活躍計劃 → 放行
  if (!routingManager.hasActivePlan()) {
    writeHookOutput(buildSuccessOutput({
      suppressOutput: true
    }));
    return;
  }

  const state = routingManager.load();
  const planId = state.planId;
  const summary = routingManager.getSummary();

  // 檢查未完成任務
  const pendingTasks = routingManager.getPendingTasks();

  if (pendingTasks.length === 0) {
    // 所有任務完成 — 清理 routing state
    routingManager.markPlanCompleted();
    writeHookOutput(buildSuccessOutput({
      suppressOutput: false,
      systemMessage: `✅ Routing plan ${planId} completed. ${summary.completedCount}/${summary.totalCount} tasks done. Output <promise>ROUTING_COMPLETE</promise> to finish.`
    }));
    return;
  }

  // 有未完成任務 — 提供資訊（ralph-wiggum 負責阻擋停止）
  const taskList = pendingTasks.slice(0, 5).map((t, i) =>
    `${i + 1}. [${t.agent}] ${t.description}`
  ).join('\n');

  writeHookOutput(buildSuccessOutput({
    suppressOutput: false,
    systemMessage: `🔄 [Routing] ${pendingTasks.length} tasks remaining (${summary.completedCount}/${summary.totalCount} done). Ralph loop will continue.\n\n${taskList}`
  }));
}

// 導出供測試
module.exports = {
  hasCompletionMarker,
  hasTaskToolUsage,
  generateContinueDirective,
  generateFailureReport
};

// 執行
if (require.main === module) {
  main().catch(err => {
    console.error('[Routing Validator Error]', err.message);
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));
  });
}
