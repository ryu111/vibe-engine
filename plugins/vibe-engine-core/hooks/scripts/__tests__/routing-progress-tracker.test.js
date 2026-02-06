#!/usr/bin/env node
/**
 * Routing Progress Tracker - 單元測試
 *
 * 測試範圍：
 * 1. parseAgentType - agent 名稱解析
 * 2. findMatchingTask - 任務匹配邏輯
 * 3. areAllTasksDone - 完成度檢查
 * 4. trackTaskCompletion - 完整追蹤流程
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const {
  parseAgentType,
  findMatchingTask,
  areAllTasksDone,
  trackTaskCompletion
} = require(path.join(__dirname, '../routing-progress-tracker'));

const { RoutingStateManager } = require(path.join(__dirname, '../lib/routing-state-manager'));
const { getProjectRoot, generateId } = require(path.join(__dirname, '../lib/common'));

// ============================================================
// 測試 Helper
// ============================================================

let testCounter = 0;

function test(name, fn) {
  try {
    fn();
    testCounter++;
    console.log(`✅ ${testCounter}. ${name}`);
  } catch (error) {
    console.error(`❌ ${testCounter + 1}. ${name}`);
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

function createMockState() {
  return {
    planId: 'route-test-001',
    status: 'in_progress',
    phases: [
      {
        phase: 1,
        parallel: false,
        tasks: [
          {
            id: 'task-001',
            agent: 'architect',
            description: 'Design API',
            status: 'completed'
          }
        ]
      },
      {
        phase: 2,
        parallel: true,
        tasks: [
          {
            id: 'task-002',
            agent: 'developer',
            description: 'Implement feature',
            status: 'executing'
          },
          {
            id: 'task-003',
            agent: 'tester',
            description: 'Write tests',
            status: 'pending'
          }
        ]
      }
    ]
  };
}

// ============================================================
// 測試：parseAgentType
// ============================================================

test('parseAgentType - 標準格式（含 plugin 前綴）', () => {
  assert.strictEqual(parseAgentType('vibe-engine-core:developer'), 'developer');
  assert.strictEqual(parseAgentType('vibe-engine-core:architect'), 'architect');
});

test('parseAgentType - 簡化格式（無前綴）', () => {
  assert.strictEqual(parseAgentType('developer'), 'developer');
  assert.strictEqual(parseAgentType('tester'), 'tester');
});

test('parseAgentType - 空字串/null', () => {
  assert.strictEqual(parseAgentType(''), '');
  assert.strictEqual(parseAgentType(null), '');
  assert.strictEqual(parseAgentType(undefined), '');
});

test('parseAgentType - 大小寫轉換', () => {
  assert.strictEqual(parseAgentType('DEVELOPER'), 'developer');
  assert.strictEqual(parseAgentType('Developer'), 'developer');
});

// ============================================================
// 測試：findMatchingTask
// ============================================================

test('findMatchingTask - 找到 pending 任務', () => {
  const state = createMockState();
  const taskId = findMatchingTask(state, 'tester');
  assert.strictEqual(taskId, 'task-003');
});

test('findMatchingTask - 找到 executing 任務', () => {
  const state = createMockState();
  const taskId = findMatchingTask(state, 'developer');
  assert.strictEqual(taskId, 'task-002');
});

test('findMatchingTask - 不匹配已完成任務', () => {
  const state = createMockState();
  const taskId = findMatchingTask(state, 'architect');
  assert.strictEqual(taskId, null);
});

test('findMatchingTask - agent 不存在', () => {
  const state = createMockState();
  const taskId = findMatchingTask(state, 'nonexistent');
  assert.strictEqual(taskId, null);
});

test('findMatchingTask - 空狀態', () => {
  assert.strictEqual(findMatchingTask(null, 'developer'), null);
  assert.strictEqual(findMatchingTask({ phases: [] }, 'developer'), null);
});

// ============================================================
// 測試：areAllTasksDone
// ============================================================

test('areAllTasksDone - 還有 pending 任務', () => {
  const state = createMockState();
  assert.strictEqual(areAllTasksDone(state), false);
});

test('areAllTasksDone - 還有 executing 任務', () => {
  const state = createMockState();
  state.phases[1].tasks[1].status = 'completed';  // tester 完成
  assert.strictEqual(areAllTasksDone(state), false);  // developer 仍在執行
});

test('areAllTasksDone - 全部完成', () => {
  const state = createMockState();
  state.phases[1].tasks[0].status = 'completed';  // developer 完成
  state.phases[1].tasks[1].status = 'completed';  // tester 完成
  assert.strictEqual(areAllTasksDone(state), true);
});

test('areAllTasksDone - 有失敗任務也算完成', () => {
  const state = createMockState();
  state.phases[1].tasks[0].status = 'failed';
  state.phases[1].tasks[1].status = 'completed';
  assert.strictEqual(areAllTasksDone(state), true);
});

test('areAllTasksDone - 空狀態', () => {
  assert.strictEqual(areAllTasksDone(null), false);
  assert.strictEqual(areAllTasksDone({ phases: [] }), false);
});

// ============================================================
// 測試：trackTaskCompletion（基本邏輯）
// ============================================================

test('trackTaskCompletion - 只處理 Task tool', () => {
  const hookInput = {
    tool_name: 'Read',
    tool_input: { file_path: '/test.js' },
    tool_result: {}
  };
  const result = trackTaskCompletion(hookInput);
  assert.strictEqual(result, null);
});

test('trackTaskCompletion - 缺少 agent 名稱', () => {
  const hookInput = {
    tool_name: 'Task',
    tool_input: {},  // 沒有 subagent_type
    tool_result: {}
  };
  const result = trackTaskCompletion(hookInput);
  assert.strictEqual(result, null);
});

test('trackTaskCompletion - 無活躍計劃時返回 null', () => {
  // 清理可能存在的 routing-state
  const projectRoot = getProjectRoot();
  const routingManager = new RoutingStateManager(projectRoot);
  routingManager.clear();

  const hookInput = {
    tool_name: 'Task',
    tool_input: { subagent_type: 'vibe-engine-core:developer' },
    tool_result: {}
  };

  const result = trackTaskCompletion(hookInput);
  assert.strictEqual(result, null);
});

// ============================================================
// 測試：trackTaskCompletion（完整流程）- 需要實際 routing-state
// ============================================================

test('trackTaskCompletion - 成功完成任務', () => {
  const projectRoot = getProjectRoot();
  const routingManager = new RoutingStateManager(projectRoot);

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
            agent: 'developer',
            description: 'Test task',
            model: 'sonnet'
          }
        ]
      }
    ]
  };

  routingManager.createPlan(plan, 'test request');
  const state = routingManager.load();
  const taskId = state.phases[0].tasks[0].id;

  // 模擬 Task tool 成功
  const hookInput = {
    tool_name: 'Task',
    tool_input: { subagent_type: 'vibe-engine-core:developer' },
    tool_result: {}  // 無 error = 成功
  };

  const result = trackTaskCompletion(hookInput);

  assert(result !== null);
  assert.strictEqual(result.taskId, taskId);
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.allDone, true);  // 只有一個任務

  // 驗證狀態已更新
  const updatedState = routingManager.load();
  assert.strictEqual(updatedState.phases[0].tasks[0].status, 'completed');
  assert.strictEqual(updatedState.status, 'completed');

  // 清理
  routingManager.clear();
});

test('trackTaskCompletion - 失敗任務', () => {
  const projectRoot = getProjectRoot();
  const routingManager = new RoutingStateManager(projectRoot);

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
            agent: 'tester',
            description: 'Run tests',
            model: 'sonnet'
          }
        ]
      }
    ]
  };

  routingManager.createPlan(plan, 'test request');
  const state = routingManager.load();
  const taskId = state.phases[0].tasks[0].id;

  // 模擬 Task tool 失敗
  const hookInput = {
    tool_name: 'Task',
    tool_input: { subagent_type: 'vibe-engine-core:tester' },
    tool_result: { error: 'Tests failed' }
  };

  const result = trackTaskCompletion(hookInput);

  assert(result !== null);
  assert.strictEqual(result.taskId, taskId);
  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(result.allDone, true);

  // 驗證狀態已更新
  const updatedState = routingManager.load();
  assert.strictEqual(updatedState.phases[0].tasks[0].status, 'failed');
  assert.strictEqual(updatedState.phases[0].tasks[0].error, 'Tests failed');

  // 清理
  routingManager.clear();
});

test('trackTaskCompletion - 多任務計劃（部分完成）', () => {
  const projectRoot = getProjectRoot();
  const routingManager = new RoutingStateManager(projectRoot);

  // 建立兩任務計劃
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
            description: 'Design',
            model: 'opus'
          }
        ]
      },
      {
        phase: 2,
        parallel: false,
        tasks: [
          {
            id: generateId('task'),
            agent: 'developer',
            description: 'Implement',
            model: 'sonnet'
          }
        ]
      }
    ]
  };

  routingManager.createPlan(plan, 'test request');

  // 完成第一個任務
  const hookInput1 = {
    tool_name: 'Task',
    tool_input: { subagent_type: 'architect' },
    tool_result: {}
  };

  const result1 = trackTaskCompletion(hookInput1);
  assert(result1 !== null);
  assert.strictEqual(result1.status, 'completed');
  assert.strictEqual(result1.allDone, false);  // 還有第二個任務

  // 完成第二個任務
  const hookInput2 = {
    tool_name: 'Task',
    tool_input: { subagent_type: 'developer' },
    tool_result: {}
  };

  const result2 = trackTaskCompletion(hookInput2);
  assert(result2 !== null);
  assert.strictEqual(result2.status, 'completed');
  assert.strictEqual(result2.allDone, true);  // 全部完成

  // 驗證整體計劃已標記完成
  const finalState = routingManager.load();
  assert.strictEqual(finalState.status, 'completed');

  // 清理
  routingManager.clear();
});

// ============================================================
// 執行測試
// ============================================================

console.log('\n🧪 Routing Progress Tracker - 單元測試\n');
console.log('總共通過測試:', testCounter);
console.log('\n✨ 所有測試通過\n');
