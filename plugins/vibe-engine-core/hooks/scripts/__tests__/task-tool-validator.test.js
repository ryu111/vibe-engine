/**
 * Task Tool Validator - 單元測試
 *
 * 測試場景：
 * 1. 非 Task tool → allow
 * 2. Task tool 但無 routing → allow
 * 3. Task tool agent 匹配 → allow
 * 4. Task tool agent 不匹配 → deny
 * 5. 解析 plugin:agent 格式
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  parseAgentType,
  getExpectedAgents,
  checkRoutingState,
  validateTaskAgent,
  buildAgentMismatchMessage
} = require('../task-tool-validator');

// ============================================================
// 測試工具
// ============================================================

function assert(condition, message, details = '') {
  if (!condition) {
    throw new Error(`❌ ${message}${details ? ` | ${details}` : ''}`);
  }
}

function createTempDir() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-validator-test-'));
  const vibeDir = path.join(tempDir, '.vibe-engine');
  fs.mkdirSync(vibeDir, { recursive: true });
  return { tempDir, vibeDir };
}

function cleanup(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeRoutingState(vibeDir, state) {
  fs.writeFileSync(
    path.join(vibeDir, 'routing-state.json'),
    JSON.stringify(state, null, 2)
  );
}

// ============================================================
// 測試套件
// ============================================================

console.log('🧪 Task Tool Validator 測試\n');

// ── Test 1: parseAgentType ──
console.log('📋 Test 1: parseAgentType 解析');
try {
  assert(
    parseAgentType('developer') === 'developer',
    'T1.1 簡單名稱',
    `got: ${parseAgentType('developer')}`
  );

  assert(
    parseAgentType('vibe-engine-core:developer') === 'developer',
    'T1.2 plugin:agent 格式',
    `got: ${parseAgentType('vibe-engine-core:developer')}`
  );

  assert(
    parseAgentType('  Architect  ') === 'architect',
    'T1.3 大小寫 + 空白',
    `got: ${parseAgentType('  Architect  ')}`
  );

  assert(
    parseAgentType('') === '',
    'T1.4 空字串',
    `got: ${parseAgentType('')}`
  );

  console.log('✅ Test 1 通過\n');
} catch (e) {
  console.error(e.message + '\n');
  process.exit(1);
}

// ── Test 2: getExpectedAgents ──
console.log('📋 Test 2: getExpectedAgents 提取');
try {
  const state = {
    planId: 'test-plan',
    status: 'in_progress',
    phases: [
      {
        phase: 1,
        tasks: [
          { id: 't1', agent: 'developer', status: 'pending' },
          { id: 't2', agent: 'tester', status: 'pending' }
        ]
      },
      {
        phase: 2,
        tasks: [
          { id: 't3', agent: 'developer', status: 'completed' },
          { id: 't4', agent: 'reviewer', status: 'executing' }
        ]
      }
    ]
  };

  const agents = getExpectedAgents(state);

  assert(
    agents.length === 3,
    'T2.1 提取 3 個 agent',
    `got: ${agents.length}`
  );

  assert(
    agents.includes('developer'),
    'T2.2 包含 developer',
    `agents: ${agents.join(', ')}`
  );

  assert(
    agents.includes('tester'),
    'T2.3 包含 tester',
    `agents: ${agents.join(', ')}`
  );

  assert(
    agents.includes('reviewer'),
    'T2.4 包含 reviewer (executing)',
    `agents: ${agents.join(', ')}`
  );

  assert(
    !agents.includes('architect'),
    'T2.5 不包含 completed 任務的 agent',
    `agents: ${agents.join(', ')}`
  );

  console.log('✅ Test 2 通過\n');
} catch (e) {
  console.error(e.message + '\n');
  process.exit(1);
}

// ── Test 3: checkRoutingState ──
console.log('📋 Test 3: checkRoutingState 讀取');
const { tempDir: td3, vibeDir: vd3 } = createTempDir();
try {
  process.env.CLAUDE_PROJECT_ROOT = td3;

  // 3.1 無 routing-state.json
  const noState = checkRoutingState(td3);
  assert(
    noState === null,
    'T3.1 無 routing-state → null',
    `got: ${noState}`
  );

  // 3.2 有活躍路由
  writeRoutingState(vd3, {
    planId: 'test-plan',
    status: 'in_progress',
    phases: [
      {
        phase: 1,
        tasks: [
          { id: 't1', agent: 'developer', status: 'pending' }
        ]
      }
    ]
  });

  const activeState = checkRoutingState(td3);
  assert(
    activeState !== null,
    'T3.2 有活躍路由',
    `got: ${activeState}`
  );

  assert(
    activeState.expectedAgents.includes('developer'),
    'T3.3 提取到 developer',
    `agents: ${activeState.expectedAgents.join(', ')}`
  );

  // 3.3 completed 路由
  writeRoutingState(vd3, {
    planId: 'test-plan',
    status: 'completed',
    phases: [
      {
        phase: 1,
        tasks: [
          { id: 't1', agent: 'developer', status: 'completed' }
        ]
      }
    ]
  });

  const completedState = checkRoutingState(td3);
  assert(
    completedState === null,
    'T3.4 completed 路由 → null',
    `got: ${completedState}`
  );

  console.log('✅ Test 3 通過\n');
} catch (e) {
  console.error(e.message + '\n');
  process.exit(1);
} finally {
  cleanup(td3);
  delete process.env.CLAUDE_PROJECT_ROOT;
}

// ── Test 4: validateTaskAgent - allow cases ──
console.log('📋 Test 4: validateTaskAgent - allow 場景');
const { tempDir: td4, vibeDir: vd4 } = createTempDir();
try {
  process.env.CLAUDE_PROJECT_ROOT = td4;

  // 4.1 非 Task tool
  const result1 = validateTaskAgent({
    tool_name: 'Write',
    tool_input: {}
  });

  assert(
    result1.valid === true,
    'T4.1 非 Task tool → allow',
    `valid: ${result1.valid}, reason: ${result1.reason}`
  );

  // 4.2 Task tool 但無 routing
  const result2 = validateTaskAgent({
    tool_name: 'Task',
    tool_input: {
      subagent_type: 'developer',
      prompt: 'test'
    }
  });

  assert(
    result2.valid === true,
    'T4.2 Task tool 無 routing → allow',
    `valid: ${result2.valid}, reason: ${result2.reason}`
  );

  // 4.3 Task tool 無 subagent_type
  const result3 = validateTaskAgent({
    tool_name: 'Task',
    tool_input: {
      prompt: 'test'
    }
  });

  assert(
    result3.valid === true,
    'T4.3 無 subagent_type → allow',
    `valid: ${result3.valid}, reason: ${result3.reason}`
  );

  console.log('✅ Test 4 通過\n');
} catch (e) {
  console.error(e.message + '\n');
  process.exit(1);
} finally {
  cleanup(td4);
  delete process.env.CLAUDE_PROJECT_ROOT;
}

// ── Test 5: validateTaskAgent - match ──
console.log('📋 Test 5: validateTaskAgent - agent 匹配');
const { tempDir: td5, vibeDir: vd5 } = createTempDir();
try {
  process.env.CLAUDE_PROJECT_ROOT = td5;

  writeRoutingState(vd5, {
    planId: 'test-plan',
    status: 'in_progress',
    phases: [
      {
        phase: 1,
        tasks: [
          { id: 't1', agent: 'developer', status: 'pending' },
          { id: 't2', agent: 'tester', status: 'executing' }
        ]
      }
    ]
  });

  // 5.1 匹配 developer
  const result1 = validateTaskAgent({
    tool_name: 'Task',
    tool_input: {
      subagent_type: 'vibe-engine-core:developer',
      prompt: 'test'
    }
  });

  assert(
    result1.valid === true,
    'T5.1 匹配 developer → allow',
    `valid: ${result1.valid}, actualAgent: ${result1.actualAgent}`
  );

  // 5.2 匹配 tester
  const result2 = validateTaskAgent({
    tool_name: 'Task',
    tool_input: {
      subagent_type: 'tester',
      prompt: 'test'
    }
  });

  assert(
    result2.valid === true,
    'T5.2 匹配 tester → allow',
    `valid: ${result2.valid}, actualAgent: ${result2.actualAgent}`
  );

  console.log('✅ Test 5 通過\n');
} catch (e) {
  console.error(e.message + '\n');
  process.exit(1);
} finally {
  cleanup(td5);
  delete process.env.CLAUDE_PROJECT_ROOT;
}

// ── Test 6: validateTaskAgent - mismatch ──
console.log('📋 Test 6: validateTaskAgent - agent 不匹配');
const { tempDir: td6, vibeDir: vd6 } = createTempDir();
try {
  process.env.CLAUDE_PROJECT_ROOT = td6;

  writeRoutingState(vd6, {
    planId: 'test-plan-123',
    status: 'in_progress',
    phases: [
      {
        phase: 1,
        tasks: [
          { id: 't1', agent: 'developer', status: 'pending' }
        ]
      }
    ]
  });

  // 6.1 使用 architect（不在計劃中）
  const result1 = validateTaskAgent({
    tool_name: 'Task',
    tool_input: {
      subagent_type: 'vibe-engine-core:architect',
      prompt: 'test'
    }
  });

  assert(
    result1.valid === false,
    'T6.1 不匹配 architect → deny',
    `valid: ${result1.valid}`
  );

  assert(
    result1.actualAgent === 'architect',
    'T6.2 actualAgent 正確',
    `got: ${result1.actualAgent}`
  );

  assert(
    result1.expectedAgents.includes('developer'),
    'T6.3 expectedAgents 包含 developer',
    `got: ${result1.expectedAgents.join(', ')}`
  );

  assert(
    result1.planId === 'test-plan-123',
    'T6.4 planId 正確',
    `got: ${result1.planId}`
  );

  console.log('✅ Test 6 通過\n');
} catch (e) {
  console.error(e.message + '\n');
  process.exit(1);
} finally {
  cleanup(td6);
  delete process.env.CLAUDE_PROJECT_ROOT;
}

// ── Test 7: buildAgentMismatchMessage ──
console.log('📋 Test 7: buildAgentMismatchMessage 訊息生成');
try {
  const message = buildAgentMismatchMessage({
    actualAgent: 'architect',
    expectedAgents: ['developer', 'tester'],
    planId: 'test-plan-456'
  });

  assert(
    message.includes('test-plan-456'),
    'T7.1 包含 planId',
    'planId not found in message'
  );

  assert(
    message.includes('architect'),
    'T7.2 包含 actualAgent',
    'actualAgent not found in message'
  );

  assert(
    message.includes('developer'),
    'T7.3 包含 expectedAgent developer',
    'developer not found in message'
  );

  assert(
    message.includes('tester'),
    'T7.4 包含 expectedAgent tester',
    'tester not found in message'
  );

  assert(
    message.includes('subagent_type'),
    'T7.5 包含正確用法範例',
    'example not found in message'
  );

  console.log('✅ Test 7 通過\n');
} catch (e) {
  console.error(e.message + '\n');
  process.exit(1);
}

// ============================================================
// 總結
// ============================================================

console.log('🎉 所有測試通過！');
console.log('\n測試覆蓋：');
console.log('  ✓ parseAgentType 解析各種格式');
console.log('  ✓ getExpectedAgents 從 routing-state 提取');
console.log('  ✓ checkRoutingState 讀取和過濾');
console.log('  ✓ validateTaskAgent allow 場景');
console.log('  ✓ validateTaskAgent agent 匹配');
console.log('  ✓ validateTaskAgent agent 不匹配');
console.log('  ✓ buildAgentMismatchMessage 訊息生成');
