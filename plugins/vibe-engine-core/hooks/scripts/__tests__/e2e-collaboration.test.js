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
 */

const path = require('path');
const fs = require('fs');

// 導入所有核心模組
const SCRIPTS_DIR = path.join(__dirname, '..');
const { decomposeTask, saveDecomposition, identifyTaskPattern } =
  require(path.join(SCRIPTS_DIR, 'task-decomposition-engine'));
const { generateRoutingPlan, shouldDirectResponse, selectAgent } =
  require(path.join(SCRIPTS_DIR, 'agent-router'));
const { runVerification, detectProjectType, selectVerificationLevel } =
  require(path.join(SCRIPTS_DIR, 'verification-engine'));
const {
  getBudgetUsage, getAlertLevel, suggestModel, recordToolUse,
  DEFAULT_BUDGET
} = require(path.join(SCRIPTS_DIR, 'budget-tracker-engine'));
const { parseSimpleYaml, jsonToYaml } =
  require(path.join(SCRIPTS_DIR, 'lib/yaml-parser'));

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
    await testAutoRoutingExecution();  // 新增場景 F
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
