#!/usr/bin/env node
/**
 * Routing Progress Tracker - 追蹤 Task tool 完成進度
 *
 * 功能：
 * 1. 監聽 Task tool 執行結果（PostToolUse hook）
 * 2. 自動更新 routing-state.json 中對應任務狀態
 * 3. Task 成功 → markTaskCompleted
 * 4. Task 失敗 → markTaskFailed
 * 5. 所有任務完成 → markPlanCompleted
 *
 * 觸發點：
 * - PostToolUse hook（只處理 tool_name === 'Task'）
 *
 * 對應章節：Ch1 協調引擎 - 自動路由
 */

const { readHookInput, writeHookOutput, buildSuccessOutput } = require('./lib/hook-io');
const { getProjectRoot } = require('./lib/common');
const { RoutingStateManager } = require('./lib/routing-state-manager');

// ============================================================
// Agent 名稱解析
// ============================================================

/**
 * 從 subagent_type 字串解析 agent 名稱
 * @param {string} subagentType - 格式：'vibe-engine-core:developer' 或 'developer'
 * @returns {string} agent 名稱（小寫）
 */
function parseAgentType(subagentType) {
  if (!subagentType) return '';

  // 移除 plugin 前綴（如果有）
  const parts = subagentType.split(':');
  const agentName = parts.length > 1 ? parts[1] : parts[0];

  return agentName.toLowerCase().trim();
}

// ============================================================
// 任務匹配
// ============================================================

/**
 * 根據 agent 名稱找到第一個待處理的任務
 * @param {object} state - routing state
 * @param {string} agentName - agent 名稱
 * @returns {string|null} taskId 或 null
 */
function findMatchingTask(state, agentName) {
  if (!state || !state.phases || !agentName) {
    return null;
  }

  // 遍歷所有 phase 和任務
  for (const phase of state.phases) {
    for (const task of phase.tasks || []) {
      // 匹配條件：
      // 1. 任務狀態是 pending 或 executing
      // 2. agent 名稱匹配（不區分大小寫）
      if ((task.status === 'pending' || task.status === 'executing') &&
          task.agent.toLowerCase() === agentName) {
        return task.id;
      }
    }
  }

  return null;
}

// ============================================================
// 完成度檢查
// ============================================================

/**
 * 檢查是否所有任務都已完成或失敗
 * @param {object} state - routing state
 * @returns {boolean}
 */
function areAllTasksDone(state) {
  if (!state || !state.phases || state.phases.length === 0) {
    return false;
  }

  let hasAnyTask = false;

  for (const phase of state.phases) {
    for (const task of phase.tasks || []) {
      hasAnyTask = true;
      if (task.status !== 'completed' && task.status !== 'failed') {
        return false;
      }
    }
  }

  // 如果沒有任何任務，返回 false
  return hasAnyTask;
}

// ============================================================
// 核心追蹤邏輯
// ============================================================

/**
 * 追蹤 Task 完成進度並更新 routing-state
 * @param {object} hookInput - PostToolUse hook 輸入
 * @returns {object|null} { taskId, status, allDone } 或 null（不處理）
 */
function trackTaskCompletion(hookInput) {
  // 1. 只處理 Task tool
  if ((hookInput.tool_name || '').toLowerCase() !== 'task') {
    return null;
  }

  // 2. 取得 agent 名稱
  const toolInput = hookInput.tool_input || {};
  const agentName = parseAgentType(toolInput.subagent_type || '');

  if (!agentName) {
    return null;
  }

  // 3. 判斷成功/失敗
  const toolResult = hookInput.tool_result || {};
  const success = !toolResult.error;
  const errorMessage = toolResult.error || 'Task execution failed';

  // 4. 載入 routing-state
  const projectRoot = getProjectRoot();
  const routingManager = new RoutingStateManager(projectRoot);

  if (!routingManager.hasActivePlan()) {
    return null;
  }

  const state = routingManager.load();
  if (!state) {
    return null;
  }

  // 5. 找到匹配的任務
  const targetTaskId = findMatchingTask(state, agentName);

  if (!targetTaskId) {
    // 沒找到匹配任務，可能已完成或不在計劃中
    return null;
  }

  // 6. 更新狀態
  if (success) {
    routingManager.markTaskCompleted(targetTaskId);
  } else {
    routingManager.markTaskFailed(targetTaskId, errorMessage);
  }

  // 7. 檢查是否所有任務完成
  const updatedState = routingManager.load();
  const allDone = areAllTasksDone(updatedState);

  if (allDone) {
    routingManager.markPlanCompleted();
  }

  return {
    taskId: targetTaskId,
    status: success ? 'completed' : 'failed',
    allDone
  };
}

// ============================================================
// 主函數
// ============================================================

async function main() {
  const { hookInput, hookType } = await readHookInput();

  // 不是 PostToolUse hook，直接放行
  if (!hookInput || hookType !== 'PostToolUse') {
    writeHookOutput(buildSuccessOutput({}));
    return;
  }

  try {
    const result = trackTaskCompletion(hookInput);

    if (result) {
      // 追蹤成功，提供進度反饋
      let context;
      if (result.allDone) {
        context = `[Routing Progress] Task ${result.taskId} marked as ${result.status}. All tasks completed. Routing plan finished.`;
      } else {
        context = `[Routing Progress] Task ${result.taskId} marked as ${result.status}.`;
      }

      writeHookOutput(buildSuccessOutput({
        systemMessage: context,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: context
        }
      }));
    } else {
      // 不是 Task tool 或無匹配任務，靜默放行
      writeHookOutput(buildSuccessOutput({}));
    }
  } catch (error) {
    // 錯誤處理：fail-safe，不阻擋執行
    console.error(`[Routing Progress Tracker] Error: ${error.message}`);
    writeHookOutput(buildSuccessOutput({}));
  }
}

// ============================================================
// 導出與執行
// ============================================================

module.exports = {
  parseAgentType,
  findMatchingTask,
  areAllTasksDone,
  trackTaskCompletion
};

if (require.main === module) {
  main().catch(err => {
    console.error(`[Routing Progress Tracker] Fatal error: ${err.message}`);
    writeHookOutput(buildSuccessOutput({}));
  });
}
