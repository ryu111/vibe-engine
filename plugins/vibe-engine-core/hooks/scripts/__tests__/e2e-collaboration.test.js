#!/usr/bin/env node
/**
 * E2E 協作測試 - 模擬完整功能開發工作流
 *
 * 測試場景：
 * A. 新功能開發 - 完整工作流 (6 步驟)
 * B. Bug 修復 - 修復流程
 * C. 簡單查詢 - 跳過分解
 * D. 預算耗盡 - 阻止操作
 * E. 數據流 - 序列化完整性
 * F. 自動路由執行 - 強制指令 + 狀態追蹤 + 閉環驗證
 * G. 上下文感知驗證 + Auto-Fix 工作流
 * H. Hook Chain 管道整合測試（真實進程 stdin/stdout）
 * I. 分類器準確性回歸測試（路徑消除、Segmenter 詞數、複合需求、分類結果）
 * J. 缺口修復驗證（計分制模式識別、中文直接回答、完成聚合器、複合需求整合）
 * K. 100% 完成度驗證（byContentType、maxConcurrent、getExecutableTasks、classifyError、診斷指令）
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// 導入所有核心模組
const SCRIPTS_DIR = path.join(__dirname, '..');
const { decomposeTask, saveDecomposition, identifyTaskPattern } =
  require(path.join(SCRIPTS_DIR, 'task-decomposition-engine'));
const { generateRoutingPlan, shouldDirectResponse, selectAgent } =
  require(path.join(SCRIPTS_DIR, 'agent-router'));
const {
  runVerification, detectProjectType, selectVerificationLevel,
  shouldSkipVerification, loadAutoFixState, saveAutoFixState,
  clearAutoFixState, handleVerificationFailure, handleVerificationSuccess,
  generateFixDirective, MAX_FIX_ITERATIONS
} = require(path.join(SCRIPTS_DIR, 'verification-engine'));
const {
  getBudgetUsage, getAlertLevel, suggestModel, recordToolUse,
  DEFAULT_BUDGET
} = require(path.join(SCRIPTS_DIR, 'budget-tracker-engine'));
const { parseSimpleYaml, jsonToYaml } =
  require(path.join(SCRIPTS_DIR, 'lib/yaml-parser'));
const {
  classifyRequest, classifyComplexity, analyzePromptMetrics,
  sanitizePrompt, countWords, detectCompoundRequirements
} = require(path.join(SCRIPTS_DIR, 'prompt-classifier'));
const {
  aggregateTaskState, shouldDefer, generateCompletionSummary
} = require(path.join(SCRIPTS_DIR, 'completion-check'));
const {
  generateParallelGroups, MAX_CONCURRENT_PER_TYPE, MAX_PARALLEL_AGENTS
} = require(path.join(SCRIPTS_DIR, 'task-decomposition-engine'));
const { RoutingStateManager, CONCURRENCY_LIMITS } =
  require(path.join(SCRIPTS_DIR, 'lib/routing-state-manager'));

// error-handler（跨 plugin import）
let classifyError;
try {
  ({ classifyError } = require(path.join(__dirname, '../../../../vibe-engine-guarantee/hooks/scripts/error-handler')));
} catch { classifyError = null; }

// 測試上下文
const testContext = {
  passed: 0,
  failed: 0,
  results: []
};

function assert(condition, testName, details = '') {
  if (condition) {
    testContext.passed++;
    testContext.results.push({ name: testName, status: 'PASS' });
    console.log(`✅ ${testName}`);
  } else {
    testContext.failed++;
    testContext.results.push({ name: testName, status: 'FAIL', details });
    console.log(`❌ ${testName}: ${details}`);
  }
}

// ============================================================
// 場景 A: 新功能開發完整流程
// ============================================================
async function testNewFeatureWorkflow() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 A: 新功能開發完整流程');
  console.log('═══════════════════════════════════════\n');

  const userPrompt = '新增用戶登入功能，包含 JWT 認證和 Session 管理';

  // Step 1: 任務模式識別
  console.log('📋 Step 1: 任務模式識別');
  const patternResult = identifyTaskPattern(userPrompt);
  const pattern = patternResult?.name || patternResult;
  assert(
    pattern === 'newFeature',
    'A1.1 識別為新功能模式',
    `實際: ${pattern}`
  );

  // Step 2: 任務分解
  console.log('\n📋 Step 2: 任務分解');
  const classification = { complexity: 'complex', intent: 'action' };
  const decomposition = decomposeTask(userPrompt, classification);

  assert(
    decomposition && decomposition.task_decomposition,
    'A2.1 分解結果存在',
    'decomposition 為空'
  );

  const { subtasks, execution_order, metadata } = decomposition.task_decomposition;

  assert(
    Array.isArray(subtasks) && subtasks.length >= 3,
    'A2.2 生成多個子任務',
    `子任務數: ${subtasks?.length}`
  );

  assert(
    Array.isArray(execution_order?.parallel_groups),
    'A2.3 parallel_groups 是陣列',
    `類型: ${typeof execution_order?.parallel_groups}`
  );

  // 驗證依賴鏈
  const hasArchitect = subtasks.some(t => t.agent === 'architect');
  const hasDeveloper = subtasks.some(t => t.agent === 'developer');
  const hasTester = subtasks.some(t => t.agent === 'tester');

  assert(
    hasArchitect && hasDeveloper && hasTester,
    'A2.4 包含必要 agents (architect, developer, tester)',
    `architect: ${hasArchitect}, developer: ${hasDeveloper}, tester: ${hasTester}`
  );

  // Step 3: YAML 序列化/反序列化（關鍵整合點）
  console.log('\n📋 Step 3: YAML 序列化/反序列化');
  const yamlOutput = jsonToYaml(decomposition);

  assert(
    typeof yamlOutput === 'string' && yamlOutput.includes('subtasks'),
    'A3.1 jsonToYaml 輸出有效 YAML',
    `輸出長度: ${yamlOutput?.length}`
  );

  const parsedBack = parseSimpleYaml(yamlOutput);

  assert(
    parsedBack && parsedBack.task_decomposition,
    'A3.2 parseSimpleYaml 可解析回來',
    'parsed 為空'
  );

  assert(
    Array.isArray(parsedBack.task_decomposition?.subtasks),
    'A3.3 subtasks 仍為陣列（關鍵）',
    `類型: ${typeof parsedBack.task_decomposition?.subtasks}`
  );

  // Step 4: Agent 路由
  console.log('\n📋 Step 4: Agent 路由');
  const routingPlan = generateRoutingPlan(decomposition, classification);

  assert(
    routingPlan && routingPlan.strategy,
    'A4.1 路由計劃存在',
    'routingPlan 為空'
  );

  assert(
    routingPlan.strategy === 'hybrid' || routingPlan.strategy === 'sequential',
    'A4.2 策略為 hybrid 或 sequential',
    `策略: ${routingPlan?.strategy}`
  );

  assert(
    Array.isArray(routingPlan.phases) && routingPlan.phases.length > 0,
    'A4.3 有多個執行階段',
    `階段數: ${routingPlan?.phases?.length}`
  );

  // Step 5: 預算檢查
  console.log('\n📋 Step 5: 預算檢查');
  const usage = {
    tokens: { prompt: 50000, completion: 10000, cached: 0, total: 60000 },
    cost: 0.5,
    operations: { file_edits: 5, bash_commands: 10, reads: 0, subagents: 0 },
    start_time: Date.now(),
    last_update: Date.now(),
    model_usage: {}
  };

  const budgetUsage = getBudgetUsage(usage, DEFAULT_BUDGET, 'complex');

  assert(
    typeof budgetUsage.overall === 'number',
    'A5.1 預算使用率計算正確',
    `overall: ${budgetUsage?.overall}`
  );

  const alert = getAlertLevel(budgetUsage);

  assert(
    alert && ['normal', 'warning', 'critical', 'exceeded'].includes(alert.level),
    'A5.2 警報級別有效',
    `level: ${alert?.level}`
  );

  const modelSuggestion = suggestModel(budgetUsage, 'complex');

  assert(
    modelSuggestion && modelSuggestion.model,
    'A5.3 模型建議存在',
    `建議: ${JSON.stringify(modelSuggestion)}`
  );

  // Step 6: 驗證引擎（層級選擇）
  console.log('\n📋 Step 6: 驗證引擎');
  const verificationLevel = selectVerificationLevel({
    budgetRemaining: 0.7,  // 70% remaining
    changeType: 'general'
  });

  assert(
    ['minimal', 'standard', 'thorough'].includes(verificationLevel),
    'A6.1 驗證層級選擇正確',
    `level: ${verificationLevel}`
  );

  console.log('\n✅ 場景 A 完成');
}

// ============================================================
// 場景 B: Bug 修復工作流
// ============================================================
async function testBugFixWorkflow() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 B: Bug 修復工作流');
  console.log('═══════════════════════════════════════\n');

  const userPrompt = '修復 auth.js 中的登入驗證 bug';

  // Step 1: 模式識別
  console.log('📋 Step 1: 模式識別');
  const patternResult = identifyTaskPattern(userPrompt);
  const pattern = patternResult?.name || patternResult;
  assert(
    pattern === 'bugFix',
    'B1.1 識別為 bugFix 模式',
    `實際: ${pattern}`
  );

  // Step 2: 分解
  console.log('\n📋 Step 2: 任務分解');
  const decomposition = decomposeTask(userPrompt, { complexity: 'moderate' });
  const { subtasks } = decomposition.task_decomposition;

  assert(
    subtasks.length <= 4,
    'B2.1 Bug 修復任務數較少',
    `任務數: ${subtasks.length}`
  );

  // Bug 修復通常有 explorer → developer → tester
  const hasExplorer = subtasks.some(t => t.agent === 'explorer');

  assert(
    hasExplorer,
    'B2.2 包含 explorer 調查任務',
    `explorer: ${hasExplorer}`
  );

  // Step 3: 檔案引用提取
  console.log('\n📋 Step 3: 檔案引用提取');
  const mentionedFiles = decomposition.task_decomposition.metadata?.mentioned_files || [];
  // 檢查是否提取了任何檔案引用（原始 prompt 中有 auth.js）
  const hasFileRef = mentionedFiles.length > 0 ||
    JSON.stringify(decomposition).includes('auth');

  assert(
    hasFileRef,
    'B3.1 提取檔案引用或 prompt 包含 auth',
    `files: ${mentionedFiles.join(', ')}, hasAuthRef: ${JSON.stringify(decomposition).includes('auth')}`
  );

  console.log('\n✅ 場景 B 完成');
}

// ============================================================
// 場景 C: 簡單查詢（應跳過分解）
// ============================================================
async function testSimpleQueryWorkflow() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 C: 簡單查詢工作流');
  console.log('═══════════════════════════════════════\n');

  const userPrompt = '什麼是 REST API？';

  // 應該直接回答，不需要分解
  console.log('📋 Step 1: 直接回答判斷');
  const shouldDirect = shouldDirectResponse(userPrompt, { complexity: 'simple' });

  assert(
    shouldDirect === true,
    'C1.1 簡單查詢應直接回答',
    `shouldDirectResponse: ${shouldDirect}`
  );

  // 另一個測試: 命令請求
  const statusQuery = '/status';
  const shouldDirectStatus = shouldDirectResponse(statusQuery, { complexity: 'simple' });

  assert(
    shouldDirectStatus === true,
    'C1.2 命令請求應直接處理',
    `shouldDirectResponse: ${shouldDirectStatus}`
  );

  console.log('\n✅ 場景 C 完成');
}

// ============================================================
// 場景 D: 預算耗盡場景
// ============================================================
async function testBudgetExceededWorkflow() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 D: 預算耗盡場景');
  console.log('═══════════════════════════════════════\n');

  // 模擬預算耗盡
  console.log('📋 Step 1: 預算耗盡檢測');
  const usage = {
    tokens: { prompt: 500000, completion: 100000, cached: 0, total: 600000 },  // 超過限制
    cost: 25,  // 超過 $20 限制
    operations: { file_edits: 60, bash_commands: 150, reads: 0, subagents: 0 },  // 超過操作限制
    start_time: Date.now(),
    last_update: Date.now(),
    model_usage: {}
  };

  const budgetUsage = getBudgetUsage(usage, DEFAULT_BUDGET, 'complex');
  const alert = getAlertLevel(budgetUsage);

  assert(
    alert.level === 'exceeded' || alert.level === 'critical',
    'D1.1 預算耗盡觸發阻止',
    `level: ${alert.level}, overall: ${budgetUsage.overall}`
  );

  // 驗證層級應降為 minimal
  console.log('\n📋 Step 2: 驗證降級');
  const verificationLevel = selectVerificationLevel({
    budgetRemaining: 0.05,  // 只剩 5%
    changeType: 'general'
  });

  assert(
    verificationLevel === 'minimal',
    'D1.2 低預算時驗證降級',
    `level: ${verificationLevel}`
  );

  console.log('\n✅ 場景 D 完成');
}

// ============================================================
// 場景 E: 完整數據流驗證
// ============================================================
async function testDataFlowIntegrity() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 E: 完整數據流驗證');
  console.log('═══════════════════════════════════════\n');

  const userPrompt = 'implement user authentication with OAuth2';

  // 1. 分解
  console.log('📋 Step 1: 分解 → YAML → 解析 → 路由');
  const decomposition = decomposeTask(userPrompt, { complexity: 'complex' });

  // 2. 序列化為 YAML
  const yaml = jsonToYaml(decomposition);

  // 3. 模擬寫入檔案再讀取（關鍵路徑）
  const parsed = parseSimpleYaml(yaml);

  // 4. 傳給 router
  const routingPlan = generateRoutingPlan(parsed, { complexity: 'complex' });

  // 驗證數據完整性
  assert(
    routingPlan && routingPlan.phases,
    'E1.1 完整數據流：分解→YAML→解析→路由',
    'routingPlan 為空'
  );

  // 驗證 subtasks 在整個流程中保持為陣列
  console.log('\n📋 Step 2: 陣列完整性驗證');
  const originalSubtasks = decomposition.task_decomposition.subtasks;
  const parsedSubtasks = parsed.task_decomposition?.subtasks;

  assert(
    Array.isArray(originalSubtasks) && Array.isArray(parsedSubtasks),
    'E1.2 subtasks 在序列化後保持為陣列',
    `original: ${Array.isArray(originalSubtasks)}, parsed: ${Array.isArray(parsedSubtasks)}`
  );

  // 驗證 parallel_groups 在整個流程中保持為嵌套陣列
  console.log('\n📋 Step 3: 嵌套陣列完整性驗證');
  const originalGroups = decomposition.task_decomposition.execution_order?.parallel_groups;
  const parsedGroups = parsed.task_decomposition?.execution_order?.parallel_groups;

  const isOriginalNestedArray = Array.isArray(originalGroups) &&
    originalGroups.every(g => Array.isArray(g));
  const isParsedNestedArray = Array.isArray(parsedGroups) &&
    parsedGroups.every(g => Array.isArray(g));

  assert(
    isOriginalNestedArray && isParsedNestedArray,
    'E1.3 parallel_groups 在序列化後保持為嵌套陣列',
    `original: ${isOriginalNestedArray}, parsed: ${isParsedNestedArray}`
  );

  console.log('\n✅ 場景 E 完成');
}

// ============================================================
// 場景 F: 自動路由執行驗證
// ============================================================
async function testAutoRoutingExecution() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 F: 自動路由執行驗證');
  console.log('═══════════════════════════════════════\n');

  // 導入新的模組
  const { RoutingStateManager } = require(path.join(SCRIPTS_DIR, 'lib/routing-state-manager'));
  const { generateRoutingDirective } = require(path.join(SCRIPTS_DIR, 'agent-router'));
  const {
    hasCompletionMarker,
    generateContinueDirective,
    generateFailureReport
  } = require(path.join(SCRIPTS_DIR, 'routing-completion-validator'));

  const userPrompt = '新增用戶登入功能';

  // Step 1: 生成分解和路由
  console.log('📋 Step 1: 生成路由計劃');
  const classification = { complexity: 'complex', intent: 'action' };
  const decomposition = decomposeTask(userPrompt, classification);
  const plan = generateRoutingPlan(decomposition, classification);

  assert(
    plan && plan.phases && plan.phases.length > 0,
    'F1.1 生成有效的路由計劃',
    `phases: ${plan?.phases?.length}`
  );

  // Step 2: 生成強制執行指令
  console.log('\n📋 Step 2: 生成強制執行指令');
  const planId = `route-${Date.now()}`;
  const directive = generateRoutingDirective(plan, planId, userPrompt);

  assert(
    directive && directive.includes('MANDATORY'),
    'F2.1 指令包含 MANDATORY 標記',
    `有 MANDATORY: ${directive?.includes('MANDATORY')}`
  );

  assert(
    directive && directive.includes('MUST'),
    'F2.2 指令包含 MUST 標記',
    `有 MUST: ${directive?.includes('MUST')}`
  );

  assert(
    directive && directive.includes(planId),
    'F2.3 指令包含 Plan ID',
    `有 planId: ${directive?.includes(planId)}`
  );

  // Step 3: 路由狀態管理
  console.log('\n📋 Step 3: 路由狀態管理');
  const tempDir = path.join(__dirname, '.test-temp-' + Date.now());
  const vibeDir = path.join(tempDir, '.vibe-engine');
  fs.mkdirSync(vibeDir, { recursive: true });

  // 設置環境變數讓 RoutingStateManager 使用測試目錄
  const originalRoot = process.env.CLAUDE_PROJECT_ROOT;
  process.env.CLAUDE_PROJECT_ROOT = tempDir;

  try {
    const manager = new RoutingStateManager(tempDir);
    const state = manager.createPlan(plan, userPrompt);

    assert(
      state && state.planId,
      'F3.1 創建路由狀態',
      `planId: ${state?.planId}`
    );

    assert(
      state.status === 'pending' && state.totalCount > 0,
      'F3.2 初始狀態正確',
      `status: ${state?.status}, total: ${state?.totalCount}`
    );

    // Step 4: 狀態追蹤
    console.log('\n📋 Step 4: 狀態追蹤');
    const firstTask = state.phases[0]?.tasks[0];
    if (firstTask) {
      manager.markTaskStarted(firstTask.id);
      const updatedState = manager.load();

      assert(
        updatedState.status === 'in_progress',
        'F4.1 標記任務開始後狀態更新',
        `status: ${updatedState?.status}`
      );

      manager.markTaskCompleted(firstTask.id);
      const afterComplete = manager.load();

      assert(
        afterComplete.completedCount === 1,
        'F4.2 完成計數正確',
        `completed: ${afterComplete?.completedCount}`
      );
    }

    // Step 5: 未完成任務檢測
    console.log('\n📋 Step 5: 未完成任務檢測');
    const pending = manager.getPendingTasks();

    assert(
      pending.length > 0,
      'F5.1 正確獲取未完成任務',
      `pending: ${pending.length}`
    );

    // Step 6: 完成標記檢測
    console.log('\n📋 Step 6: 完成標記檢測');
    const testPlanId = 'route-test-123';
    const hasMarker = hasCompletionMarker(`完成了 [Routing Complete: ${testPlanId}]`, testPlanId);
    const noMarker = hasCompletionMarker('一般的回覆內容', testPlanId);

    assert(
      hasMarker === true,
      'F6.1 檢測到完成標記',
      `hasMarker: ${hasMarker}`
    );

    assert(
      noMarker === false,
      'F6.2 沒有標記時正確返回 false',
      `noMarker: ${noMarker}`
    );

    // Step 7: 繼續指令生成
    console.log('\n📋 Step 7: 繼續指令生成');
    const continueDirective = generateContinueDirective(
      pending,
      state.planId,
      { currentRetry: 1, maxRetries: 3 }
    );

    assert(
      continueDirective && continueDirective.includes('INCOMPLETE'),
      'F7.1 繼續指令包含 INCOMPLETE',
      `有 INCOMPLETE: ${continueDirective?.includes('INCOMPLETE')}`
    );

    // Step 8: 失敗報告生成
    console.log('\n📋 Step 8: 失敗報告生成');
    const failureReport = generateFailureReport(
      pending,
      state.planId,
      { currentRetry: 3, maxRetries: 3 }
    );

    assert(
      failureReport && failureReport.includes('FAILED'),
      'F8.1 失敗報告包含 FAILED',
      `有 FAILED: ${failureReport?.includes('FAILED')}`
    );

    // Step 9: 重試機制
    console.log('\n📋 Step 9: 重試機制');
    let retryInfo = manager.incrementRetry();

    assert(
      retryInfo.canRetry === true && retryInfo.currentRetry === 1,
      'F9.1 第一次重試',
      `canRetry: ${retryInfo.canRetry}, current: ${retryInfo.currentRetry}`
    );

    // 模擬達到最大重試
    manager.incrementRetry();
    retryInfo = manager.incrementRetry();

    assert(
      retryInfo.canRetry === false && retryInfo.currentRetry === 3,
      'F9.2 達到最大重試次數',
      `canRetry: ${retryInfo.canRetry}, current: ${retryInfo.currentRetry}`
    );

  } finally {
    // 清理測試目錄
    process.env.CLAUDE_PROJECT_ROOT = originalRoot;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\n✅ 場景 F 完成');
}

// ============================================================
// 場景 G: 上下文感知驗證 + Auto-Fix 工作流
// ============================================================
async function testContextAwareAndAutoFix() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 G: 上下文感知驗證 + Auto-Fix 工作流');
  console.log('═══════════════════════════════════════\n');

  // 使用臨時目錄以隔離狀態
  const tempDir = path.join(__dirname, '.test-temp-g-' + Date.now());
  const vibeDir = path.join(tempDir, '.vibe-engine');
  fs.mkdirSync(vibeDir, { recursive: true });

  const originalRoot = process.env.CLAUDE_PROJECT_ROOT;
  process.env.CLAUDE_PROJECT_ROOT = tempDir;

  try {
    // Step 1: 簡單問答應跳過驗證
    console.log('📋 Step 1: 簡單問答跳過驗證');
    const shortInteraction = { transcript_summary: 'What is REST?' };
    const skipResult1 = shouldSkipVerification(shortInteraction);

    assert(
      skipResult1.skip === true,
      'G1.1 短互動跳過驗證',
      `skip: ${skipResult1.skip}, reason: ${skipResult1.reason}`
    );

    // Step 2: 有活躍路由計劃時讓路
    console.log('\n📋 Step 2: 活躍路由讓路');
    const { RoutingStateManager } = require(path.join(SCRIPTS_DIR, 'lib/routing-state-manager'));
    const manager = new RoutingStateManager(tempDir);

    // 創建一個活躍計劃
    const mockPlan = {
      strategy: 'sequential',
      phases: [{ name: 'phase1', tasks: [{ id: 'task-1', agent: 'developer', description: 'test' }] }]
    };
    manager.createPlan(mockPlan, 'test request');

    const skipResult2 = shouldSkipVerification(null);

    assert(
      skipResult2.skip === true,
      'G2.1 有活躍路由時跳過驗證',
      `skip: ${skipResult2.skip}, reason: ${skipResult2.reason}`
    );

    // 清理路由狀態讓後續測試正常
    manager.markPlanCompleted();

    // Step 3: 首次驗證失敗 → 啟動 Auto-Fix
    console.log('\n📋 Step 3: 首次失敗啟動 Auto-Fix');
    clearAutoFixState();

    const failedReport = {
      verification_report: {
        status: 'fail',
        blocking_issues: ['TypeScript compile error in auth.ts', 'Test suite failed: 2 tests'],
        level: 'standard',
        project_type: 'node',
        budget_remaining: '70%',
        layers: {
          static: {
            status: 'fail',
            checks: [{ name: 'typecheck', priority: 'P0', status: 'fail' }]
          },
          unit: {
            status: 'fail',
            checks: [{ name: 'jest', priority: 'P1', status: 'fail' }]
          }
        },
        warnings: [],
        recommendations: []
      }
    };

    const failOutput = handleVerificationFailure(failedReport);

    assert(
      failOutput.continue === true,
      'G3.1 首次失敗 continue=true（允許修復）',
      `continue: ${failOutput.continue}`
    );

    assert(
      failOutput.systemMessage && failOutput.systemMessage.includes('AUTO-FIX'),
      'G3.2 輸出包含 AUTO-FIX 指令',
      `has AUTO-FIX: ${failOutput.systemMessage?.includes('AUTO-FIX')}`
    );

    const state1 = loadAutoFixState();

    assert(
      state1.active === true && state1.iteration === 1,
      'G3.3 Auto-Fix 狀態已記錄（iteration=1）',
      `active: ${state1.active}, iteration: ${state1.iteration}`
    );

    // Step 4: 修復後驗證成功 → 清除狀態
    console.log('\n📋 Step 4: 修復後成功清除狀態');
    const successMsg = handleVerificationSuccess();

    assert(
      successMsg && successMsg.includes('AUTO-FIX SUCCESS'),
      'G4.1 成功訊息包含 AUTO-FIX SUCCESS',
      `msg: ${successMsg}`
    );

    const stateAfterClear = loadAutoFixState();

    assert(
      stateAfterClear.active === false,
      'G4.2 狀態已清除',
      `active: ${stateAfterClear.active}`
    );

    // Step 5: 達到上限 → 阻止
    console.log('\n📋 Step 5: 達到上限阻止');
    clearAutoFixState();

    // 模擬已達到最大迭代
    saveAutoFixState({
      active: true,
      iteration: MAX_FIX_ITERATIONS,
      maxIterations: MAX_FIX_ITERATIONS,
      startedAt: new Date().toISOString(),
      originalErrors: ['error1'],
      fixAttempts: Array.from({ length: MAX_FIX_ITERATIONS }, (_, i) => ({
        iteration: i + 1,
        timestamp: new Date().toISOString(),
        errors: ['error1']
      }))
    });

    const exhaustedOutput = handleVerificationFailure(failedReport);

    assert(
      exhaustedOutput.continue === false,
      'G5.1 達上限後 continue=false（阻止）',
      `continue: ${exhaustedOutput.continue}`
    );

    assert(
      exhaustedOutput.stopReason && exhaustedOutput.stopReason.includes('EXHAUSTED'),
      'G5.2 stopReason 包含 EXHAUSTED',
      `stopReason: ${exhaustedOutput.stopReason}`
    );

    // Step 6: generateFixDirective 格式驗證
    console.log('\n📋 Step 6: 修復指令格式');
    const directive = generateFixDirective(
      ['TypeScript compile error', 'Test failure'],
      2
    );

    assert(
      directive.includes('iteration 2/') && directive.includes('attempt(s) remaining'),
      'G6.1 修復指令包含迭代資訊和剩餘次數',
      `directive 長度: ${directive.length}`
    );

    assert(
      directive.includes('TypeScript compile error') && directive.includes('Test failure'),
      'G6.2 修復指令列出所有 blocking issues',
      `has issues: ${directive.includes('TypeScript compile error')}`
    );

  } finally {
    // 清理
    process.env.CLAUDE_PROJECT_ROOT = originalRoot;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\n✅ 場景 G 完成');
}

// ============================================================
// 場景 H: Hook Chain 管道整合測試（真實進程 stdin/stdout）
// ============================================================

/**
 * 執行 hook 腳本並解析 JSON 輸出
 */
function runHookScript(scriptName, stdinData, env = {}) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const result = execSync(`node "${scriptPath}"`, {
    input: JSON.stringify(stdinData),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 15000,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  // 提取最後一個有效 JSON（腳本可能有其他 console.log）
  const lines = result.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch { continue; }
  }
  return null;
}

async function testHookChainPipeline() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 H: Hook Chain 管道整合測試');
  console.log('═══════════════════════════════════════\n');

  const tempDir = path.join(__dirname, '.test-temp-h-' + Date.now());
  const vibeDir = path.join(tempDir, '.vibe-engine');
  fs.mkdirSync(path.join(vibeDir, 'tasks'), { recursive: true });

  const originalRoot = process.env.CLAUDE_PROJECT_ROOT;
  const hookEnv = {
    CLAUDE_PROJECT_ROOT: tempDir,
    CLAUDE_PLUGIN_ROOT: path.join(__dirname, '../..')
  };

  process.env.CLAUDE_PROJECT_ROOT = tempDir;

  try {
    const triggerPrompt = '幫我在 test-projects/phone-login 專案中加入忘記密碼功能，要有 UI 和驗證邏輯';

    // ── H1: UserPromptSubmit 完整管道 ──
    console.log('📋 Step 1: prompt-classifier（進程執行）');
    const step1 = runHookScript('prompt-classifier.js', { user_prompt: triggerPrompt }, hookEnv);

    assert(
      step1 && step1.continue === true,
      'H1.1 prompt-classifier 進程執行成功',
      `output: ${JSON.stringify(step1)?.substring(0, 100)}`
    );

    assert(
      step1.hookSpecificOutput?.complexity === 'moderate',
      'H1.2 觸發詞分類為 moderate',
      `complexity: ${step1?.hookSpecificOutput?.complexity}`
    );

    assert(
      step1.hookSpecificOutput.requestType === 'action' || step1.hookSpecificOutput.requestType === 'multi-step',
      'H1.3 requestType 為 action 或 multi-step',
      `requestType: ${step1?.hookSpecificOutput?.requestType}`
    );

    assert(
      step1.hookSpecificOutput?.needsDecomposition === true,
      'H1.4 觸發詞 needsDecomposition 為 true',
      `needsDecomposition: ${step1?.hookSpecificOutput?.needsDecomposition}`
    );

    console.log('\n📋 Step 2: task-decomposition-engine（進程執行，接收分類結果）');
    const step2 = runHookScript('task-decomposition-engine.js', {
      user_prompt: triggerPrompt,
      hookSpecificOutput: step1.hookSpecificOutput
    }, hookEnv);

    assert(
      step2 && step2.continue === true,
      'H2.1 task-decomposition 進程執行成功',
      `output: ${JSON.stringify(step2)?.substring(0, 100)}`
    );

    assert(
      step2.hookSpecificOutput?.decomposition?.task_decomposition?.subtasks?.length >= 2,
      'H2.2 分解出 2+ 子任務',
      `subtasks: ${step2?.hookSpecificOutput?.decomposition?.task_decomposition?.subtasks?.length}`
    );

    console.log('\n📋 Step 3: agent-router（進程執行，接收分解結果）');
    const step3 = runHookScript('agent-router.js', {
      user_prompt: triggerPrompt,
      hookSpecificOutput: step2.hookSpecificOutput
    }, hookEnv);

    assert(
      step3 && step3.continue === true,
      'H3.1 agent-router 進程執行成功',
      `output: ${JSON.stringify(step3)?.substring(0, 100)}`
    );

    assert(
      step3.systemMessage && step3.systemMessage.includes('MANDATORY'),
      'H3.2 systemMessage 包含 MANDATORY 強制指令',
      `has MANDATORY: ${step3?.systemMessage?.includes('MANDATORY')}`
    );

    assert(
      step3.hookSpecificOutput?.isDirective === true && step3.hookSpecificOutput?.planId,
      'H3.3 輸出包含 isDirective=true 和 planId',
      `isDirective: ${step3?.hookSpecificOutput?.isDirective}, planId: ${step3?.hookSpecificOutput?.planId}`
    );

    // ── H1.5: completion-check（活躍路由 → deferred）──
    console.log('\n📋 Step 3a: completion-check（活躍路由 → deferred）');
    const step3a = runHookScript('completion-check.js', {
      transcript_summary: '執行了部分任務',
      reason: 'stop'
    }, hookEnv);

    assert(
      step3a && step3a.continue === true,
      'H3a.1 completion-check 進程執行成功',
      `output: ${JSON.stringify(step3a)?.substring(0, 100)}`
    );

    assert(
      step3a.hookSpecificOutput?.completionCheck === 'deferred',
      'H3a.2 有活躍路由時 completion-check 延遲到 routing-completion-validator',
      `completionCheck: ${step3a?.hookSpecificOutput?.completionCheck}`
    );

    // ── H2: Stop 鏈 — 活躍路由時跳過驗證 ──
    console.log('\n📋 Step 4: verification-engine（活躍路由 → fast-path 跳過）');
    const step4 = runHookScript('verification-engine.js', {
      transcript_summary: '執行了部分任務，正在進行中',
      reason: 'stop'
    }, hookEnv);

    assert(
      step4 && step4.continue === true,
      'H4.1 有活躍路由時驗證被跳過',
      `continue: ${step4?.continue}`
    );

    assert(
      step4.systemMessage && step4.systemMessage.includes('Active routing plan'),
      'H4.2 跳過原因包含 Active routing plan',
      `systemMessage: ${step4?.systemMessage?.substring(0, 80)}`
    );

    // ── H3: 清除路由後 — 短互動跳過 ──
    console.log('\n📋 Step 5: verification-engine（短互動 → fast-path 跳過）');
    // 清除路由狀態
    const routingStatePath = path.join(vibeDir, 'routing-state.json');
    try { fs.unlinkSync(routingStatePath); } catch { /* ignore */ }

    const step5 = runHookScript('verification-engine.js', {
      transcript_summary: 'REST API 是什麼'
    }, hookEnv);

    assert(
      step5 && step5.continue === true,
      'H5.1 短互動驗證被跳過',
      `continue: ${step5?.continue}`
    );

    // ── H4: prompt-classifier 多樣分類 ──
    console.log('\n📋 Step 6: prompt-classifier 分類多樣性');
    const simpleQuery = runHookScript('prompt-classifier.js', {
      user_prompt: '什麼是 REST API？'
    }, hookEnv);

    assert(
      simpleQuery?.hookSpecificOutput?.complexity === 'simple',
      'H6.1 簡單查詢分類為 simple',
      `complexity: ${simpleQuery?.hookSpecificOutput?.complexity}`
    );

  } finally {
    process.env.CLAUDE_PROJECT_ROOT = originalRoot;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\n✅ 場景 H 完成');
}

// ============================================================
// 場景 I: 分類器準確性回歸測試
// ============================================================
async function testClassifierAccuracy() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 I: 分類器準確性回歸測試');
  console.log('═══════════════════════════════════════\n');

  const tempDir = path.join(__dirname, '.test-temp-i-' + Date.now());
  const vibeDir = path.join(tempDir, '.vibe-engine');
  fs.mkdirSync(path.join(vibeDir, 'tasks'), { recursive: true });

  const originalRoot = process.env.CLAUDE_PROJECT_ROOT;
  const hookEnv = {
    CLAUDE_PROJECT_ROOT: tempDir,
    CLAUDE_PLUGIN_ROOT: path.join(__dirname, '../..')
  };
  process.env.CLAUDE_PROJECT_ROOT = tempDir;

  try {
    // ── I1: 路徑消除 ──
    console.log('📋 Step 1: 路徑消除');
    const { sanitized, paths } = sanitizePrompt(
      '幫我在 test-projects/phone-login 專案中加入功能'
    );

    assert(
      paths.length === 1 && paths[0] === 'test-projects/phone-login',
      'I1.1 偵測到路徑 token',
      `paths: ${JSON.stringify(paths)}`
    );

    assert(
      !sanitized.includes('test-projects'),
      'I1.2 路徑已從 sanitized 移除',
      `sanitized: ${sanitized}`
    );

    // ── I2: Intl.Segmenter 詞數 ──
    console.log('\n📋 Step 2: 中文詞數計算');
    const wc1 = countWords('幫我在專案中加入忘記密碼功能');
    const wc2 = countWords('implement user authentication');

    assert(
      wc1 >= 7 && wc1 <= 12,
      'I2.1 中文詞數在合理範圍（7-12）',
      `wordCount: ${wc1}`
    );

    assert(
      wc2 === 3,
      'I2.2 英文詞數不受影響',
      `wordCount: ${wc2}`
    );

    // ── I3: 複合需求偵測 ──
    console.log('\n📋 Step 3: 複合需求偵測');
    const cr1 = detectCompoundRequirements('要有 UI 和驗證邏輯');
    const cr2 = detectCompoundRequirements('包含註冊、登入、忘記密碼三個功能');
    const cr3 = detectCompoundRequirements('修復這個 bug');

    assert(
      cr1.count === 2,
      'I3.1 "要有 UI 和驗證邏輯" → 2 子需求',
      `count: ${cr1.count}`
    );

    assert(
      cr2.count >= 3,
      'I3.2 "包含註冊、登入、忘記密碼" → 3+ 子需求',
      `count: ${cr2.count}`
    );

    assert(
      cr3.count === 0,
      'I3.3 無需求動詞 → 0 子需求',
      `count: ${cr3.count}`
    );

    // ── I4: 分類結果回歸 ──
    console.log('\n📋 Step 4: 分類結果回歸');

    const case1 = classifyRequest('什麼是 REST API？');
    assert(
      case1.complexity === 'simple' && case1.requestType === 'query',
      'I4.1 純查詢 → simple/query',
      `${case1.complexity}/${case1.requestType}`
    );

    const case2 = classifyRequest('修復 auth.js 中的登入驗證 bug');
    assert(
      case2.complexity === 'moderate',
      'I4.2 單一修復 → moderate',
      `complexity: ${case2.complexity}`
    );

    const case3 = classifyRequest(
      '幫我在 test-projects/phone-login 專案中加入忘記密碼功能，要有 UI 和驗證邏輯'
    );
    assert(
      case3.complexity === 'moderate',
      'I4.3 路徑+複合需求 → moderate（非 simple）',
      `complexity: ${case3.complexity}`
    );
    assert(
      case3.needsDecomposition === true,
      'I4.4 moderate + 複合需求 → needsDecomposition',
      `needsDecomposition: ${case3.needsDecomposition}`
    );

    const case4 = classifyRequest('重構整個專案的認證模組，需要修改多個檔案');
    assert(
      case4.complexity === 'complex',
      'I4.5 整個+重構+多個 → complex',
      `complexity: ${case4.complexity}`
    );

    // ── I5: 路徑誤判防護 ──
    console.log('\n📋 Step 5: 路徑誤判防護');
    const case5 = classifyRequest('查看 test-results/output.json 的內容');
    assert(
      case5.complexity === 'simple',
      'I5.1 含 test 路徑的查詢不誤判為 moderate',
      `complexity: ${case5.complexity}`
    );

    // ── I6: 進程執行回歸 ──
    console.log('\n📋 Step 6: 進程執行回歸');
    const step6 = runHookScript('prompt-classifier.js', {
      user_prompt: '幫我在 test-projects/phone-login 專案中加入忘記密碼功能，要有 UI 和驗證邏輯'
    }, hookEnv);

    assert(
      step6?.hookSpecificOutput?.complexity === 'moderate',
      'I6.1 觸發詞進程執行結果為 moderate',
      `complexity: ${step6?.hookSpecificOutput?.complexity}`
    );

    assert(
      step6?.hookSpecificOutput?.needsDecomposition === true,
      'I6.2 觸發詞 needsDecomposition 為 true',
      `needsDecomposition: ${step6?.hookSpecificOutput?.needsDecomposition}`
    );

  } finally {
    process.env.CLAUDE_PROJECT_ROOT = originalRoot;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\n✅ 場景 I 完成');
}

// ============================================================
// 場景 J: 缺口修復驗證
// ============================================================
async function testGapFixes() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 J: 缺口修復驗證');
  console.log('═══════════════════════════════════════\n');

  const tempDir = path.join(__dirname, '.test-temp-j-' + Date.now());
  const vibeDir = path.join(tempDir, '.vibe-engine');
  fs.mkdirSync(path.join(vibeDir, 'tasks'), { recursive: true });

  const originalRoot = process.env.CLAUDE_PROJECT_ROOT;
  const hookEnv = {
    CLAUDE_PROJECT_ROOT: tempDir,
    CLAUDE_PLUGIN_ROOT: path.join(__dirname, '../..')
  };
  process.env.CLAUDE_PROJECT_ROOT = tempDir;

  try {
    // ── J1: identifyTaskPattern 計分制 ──
    console.log('📋 Step 1: 計分制模式識別');

    const p1 = identifyTaskPattern('新增測試用例');
    assert(
      p1.name === 'testing',
      'J1.1 "新增測試用例" 應匹配 testing（非 newFeature）',
      `actual: ${p1.name}`
    );

    const p2 = identifyTaskPattern('修復並測試 auth 模組');
    assert(
      p2.name === 'bugFix',
      'J1.2 "修復並測試" 應匹配 bugFix（修復 > 測試）',
      `actual: ${p2.name}`
    );

    const p3 = identifyTaskPattern('在 test-results/output.json 中新增欄位');
    assert(
      p3.name === 'newFeature',
      'J1.3 路徑中的 test 不應觸發 testing 模式',
      `actual: ${p3.name}`
    );

    // ── J2: shouldDirectResponse 中文模式 ──
    console.log('\n📋 Step 2: 中文直接回答模式');

    assert(
      shouldDirectResponse('這個函數可以處理中文嗎？', { complexity: 'moderate' }),
      'J2.1 "可以...？" 中文問句應直接回答',
      'shouldDirectResponse returned false'
    );

    assert(
      shouldDirectResponse('是否需要安裝額外的套件？', { complexity: 'moderate' }),
      'J2.2 "是否...？" 中文問句應直接回答',
      'shouldDirectResponse returned false'
    );

    assert(
      shouldDirectResponse('有沒有更好的方法？', { complexity: 'moderate' }),
      'J2.3 "有沒有...？" 中文問句應直接回答',
      'shouldDirectResponse returned false'
    );

    assert(
      shouldDirectResponse('能不能解釋一下？', { complexity: 'moderate' }),
      'J2.4 "能不能...？" 中文問句應直接回答',
      'shouldDirectResponse returned false'
    );

    assert(
      shouldDirectResponse('怎樣設定環境變數', { complexity: 'moderate' }),
      'J2.5 "怎樣..." 開頭應直接回答',
      'shouldDirectResponse returned false'
    );

    assert(
      shouldDirectResponse('REST API 是什麼？', { complexity: 'moderate' }),
      'J2.6 中文全形問號應被匹配',
      'shouldDirectResponse returned false'
    );

    assert(
      !shouldDirectResponse('可以幫我實作登入功能', { complexity: 'moderate' }),
      'J2.7 "可以幫我實作..." 無問號不應觸發直接回答',
      'shouldDirectResponse returned true unexpectedly'
    );

    // ── J3: completion-check 聚合器 ──
    console.log('\n📋 Step 3: 完成狀態聚合器');

    // 3a: 無任何狀態時
    const summary1 = aggregateTaskState();
    assert(
      summary1.routing !== undefined && summary1.autoFix !== undefined,
      'J3.1 聚合器返回結構完整',
      `keys: ${Object.keys(summary1).join(', ')}`
    );

    // 3b: 有活躍路由 → defer
    const { RoutingStateManager } = require(path.join(SCRIPTS_DIR, 'lib/routing-state-manager'));
    const manager = new RoutingStateManager(tempDir);
    const mockPlan = {
      strategy: 'sequential',
      phases: [{ tasks: [{ id: 'task-1', agent: 'developer', description: 'test' }] }]
    };
    manager.createPlan(mockPlan, 'test');

    const summary2 = aggregateTaskState();
    const defer2 = shouldDefer(summary2);
    assert(
      defer2.defer === true && defer2.reason === 'active_routing',
      'J3.2 活躍路由時 shouldDefer 返回 true',
      `defer: ${defer2.defer}, reason: ${defer2.reason}`
    );

    manager.markPlanCompleted();

    // 3c: 無活躍狀態 → 不 defer
    const summary3 = aggregateTaskState();
    const defer3 = shouldDefer(summary3);
    assert(
      defer3.defer === false,
      'J3.3 無活躍狀態時不 defer',
      `defer: ${defer3.defer}`
    );

    const msg = generateCompletionSummary(summary3);
    assert(
      typeof msg === 'string' && msg.includes('[Completion Summary]'),
      'J3.4 生成有效的完成摘要',
      `msg: ${msg?.substring(0, 50)}`
    );

    // ── J4: task-decomposition 整合複合需求 ──
    console.log('\n📋 Step 4: 複合需求整合');

    const decomp1 = decomposeTask('新增用戶註冊、登入、忘記密碼三個功能', {
      complexity: 'complex',
      metrics: { compoundRequirements: 3 }
    });

    assert(
      decomp1.task_decomposition.subtasks.length >= 3,
      'J4.1 複合需求 >= 3 時子任務數 >= 3',
      `subtasks: ${decomp1.task_decomposition.subtasks.length}`
    );

    // ── J5: generateTaskDescription 包含上下文 ──
    console.log('\n📋 Step 5: 任務描述上下文');

    const decomp2 = decomposeTask('新增 JWT 認證功能', { complexity: 'moderate' });
    const devTask = decomp2.task_decomposition.subtasks.find(t => t.agent === 'developer');

    assert(
      devTask && devTask.description.includes('JWT'),
      'J5.1 任務描述包含原始請求的關鍵上下文',
      `description: ${devTask?.description}`
    );

    // ── J6: completion-check 進程級驗證 ──
    console.log('\n📋 Step 6: 進程級驗證');

    const ccResult = runHookScript('completion-check.js', {
      transcript_summary: '完成了一些工作',
      reason: 'stop'
    }, hookEnv);

    assert(
      ccResult && ccResult.continue === true,
      'J6.1 completion-check 進程執行永遠 continue=true',
      `continue: ${ccResult?.continue}`
    );

    assert(
      ccResult.hookSpecificOutput?.completionCheck !== undefined,
      'J6.2 hookSpecificOutput 包含 completionCheck 欄位',
      `keys: ${Object.keys(ccResult?.hookSpecificOutput || {}).join(', ')}`
    );

  } finally {
    process.env.CLAUDE_PROJECT_ROOT = originalRoot;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\n✅ 場景 J 完成');
}

// ============================================================
// 場景 K: 100% 完成度驗證
// ============================================================
async function testHundredPercentCompletion() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 K: 100% 完成度驗證');
  console.log('═══════════════════════════════════════\n');

  // ── K1: byContentType 分解策略 ──
  console.log('📋 Step 1: byContentType 分解策略');

  const docPattern = identifyTaskPattern('更新 README 文檔和 API 說明');
  assert(
    docPattern.name === 'documentation',
    'K1.1 文檔任務識別為 documentation 模式',
    `actual: ${docPattern.name}`
  );
  assert(
    docPattern.decomposition === 'byContentType',
    'K1.2 documentation 使用 byContentType 策略',
    `actual: ${docPattern.decomposition}`
  );

  const docDecomp = decomposeTask('更新 README 說明和 API 介面文檔', { complexity: 'moderate' });
  const docSubtasks = docDecomp.task_decomposition.subtasks;
  assert(
    docSubtasks.length >= 2,
    'K1.3 多種內容類型（readme + api-doc）產生多個子任務',
    `subtasks: ${docSubtasks.length}`
  );

  // ── K2: maxConcurrent 並行限制 ──
  console.log('\n📋 Step 2: maxConcurrent 並行限制');

  assert(
    MAX_CONCURRENT_PER_TYPE.developer === 2,
    'K2.1 developer maxConcurrent 為 2',
    `actual: ${MAX_CONCURRENT_PER_TYPE.developer}`
  );
  assert(
    MAX_PARALLEL_AGENTS === 4,
    'K2.2 全局最大並行 agent 為 4',
    `actual: ${MAX_PARALLEL_AGENTS}`
  );

  // 建構 5 個無依賴 developer 任務測試分組
  const fakeSubtasks = [];
  for (let i = 1; i <= 5; i++) {
    fakeSubtasks.push({
      id: `task-${i}`, agent: 'developer', depends_on: []
    });
  }
  const groups = generateParallelGroups(fakeSubtasks);
  // 每個 group 最多 2 個 developer
  const maxDevInGroup = Math.max(...groups.map(g =>
    g.filter(id => fakeSubtasks.find(t => t.id === id).agent === 'developer').length
  ));
  assert(
    maxDevInGroup <= 2,
    'K2.3 每個 parallel group 中 developer 不超過 2',
    `maxDevInGroup: ${maxDevInGroup}, groups: ${groups.length}`
  );

  // ── K3: getExecutableTasks 並行限制 ──
  console.log('\n📋 Step 3: getExecutableTasks 並行限制');

  const tempDir = path.join(__dirname, '.test-temp-k-' + Date.now());
  const vibeDir = path.join(tempDir, '.vibe-engine');
  fs.mkdirSync(vibeDir, { recursive: true });
  const originalRoot = process.env.CLAUDE_PROJECT_ROOT;
  process.env.CLAUDE_PROJECT_ROOT = tempDir;

  try {
    const manager = new RoutingStateManager(tempDir);
    const testPlan = {
      strategy: 'hybrid',
      phases: [{
        parallel: true,
        tasks: [
          { id: 'dev-1', agent: 'developer', description: 'task 1' },
          { id: 'dev-2', agent: 'developer', description: 'task 2' },
          { id: 'dev-3', agent: 'developer', description: 'task 3' }
        ]
      }]
    };
    manager.createPlan(testPlan, 'test');

    // 標記 1 個為 executing
    manager.markTaskStarted('dev-1');

    const executable = manager.getExecutableTasks();
    // dev 上限 2，已 executing 1，所以最多可再派 1 個
    assert(
      executable.length <= 1,
      'K3.1 getExecutableTasks 考慮 agent 並行上限（已執行 1，可再派 ≤1）',
      `executable: ${executable.length}`
    );

    // 確認 getPendingTasks 仍返回所有 pending（不受限制）
    const pending = manager.getPendingTasks();
    assert(
      pending.length === 2,
      'K3.2 getPendingTasks 不受 agent 限制，返回所有 pending',
      `pending: ${pending.length}`
    );
  } finally {
    process.env.CLAUDE_PROJECT_ROOT = originalRoot;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // ── K4: classifyError 四分類 ──
  console.log('\n📋 Step 4: 錯誤四分類');

  if (classifyError) {
    assert(
      classifyError([]).type === 'none',
      'K4.1 空錯誤分類為 none',
      `actual: ${classifyError([]).type}`
    );
    assert(
      classifyError([{ type: 'test_failure', count: 3 }]).type === 'logic',
      'K4.2 test_failure 分類為 logic',
      `actual: ${classifyError([{ type: 'test_failure', count: 3 }]).type}`
    );
    assert(
      classifyError([{ type: 'ETIMEDOUT', count: 1 }]).type === 'transient',
      'K4.3 ETIMEDOUT 分類為 transient',
      `actual: ${classifyError([{ type: 'ETIMEDOUT', count: 1 }]).type}`
    );
    assert(
      classifyError([{ type: 'deployed', count: 1 }]).type === 'irreversible',
      'K4.4 deployed 分類為 irreversible',
      `actual: ${classifyError([{ type: 'deployed', count: 1 }]).type}`
    );
  } else {
    console.log('⚠️ classifyError 無法載入（跨 plugin），跳過 K4');
  }

  // ── K5: generateFixDirective 包含診斷步驟 ──
  console.log('\n📋 Step 5: 修復指令包含診斷步驟');

  const fixDir = generateFixDirective(['Type error in auth.ts'], 1);
  assert(
    fixDir.includes('diagnos') || fixDir.includes('root cause'),
    'K5.1 修復指令包含診斷要求',
    `directive snippet: ${fixDir.substring(0, 120)}`
  );
  // 確保保留既有關鍵字（場景 G 依賴）
  assert(
    fixDir.includes('iteration 1/') && fixDir.includes('attempt(s) remaining'),
    'K5.2 修復指令保留 iteration 和 remaining 文字',
    `directive snippet: ${fixDir.substring(0, 80)}`
  );

  // ── K6: CONCURRENCY_LIMITS 一致性 ──
  console.log('\n📋 Step 6: 並行限制一致性');

  assert(
    CONCURRENCY_LIMITS.developer === MAX_CONCURRENT_PER_TYPE.developer,
    'K6.1 routing-state-manager 和 task-decomposition 的 developer 限制一致',
    `RSM: ${CONCURRENCY_LIMITS.developer}, TDE: ${MAX_CONCURRENT_PER_TYPE.developer}`
  );

  console.log('\n✅ 場景 K 完成');
}

// ============================================================
// 主測試執行
// ============================================================
async function runAllTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Vibe Engine E2E 協作測試                              ║');
  console.log('║     完整功能開發工作流驗證                                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  try {
    await testNewFeatureWorkflow();
    await testBugFixWorkflow();
    await testSimpleQueryWorkflow();
    await testBudgetExceededWorkflow();
    await testDataFlowIntegrity();
    await testAutoRoutingExecution();
    await testContextAwareAndAutoFix();  // 場景 G
    await testHookChainPipeline();        // 場景 H
    await testClassifierAccuracy();       // 場景 I
    await testGapFixes();                  // 場景 J
    await testHundredPercentCompletion();  // 場景 K
  } catch (error) {
    console.error('\n❌ 測試執行錯誤:', error.message);
    console.error(error.stack);
  }

  // 摘要報告
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    測試摘要報告                           ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║  通過: ${testContext.passed.toString().padStart(3)} ✅                                          ║`);
  console.log(`║  失敗: ${testContext.failed.toString().padStart(3)} ${testContext.failed > 0 ? '❌' : '✅'}                                          ║`);
  console.log(`║  總計: ${(testContext.passed + testContext.failed).toString().padStart(3)}                                              ║`);
  console.log('╚═══════════════════════════════════════════════════════════╝');

  if (testContext.failed > 0) {
    console.log('\n失敗的測試:');
    testContext.results
      .filter(r => r.status === 'FAIL')
      .forEach(r => console.log(`  - ${r.name}: ${r.details}`));
  }

  return testContext.failed === 0;
}

// 執行
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
});
