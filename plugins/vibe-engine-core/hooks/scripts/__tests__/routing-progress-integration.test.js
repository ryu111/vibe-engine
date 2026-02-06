#!/usr/bin/env node
/**
 * Routing Progress Tracker - 整合測試
 *
 * 測試完整的 hook 執行流程：
 * 1. 建立 routing-state
 * 2. 模擬 Task tool PostToolUse events
 * 3. 驗證狀態自動更新
 */

const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');

const { RoutingStateManager } = require(path.join(__dirname, '../lib/routing-state-manager'));
const { getProjectRoot, generateId } = require(path.join(__dirname, '../lib/common'));

const HOOK_SCRIPT = path.join(__dirname, '../routing-progress-tracker.js');

// ============================================================
// Helper: 執行 Hook（模擬 Claude Code 呼叫）
// ============================================================

function runHook(hookInput) {
  const input = JSON.stringify(hookInput);
  const result = execSync(`node "${HOOK_SCRIPT}"`, {
    input,
    encoding: 'utf8',
    cwd: getProjectRoot()
  });

  return JSON.parse(result);
}

// ============================================================
// 整合測試
// ============================================================

console.log('\n🔗 Routing Progress Tracker - 整合測試\n');

// 測試 1: 完整任務流程
console.log('📝 測試 1: 完整任務流程（3 個任務）');

const projectRoot = getProjectRoot();
const routingManager = new RoutingStateManager(projectRoot);
routingManager.clear();

// 建立測試計劃
const plan = {
  strategy: 'sequential',
  phases: [
    {
      phase: 1,
      parallel: false,
      tasks: [
        {
          id: generateId('task'),
          agent: 'architect',
          description: 'Design API',
          model: 'opus'
        }
      ]
    },
    {
      phase: 2,
      parallel: true,
      tasks: [
        {
          id: generateId('task'),
          agent: 'developer',
          description: 'Implement feature',
          model: 'sonnet'
        },
        {
          id: generateId('task'),
          agent: 'tester',
          description: 'Write tests',
          model: 'sonnet'
        }
      ]
    }
  ]
};

routingManager.createPlan(plan, 'Build new feature');

// Step 1: 完成 architect 任務
console.log('   ├─ Step 1: 完成 architect 任務');
const hookOutput1 = runHook({
  tool_name: 'Task',
  tool_input: {
    subagent_type: 'vibe-engine-core:architect',
    prompt: 'Design API',
    model: 'opus'
  },
  tool_result: {}
});

assert.strictEqual(hookOutput1.continue, true);
assert(hookOutput1.systemMessage.includes('Task'));

let state = routingManager.load();
assert.strictEqual(state.phases[0].tasks[0].status, 'completed');
assert.strictEqual(state.completedCount, 1);
console.log('   ✅ architect 任務已標記完成');

// Step 2: 完成 developer 任務
console.log('   ├─ Step 2: 完成 developer 任務');
const hookOutput2 = runHook({
  tool_name: 'Task',
  tool_input: {
    subagent_type: 'developer',
    prompt: 'Implement feature',
    model: 'sonnet'
  },
  tool_result: {}
});

assert.strictEqual(hookOutput2.continue, true);
state = routingManager.load();
assert.strictEqual(state.phases[1].tasks[0].status, 'completed');
assert.strictEqual(state.completedCount, 2);
console.log('   ✅ developer 任務已標記完成');

// Step 3: 完成 tester 任務（應標記計劃完成）
console.log('   ├─ Step 3: 完成 tester 任務');
const hookOutput3 = runHook({
  tool_name: 'Task',
  tool_input: {
    subagent_type: 'tester',
    prompt: 'Write tests',
    model: 'sonnet'
  },
  tool_result: {}
});

assert.strictEqual(hookOutput3.continue, true);
assert(hookOutput3.systemMessage.includes('All tasks completed'));
assert(hookOutput3.systemMessage.includes('Routing plan finished'));

state = routingManager.load();
assert.strictEqual(state.phases[1].tasks[1].status, 'completed');
assert.strictEqual(state.completedCount, 3);
assert.strictEqual(state.status, 'completed');
console.log('   ✅ tester 任務已標記完成');
console.log('   ✅ 整體計劃已標記完成');

routingManager.clear();

// 測試 2: 失敗任務處理
console.log('\n📝 測試 2: 失敗任務處理');

const plan2 = {
  strategy: 'sequential',
  phases: [
    {
      phase: 1,
      parallel: false,
      tasks: [
        {
          id: generateId('task'),
          agent: 'tester',
          description: 'Run tests',
          model: 'sonnet'
        }
      ]
    }
  ]
};

routingManager.createPlan(plan2, 'Test execution');

const hookOutputFail = runHook({
  tool_name: 'Task',
  tool_input: {
    subagent_type: 'vibe-engine-core:tester',
    prompt: 'Run tests',
    model: 'sonnet'
  },
  tool_result: {
    error: 'Test suite failed'
  }
});

assert.strictEqual(hookOutputFail.continue, true);
assert(hookOutputFail.systemMessage.includes('failed'));

const failedState = routingManager.load();
assert.strictEqual(failedState.phases[0].tasks[0].status, 'failed');
assert.strictEqual(failedState.phases[0].tasks[0].error, 'Test suite failed');
assert.strictEqual(failedState.failedCount, 1);
assert.strictEqual(failedState.status, 'completed');  // 全部完成（雖然失敗）

console.log('   ✅ 失敗任務正確記錄錯誤訊息');
console.log('   ✅ 失敗計數正確');

routingManager.clear();

// 測試 3: 非 Task tool 應靜默放行
console.log('\n📝 測試 3: 非 Task tool 靜默放行');

const hookOutputRead = runHook({
  tool_name: 'Read',
  tool_input: { file_path: '/test.js' },
  tool_result: { content: 'test content' }
});

assert.strictEqual(hookOutputRead.continue, true);
assert.strictEqual(hookOutputRead.suppressOutput, false);
console.log('   ✅ 非 Task tool 正確放行');

// 測試 4: 無活躍計劃時靜默放行
console.log('\n📝 測試 4: 無活躍計劃時靜默放行');

const hookOutputNoState = runHook({
  tool_name: 'Task',
  tool_input: {
    subagent_type: 'developer',
    prompt: 'Some task'
  },
  tool_result: {}
});

assert.strictEqual(hookOutputNoState.continue, true);
console.log('   ✅ 無活躍計劃時正確放行');

// 測試 5: hookSpecificOutput 格式正確
console.log('\n📝 測試 5: PostToolUse hookSpecificOutput 格式');

const plan3 = {
  strategy: 'sequential',
  phases: [
    {
      phase: 1,
      parallel: false,
      tasks: [
        {
          id: generateId('task'),
          agent: 'developer',
          description: 'Test task',
          model: 'sonnet'
        }
      ]
    }
  ]
};

routingManager.createPlan(plan3, 'Test hookSpecificOutput');

const hookOutputFormat = runHook({
  tool_name: 'Task',
  tool_input: {
    subagent_type: 'developer',
    prompt: 'Test task'
  },
  tool_result: {}
});

assert.strictEqual(hookOutputFormat.continue, true);
assert(hookOutputFormat.hookSpecificOutput);
assert.strictEqual(hookOutputFormat.hookSpecificOutput.hookEventName, 'PostToolUse');
assert(hookOutputFormat.hookSpecificOutput.additionalContext);
console.log('   ✅ hookSpecificOutput 格式符合 PostToolUse schema');

routingManager.clear();

// 完成
console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║              整合測試全部通過 ✅                          ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');
