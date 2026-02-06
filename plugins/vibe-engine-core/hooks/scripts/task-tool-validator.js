#!/usr/bin/env node
/**
 * Task Tool Validator - Task tool agent 類型驗證
 *
 * 功能：
 * 1. 攔截 Task tool 呼叫
 * 2. 驗證 subagent_type 是否符合路由計劃
 * 3. 不匹配時阻止執行並告知正確的 agent
 * 4. 確保路由計劃被正確遵循
 *
 * 觸發點：
 * - PreToolUse hook（tool_name === 'Task'）
 *
 * 對應章節：Ch1 協調引擎 - Star Topology, Router Not Executor
 */

const path = require('path');
const { readHookInput, writeHookOutput, buildSuccessOutput } = require('./lib/hook-io');
const { getVibeEnginePaths, safeReadJSON } = require('./lib/common');

// ============================================================
// 核心邏輯
// ============================================================

/**
 * 解析 agent type 名稱
 * @param {string} subagentType - Task tool 的 subagent_type 參數
 * @returns {string} 解析後的 agent 類型
 * @example
 *   "vibe-engine-core:developer" → "developer"
 *   "developer" → "developer"
 */
function parseAgentType(subagentType) {
  if (!subagentType) return '';

  // 支援 "plugin:agent" 格式，取最後一個部分
  const parts = subagentType.split(':');
  return parts[parts.length - 1].toLowerCase().trim();
}

/**
 * 從路由狀態中提取預期的 agent 列表
 * @param {object} routingState - routing-state.json 內容
 * @returns {string[]} pending/executing 任務的 agent 類型列表
 */
function getExpectedAgents(routingState) {
  const agents = new Set();

  if (!routingState || !routingState.phases) {
    return [];
  }

  for (const phase of routingState.phases) {
    for (const task of phase.tasks || []) {
      if (task.status === 'pending' || task.status === 'executing') {
        // 標準化 agent 名稱（小寫）
        agents.add(parseAgentType(task.agent));
      }
    }
  }

  return Array.from(agents);
}

/**
 * 讀取並驗證路由狀態
 * @param {string} projectRoot - 專案根目錄
 * @returns {object|null} { state, expectedAgents } or null
 */
function checkRoutingState(projectRoot = null) {
  const paths = getVibeEnginePaths(projectRoot);
  const routingState = safeReadJSON(path.join(paths.root, 'routing-state.json'), null);

  if (!routingState) {
    return null;
  }

  // 檢查狀態是否為活躍中
  if (routingState.status !== 'pending' && routingState.status !== 'in_progress') {
    return null;
  }

  const expectedAgents = getExpectedAgents(routingState);

  if (expectedAgents.length === 0) {
    return null;
  }

  return {
    state: routingState,
    expectedAgents
  };
}

/**
 * 驗證 Task tool 的 agent 類型
 * @param {object} hookInput - PreToolUse hook 輸入
 * @returns {object} { valid, actualAgent, expectedAgents, routingInfo }
 */
function validateTaskAgent(hookInput) {
  const toolName = hookInput.tool_name || '';

  // 只處理 Task tool
  if (toolName !== 'Task') {
    return {
      valid: true,
      reason: 'Not a Task tool'
    };
  }

  // 提取 subagent_type 參數
  const toolInput = hookInput.tool_input || {};
  const subagentType = toolInput.subagent_type || '';
  const actualAgent = parseAgentType(subagentType);

  if (!actualAgent) {
    // 沒有指定 agent，允許（可能是其他用途）
    return {
      valid: true,
      reason: 'No subagent_type specified'
    };
  }

  // 檢查路由狀態
  const routingInfo = checkRoutingState();

  if (!routingInfo) {
    // 沒有活躍的路由計劃，允許
    return {
      valid: true,
      reason: 'No active routing plan'
    };
  }

  const { state, expectedAgents } = routingInfo;

  // 驗證 agent 類型是否匹配
  const isValid = expectedAgents.includes(actualAgent);

  return {
    valid: isValid,
    actualAgent,
    expectedAgents,
    planId: state.planId,
    reason: isValid
      ? `Agent ${actualAgent} matches routing plan`
      : `Agent mismatch: ${actualAgent} not in expected [${expectedAgents.join(', ')}]`
  };
}

/**
 * 生成 agent 不匹配的阻止訊息
 * @param {object} info - { actualAgent, expectedAgents, planId }
 * @returns {string}
 */
function buildAgentMismatchMessage(info) {
  const { actualAgent, expectedAgents, planId } = info;

  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║  ⛔ Task Agent 驗證失敗 - Agent Type Mismatch                     ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  路由計劃指定的 agent 與 Task tool 呼叫不匹配                      ║`,
    '║  請使用正確的 agent 類型                                          ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Routing Plan ID: ${planId.padEnd(48)}║`,
    `║  實際使用: ${actualAgent.padEnd(52)}║`,
    `║  預期使用: ${expectedAgents.join(', ').padEnd(52)}║`,
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
    '### 正確做法',
    '',
    '使用路由計劃中指定的 agent：',
    '```'
  ];

  // 為每個預期的 agent 生成範例
  for (const agent of expectedAgents) {
    lines.push(
      `Task({`,
      `  subagent_type: "vibe-engine-core:${agent}",`,
      `  description: "執行 ${agent} 負責的任務",`,
      `  prompt: "完成指定的任務...",`,
      `  model: "sonnet"`,
      `})`
    );
    if (expectedAgents.length > 1 && agent !== expectedAgents[expectedAgents.length - 1]) {
      lines.push('');
      lines.push('或');
      lines.push('');
    }
  }

  lines.push(
    '```',
    '',
    `⛔ **使用 "${actualAgent}" 不符合路由計劃，請使用 [${expectedAgents.join(', ')}] 其中之一**`,
    ''
  );

  return lines.join('\n');
}

// ============================================================
// 主流程
// ============================================================

/**
 * 主函數
 */
async function main() {
  const { hookInput, hookType } = await readHookInput();

  if (!hookInput || hookType !== 'PreToolUse') {
    // 不是 PreToolUse hook 或無法解析：預設允許
    writeHookOutput(buildSuccessOutput({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow'
      }
    }));
    return;
  }

  // 驗證 Task tool agent
  const result = validateTaskAgent(hookInput);

  if (result.valid) {
    // 允許執行
    writeHookOutput(buildSuccessOutput({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow'
      }
    }));
    return;
  }

  // 阻止執行
  const denyMessage = buildAgentMismatchMessage({
    actualAgent: result.actualAgent,
    expectedAgents: result.expectedAgents,
    planId: result.planId
  });

  writeHookOutput({
    continue: false,
    suppressOutput: false,
    systemMessage: denyMessage,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: result.reason
    }
  });
}

// ============================================================
// 導出 & 執行
// ============================================================

module.exports = {
  parseAgentType,
  getExpectedAgents,
  checkRoutingState,
  validateTaskAgent,
  buildAgentMismatchMessage
};

if (require.main === module) {
  main().catch(error => {
    // 錯誤時預設允許（fail-safe）
    writeHookOutput(buildSuccessOutput({
      systemMessage: `[Task Tool Validator] Error: ${error.message}`,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: `Error: ${error.message}`
      }
    }));
  });
}
