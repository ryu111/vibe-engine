#!/usr/bin/env node
/**
 * Routing Enforcer - 強制路由執行
 *
 * 功能：
 * 1. 當 routing-state 指定應委派給 agent 時，阻止 main agent 直接實作
 * 2. 強制使用 Task tool 委派給指定的 agent
 * 3. 實現「Router, Not Executor」原則
 *
 * 觸發點：
 * - PreToolUse hook（Write/Edit/Bash/NotebookEdit 工具）
 *
 * 對應章節：Ch1 協調引擎 - Star Topology
 */

const path = require('path');
const { readHookInput, writeHookOutput, buildSuccessOutput } = require('./lib/hook-io');
const { getVibeEnginePaths, safeReadJSON } = require('./lib/common');

// ============================================================
// 配置
// ============================================================

// 白名單工具（永遠 allow）
const ALLOWED_TOOLS = new Set([
  'Read',           // 唯讀
  'Grep',           // 搜尋
  'Glob',           // 檔案搜尋
  'WebFetch',       // 網頁讀取
  'WebSearch',      // 網頁搜尋
  'Task',           // 委派工具（我們希望 main agent 使用的）
  'TodoWrite',      // 任務管理
  'AskUserQuestion' // 詢問用戶
]);

// 需要檢查的工具（可能違反路由）
const EXECUTION_TOOLS = new Set([
  'Write',        // 直接建檔
  'Edit',         // 直接改檔
  'Bash',         // 可能用來寫檔（echo/cat/sed）
  'NotebookEdit'  // 直接改 notebook
]);

// ============================================================
// 核心邏輯
// ============================================================

// Auto-fix 有效期（5 分鐘）
const AUTO_FIX_TTL = 5 * 60 * 1000;
const MAX_FIX_ITERATIONS = 3;

/**
 * 檢查是否在 auto-fix 模式（verification-engine 自動修復中）
 * @returns {object|null} { iteration, maxIterations } or null
 */
function checkAutoFixMode() {
  const paths = getVibeEnginePaths();
  const state = safeReadJSON(path.join(paths.root, 'auto-fix-state.json'), null);
  if (!state || !state.active) return null;
  if (state.iteration >= MAX_FIX_ITERATIONS) return null;
  if (state.timestamp && Date.now() - state.timestamp > AUTO_FIX_TTL) return null;
  return { iteration: state.iteration, maxIterations: MAX_FIX_ITERATIONS };
}

/**
 * 檢查是否有活躍的路由計劃需要委派
 * @param {string} projectRoot
 * @returns {object|null} { shouldDelegate, delegateTo, planId, taskDescription }
 */
function checkRoutingState(projectRoot) {
  const paths = getVibeEnginePaths(projectRoot);
  const routingState = safeReadJSON(path.join(paths.root, 'routing-state.json'), null);

  if (!routingState) {
    return null;
  }

  // 檢查狀態是否為活躍中
  if (routingState.status !== 'pending' && routingState.status !== 'in_progress') {
    return null;
  }

  // 找到第一個 pending 或 executing 的任務
  for (const phase of routingState.phases || []) {
    for (const task of phase.tasks || []) {
      if (task.status === 'pending' || task.status === 'executing') {
        return {
          shouldDelegate: true,
          delegateTo: task.agent,
          planId: routingState.planId,
          taskId: task.id,
          taskDescription: task.description
        };
      }
    }
  }

  return null;
}

/**
 * 評估是否應該阻止工具使用
 * @param {object} hookInput - PreToolUse hook 輸入
 * @returns {object} { decision: 'allow' | 'deny', reason, delegateTo, planId }
 */
function evaluateRouting(hookInput) {
  const toolName = hookInput.tool_name || '';

  // 白名單工具：直接允許
  if (ALLOWED_TOOLS.has(toolName)) {
    return {
      decision: 'allow',
      reason: `Tool ${toolName} is in whitelist`
    };
  }

  // 非執行工具：允許（預設安全）
  if (!EXECUTION_TOOLS.has(toolName)) {
    return {
      decision: 'allow',
      reason: `Tool ${toolName} is not an execution tool`
    };
  }

  // 檢查 auto-fix 模式（verification-engine 自動修復中 → 放行）
  const autoFixBypass = checkAutoFixMode();
  if (autoFixBypass) {
    return {
      decision: 'allow',
      reason: `Auto-fix mode active (iteration ${autoFixBypass.iteration})`
    };
  }

  // 檢查路由狀態
  const routingInfo = checkRoutingState();

  if (!routingInfo || !routingInfo.shouldDelegate) {
    // 沒有活躍路由計劃：允許
    return {
      decision: 'allow',
      reason: 'No active routing plan'
    };
  }

  // 有活躍路由計劃且指定了委派 agent：阻止
  return {
    decision: 'deny',
    reason: `Task is assigned to ${routingInfo.delegateTo} agent`,
    delegateTo: routingInfo.delegateTo,
    planId: routingInfo.planId,
    taskId: routingInfo.taskId,
    taskDescription: routingInfo.taskDescription
  };
}

/**
 * 生成阻止訊息
 * @param {object} info - { delegateTo, planId, taskDescription }
 * @returns {string}
 */
function buildDenyMessage(info) {
  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║  ⛔ 路由強制 - Routing Enforcement                                ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  此任務已分配給 ${info.delegateTo} agent                             ║`,
    '║  Main agent 不應直接執行實作工作                                   ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    '║  MUST: 使用 Task tool 委派給指定的 agent                           ║',
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
    `**Routing Plan**: ${info.planId}`,
    `**Task ID**: ${info.taskId}`,
    `**Assigned Agent**: ${info.delegateTo}`,
    `**Task**: ${info.taskDescription?.slice(0, 80) || 'N/A'}`,
    '',
    '### 正確做法',
    '',
    '使用 Task tool 委派：',
    '```',
    `Task({`,
    `  subagent_type: "vibe-engine-core:${info.delegateTo}",`,
    `  description: "${info.taskDescription?.slice(0, 40) || 'Complete assigned task'}...",`,
    `  prompt: "${info.taskDescription || 'Execute the assigned task'}",`,
    `  model: "sonnet"`,
    `})`,
    '```',
    '',
    '⛔ **直接使用 Write/Edit/Bash 違反 Router, Not Executor 原則**',
    ''
  ];

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

  // 評估路由
  const result = evaluateRouting(hookInput);

  if (result.decision === 'allow') {
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
  const denyMessage = buildDenyMessage({
    delegateTo: result.delegateTo,
    planId: result.planId,
    taskId: result.taskId,
    taskDescription: result.taskDescription
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
  ALLOWED_TOOLS,
  EXECUTION_TOOLS,
  checkAutoFixMode,
  checkRoutingState,
  evaluateRouting,
  buildDenyMessage
};

if (require.main === module) {
  main().catch(error => {
    // 錯誤時預設允許（fail-safe）
    writeHookOutput(buildSuccessOutput({
      systemMessage: `[Routing Enforcer] Error: ${error.message}`,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: `Error: ${error.message}`
      }
    }));
  });
}
