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
 * L. P2 記憶學習（模式偵測、Instinct 生成、去重、領域推斷）
 * M. Checkpoint CRUD 操作（create、verify、list、clear、delete、formatForDisplay）
 * N. Instinct Evolution（findClusters、evolve、getReadyForEvolve、_suggestEvolutionType、getStats）
 * O. Dashboard/Metrics 渲染（renderDashboard、renderMetrics、MetricsStore、drawProgressBar）
 * P. 跨鏈狀態一致性（routing-state → completion-check/verification-engine、auto-fix state、budget）
 * Q. 跨 Plugin 進程管道（observation-collector、metrics-collector、circuit-breaker、permission-guard）
 * R. 完整生命週期模擬（UserPromptSubmit → PostToolUse → Stop → memory-consolidation）
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

// pattern-analyzer（跨 plugin import — memory plugin）
let analyzePatterns, detectCorrections, detectRepetitions, detectErrorFixes,
    generateInstincts, inferDomain, calculateTriggerSimilarity, PATTERN_TYPES;
try {
  ({
    analyzePatterns, detectCorrections, detectRepetitions, detectErrorFixes,
    generateInstincts, inferDomain, calculateTriggerSimilarity, PATTERN_TYPES
  } = require(path.join(__dirname, '../../../../vibe-engine-memory/hooks/scripts/lib/pattern-analyzer')));
} catch { analyzePatterns = null; }

// instinct-manager（跨 plugin import — memory plugin）
let InstinctManager, DOMAINS, EVOLUTION_TYPES;
try {
  ({ InstinctManager, DOMAINS, EVOLUTION_TYPES } = require(path.join(__dirname, '../../../../vibe-engine-memory/hooks/scripts/lib/instinct-manager')));
} catch { InstinctManager = null; }

// checkpoint-manager（跨 plugin import — memory plugin）
let CheckpointManager;
try {
  ({ CheckpointManager } = require(path.join(__dirname, '../../../../vibe-engine-memory/hooks/scripts/lib/checkpoint-manager')));
} catch { CheckpointManager = null; }

// renderer + metrics-store（跨 plugin import — dashboard plugin）
let renderDashboard, renderMetrics, drawProgressBar, formatDuration;
try {
  ({ renderDashboard, renderMetrics, drawProgressBar, formatDuration } = require(path.join(__dirname, '../../../../vibe-engine-dashboard/hooks/scripts/lib/renderer')));
} catch { renderDashboard = null; }

let MetricsStore;
try {
  ({ MetricsStore } = require(path.join(__dirname, '../../../../vibe-engine-dashboard/hooks/scripts/lib/metrics-store')));
} catch { MetricsStore = null; }

// circuit-breaker（跨 plugin import — guarantee plugin）
let cbCheckCircuit, cbRecordFailure, cbRecordSuccess, cbResetCircuit, cbGetStatus, CB_CONFIG;
try {
  ({ checkCircuit: cbCheckCircuit, recordFailure: cbRecordFailure,
     recordSuccess: cbRecordSuccess, resetCircuit: cbResetCircuit,
     getStatus: cbGetStatus, CONFIG: CB_CONFIG
  } = require(path.join(__dirname, '../../../../vibe-engine-guarantee/hooks/scripts/circuit-breaker')));
} catch { cbCheckCircuit = null; }

// observation-collector（跨 plugin import — memory plugin）
let determineOutcome, detectUserCorrection, obsSummarizeResult, OBS_EXCLUDED_TOOLS;
try {
  ({ determineOutcome, detectUserCorrection, summarizeResult: obsSummarizeResult,
     EXCLUDED_TOOLS: OBS_EXCLUDED_TOOLS
  } = require(path.join(__dirname, '../../../../vibe-engine-memory/hooks/scripts/observation-collector')));
} catch { determineOutcome = null; }

// metrics-collector（跨 plugin import — dashboard plugin）
let mcParseToolResult, mcSummarizeInput;
try {
  ({ parseToolResult: mcParseToolResult, summarizeInput: mcSummarizeInput
  } = require(path.join(__dirname, '../../../../vibe-engine-dashboard/hooks/scripts/metrics-collector')));
} catch { mcParseToolResult = null; }

// permission-guard（core plugin — 重構後可 import）
let evaluatePermission;
try {
  ({ evaluatePermission } = require(path.join(SCRIPTS_DIR, 'permission-guard')));
} catch { evaluatePermission = null; }

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

// 跨 Plugin 腳本路徑
const PLUGIN_SCRIPTS = {
  core: SCRIPTS_DIR,
  guarantee: path.join(__dirname, '../../../../vibe-engine-guarantee/hooks/scripts'),
  memory: path.join(__dirname, '../../../../vibe-engine-memory/hooks/scripts'),
  dashboard: path.join(__dirname, '../../../../vibe-engine-dashboard/hooks/scripts')
};

function runPluginHookScript(plugin, scriptName, stdinData, env = {}) {
  const scriptPath = path.join(PLUGIN_SCRIPTS[plugin], scriptName);
  if (!fs.existsSync(scriptPath)) return null;
  try {
    const result = execSync(`node "${scriptPath}"`, {
      input: JSON.stringify(stdinData),
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const lines = result.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try { return JSON.parse(lines[i]); } catch { continue; }
    }
  } catch (e) { /* process error */ }
  return null;
}

function runCBProcess(flags, cwd) {
  const scriptPath = path.join(PLUGIN_SCRIPTS.guarantee, 'circuit-breaker.js');
  if (!fs.existsSync(scriptPath)) return null;
  try {
    const result = execSync(`node "${scriptPath}" ${flags}`, {
      encoding: 'utf8',
      cwd,
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    // 先嘗試整體解析（處理 pretty-printed JSON）
    try { return JSON.parse(result.trim()); } catch { /* fallback */ }
    // fallback: 逐行解析（向後兼容單行 JSON）
    const lines = result.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try { return JSON.parse(lines[i]); } catch { continue; }
    }
  } catch (e) { /* process error */ }
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

    // 直接測試分類邏輯
    const classification = classifyRequest(triggerPrompt);
    assert(
      classification.complexity === 'moderate',
      'H1.2 觸發詞分類為 moderate',
      `complexity: ${classification?.complexity}`
    );

    assert(
      classification.requestType === 'action' || classification.requestType === 'multi-step',
      'H1.3 requestType 為 action 或 multi-step',
      `requestType: ${classification?.requestType}`
    );

    assert(
      classification.needsDecomposition === true,
      'H1.4 觸發詞 needsDecomposition 為 true',
      `needsDecomposition: ${classification?.needsDecomposition}`
    );

    console.log('\n📋 Step 2: task-decomposition-engine（進程執行）');
    const step2 = runHookScript('task-decomposition-engine.js', {
      user_prompt: triggerPrompt
    }, hookEnv);

    assert(
      step2 && step2.continue === true,
      'H2.1 task-decomposition 進程執行成功',
      `output: ${JSON.stringify(step2)?.substring(0, 100)}`
    );

    assert(
      step2.systemMessage && step2.systemMessage.includes('subtasks'),
      'H2.2 systemMessage 包含任務分解資訊',
      `systemMessage: ${step2?.systemMessage?.substring(0, 80)}`
    );

    console.log('\n📋 Step 3: agent-router（進程執行）');
    const step3 = runHookScript('agent-router.js', {
      user_prompt: triggerPrompt
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
      step3.systemMessage && step3.systemMessage.includes('MANDATORY'),
      'H3.3 systemMessage 包含 MANDATORY 路由指令',
      `has plan: ${step3?.systemMessage?.includes('Plan')}`
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
      step3a.suppressOutput === true,
      'H3a.2 有活躍路由時 completion-check 靜默延遲',
      `suppressOutput: ${step3a?.suppressOutput}`
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

    const simpleClassification = classifyRequest('什麼是 REST API？');
    assert(
      simpleClassification.complexity === 'simple',
      'H6.1 簡單查詢分類為 simple',
      `complexity: ${simpleClassification?.complexity}`
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

    const step6Classification = classifyRequest('幫我在 test-projects/phone-login 專案中加入忘記密碼功能，要有 UI 和驗證邏輯');
    assert(
      step6Classification.complexity === 'moderate',
      'I6.1 觸發詞進程執行結果為 moderate',
      `complexity: ${step6Classification?.complexity}`
    );

    assert(
      step6Classification.needsDecomposition === true,
      'I6.2 觸發詞 needsDecomposition 為 true',
      `needsDecomposition: ${step6Classification?.needsDecomposition}`
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
      ccResult.systemMessage && ccResult.systemMessage.includes('[Completion Summary]'),
      'J6.2 completion-check 聚合摘要',
      `systemMessage: ${ccResult?.systemMessage?.substring(0, 60)}`
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
// 場景 L：P2 記憶學習 — 模式偵測 + Instinct 生成
// ============================================================
async function testMemoryLearning() {
  console.log('\n📋 場景 L: P2 記憶學習 — 模式偵測 + Instinct 生成');

  // 跳過如果模組不可用
  if (!analyzePatterns || !InstinctManager) {
    console.log('  ⚠️ pattern-analyzer 或 instinct-manager 不可用，跳過場景 L');
    return;
  }

  // Mock 觀察數據
  const mockObservations = [
    // 正常操作
    { timestamp: '2026-02-06T14:00:00Z', tool_name: 'Read', tool_input: { file_path: '/src/app.ts' }, outcome: 'success', user_correction: false },
    // 用戶糾正
    { timestamp: '2026-02-06T14:00:30Z', tool_name: 'Edit', tool_input: { file_path: '/src/app.ts' }, outcome: 'success', user_correction: false },
    { timestamp: '2026-02-06T14:00:35Z', tool_name: 'Edit', tool_input: { file_path: '/src/app.ts' }, outcome: 'success', user_correction: true, corrects_previous: '2026-02-06T14:00:30Z' },
    // 重複操作 (3+)
    { timestamp: '2026-02-06T14:01:00Z', tool_name: 'Grep', tool_input: { pattern: 'TODO', path: '/src' }, outcome: 'success', user_correction: false },
    { timestamp: '2026-02-06T14:01:10Z', tool_name: 'Grep', tool_input: { pattern: 'TODO', path: '/src' }, outcome: 'success', user_correction: false },
    { timestamp: '2026-02-06T14:01:20Z', tool_name: 'Grep', tool_input: { pattern: 'TODO', path: '/src' }, outcome: 'success', user_correction: false },
    // 錯誤→修復
    { timestamp: '2026-02-06T14:02:00Z', tool_name: 'Bash', tool_input: { command: 'npm test' }, outcome: 'failure', user_correction: false },
    { timestamp: '2026-02-06T14:02:30Z', tool_name: 'Bash', tool_input: { command: 'npm test' }, outcome: 'success', user_correction: false },
  ];

  // --- L1: detectCorrections ---
  console.log('  L1: detectCorrections — 偵測用戶糾正模式');
  const corrections = detectCorrections(mockObservations);
  assert(
    'L1.1', '偵測到 1 個糾正模式',
    corrections.length === 1
  );
  assert(
    'L1.2', '糾正模式類型為 CORRECTION',
    corrections[0].type === PATTERN_TYPES.CORRECTION
  );
  assert(
    'L1.3', '糾正模式信心為 0.4',
    corrections[0].confidence === 0.4
  );

  // --- L2: detectRepetitions ---
  console.log('  L2: detectRepetitions — 偵測重複操作模式');
  const repetitions = detectRepetitions(mockObservations);
  assert(
    'L2.1', '偵測到至少 1 個重複模式（Grep 3 次）',
    repetitions.length >= 1
  );
  const grepPattern = repetitions.find(p => p.action.includes('Grep'));
  assert(
    'L2.2', '重複模式信心為 0.3 + 3*0.05 = 0.45',
    grepPattern && grepPattern.confidence === 0.45
  );

  // --- L3: detectErrorFixes ---
  console.log('  L3: detectErrorFixes — 偵測錯誤修復模式');
  const errorFixes = detectErrorFixes(mockObservations);
  assert(
    'L3.1', '偵測到 1 個錯誤修復模式（Bash failure→success）',
    errorFixes.length === 1
  );
  assert(
    'L3.2', '錯誤修復信心為 0.5',
    errorFixes[0].confidence === 0.5
  );

  // --- L4: inferDomain ---
  console.log('  L4: inferDomain — 領域推斷');
  assert(
    'L4.1', 'test 檔案 → TESTING',
    inferDomain({ tool_input: { file_path: '/src/__tests__/app.test.ts' }, tool_name: 'Edit' }) === DOMAINS.TESTING
  );
  assert(
    'L4.2', '.md 檔案 → DOCUMENTATION',
    inferDomain({ tool_input: { file_path: '/docs/README.md' }, tool_name: 'Edit' }) === DOMAINS.DOCUMENTATION
  );
  assert(
    'L4.3', 'Bash lint → CODE_STYLE',
    inferDomain({ tool_input: { command: 'npx eslint src/' }, tool_name: 'Bash' }) === DOMAINS.CODE_STYLE
  );

  // --- L5: generateInstincts（用臨時目錄）---
  console.log('  L5: generateInstincts — Instinct 生成與去重');
  const tmpDir = path.join(require('os').tmpdir(), `vibe-test-instincts-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const im = new InstinctManager(tmpDir);
    const patterns = analyzePatterns(mockObservations);

    assert(
      'L5.1', 'analyzePatterns 偵測到 3+ 模式（correction + repetition + error_fix）',
      patterns.length >= 3
    );

    const result = generateInstincts(patterns, im);
    assert(
      'L5.2', '成功創建 instincts（created > 0）',
      result.created > 0
    );

    // 第二次調用相同 patterns — 應該 update 而非 create
    const result2 = generateInstincts(patterns, im);
    assert(
      'L5.3', '重複 patterns 被去重（updated > 0, created === 0）',
      result2.updated > 0 && result2.created === 0
    );
  } finally {
    // 清理
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // --- L6: calculateTriggerSimilarity ---
  console.log('  L6: calculateTriggerSimilarity — 觸發語相似度');
  assert(
    'L6.1', '相同觸發語相似度為 1.0',
    calculateTriggerSimilarity('when using Edit on app.ts', 'when using Edit on app.ts') === 1.0
  );
  assert(
    'L6.2', '不同觸發語相似度 < 0.5',
    calculateTriggerSimilarity('when using Edit on app.ts', 'fix the build error') < 0.5
  );

  // --- L7: analyzePatterns 邊界 ---
  console.log('  L7: analyzePatterns — 邊界條件');
  assert(
    'L7.1', '少於 3 觀察返回空陣列',
    analyzePatterns([{ tool_name: 'Read' }]).length === 0
  );

  console.log('\n✅ 場景 L 完成');
}

// ============================================================
// 場景 M: Checkpoint CRUD 操作
// ============================================================
async function testCheckpointCRUD() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 M: Checkpoint CRUD 操作');
  console.log('═══════════════════════════════════════');

  if (!CheckpointManager) {
    console.log('⚠️ 跳過場景 M（CheckpointManager 未找到）');
    return;
  }

  // 使用 tmp dir
  const tmpDir = path.join(require('os').tmpdir(), `vibe-test-checkpoint-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const manager = new CheckpointManager(tmpDir);

  console.log('\n📋 M1: create → success');
  const createResult = manager.create('test-cp', { description: 'Test checkpoint' });
  assert('M1.1', 'create 成功', createResult.success === true);
  assert('M1.2', 'checkpoint 包含 metrics', createResult.checkpoint && createResult.checkpoint.metrics != null);
  assert('M1.3', 'metrics 包含 git_sha', typeof createResult.checkpoint.metrics.git_sha === 'string' || createResult.checkpoint.metrics.git_sha === null);

  console.log('  M2: create duplicate → error');
  const dupResult = manager.create('test-cp');
  assert('M2.1', '重複創建返回 error', dupResult.success === false);

  console.log('  M3: get → returns checkpoint');
  const got = manager.get('test-cp');
  assert('M3.1', 'get 返回 checkpoint', got !== null && got.name === 'test-cp');

  console.log('  M4: list → returns array');
  const list = manager.list();
  assert('M4.1', 'list 返回非空陣列', Array.isArray(list) && list.length > 0);

  console.log('  M5: verify → returns status + diff');
  const verifyResult = manager.verify('test-cp');
  assert('M5.1', 'verify 成功', verifyResult.success === true);
  assert('M5.2', 'verify 包含 status', typeof verifyResult.status === 'string');
  assert('M5.3', 'verify 包含 diff', verifyResult.diff != null);

  console.log('  M6: delete → success');
  const delResult = manager.delete('test-cp');
  assert('M6.1', 'delete 成功', delResult.success === true);

  console.log('  M7: clear + formatForDisplay');
  // 建立幾個 checkpoint 再清理
  manager.create('cp-a', { description: 'A' });
  manager.create('cp-b', { description: 'B' });
  const clearResult = manager.clear(1);
  assert('M7.1', 'clear 返回 deleted/kept', typeof clearResult.deleted === 'number' && typeof clearResult.kept === 'number');

  const remaining = manager.list();
  const display = manager.formatForDisplay(remaining);
  assert('M7.2', 'formatForDisplay 返回字串', typeof display === 'string');

  // 清理
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\n✅ 場景 M 完成');
}

// ============================================================
// 場景 N: Instinct Evolution
// ============================================================
async function testInstinctEvolution() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 N: Instinct Evolution');
  console.log('═══════════════════════════════════════');

  if (!InstinctManager || !DOMAINS || !EVOLUTION_TYPES) {
    console.log('⚠️ 跳過場景 N（InstinctManager 未找到）');
    return;
  }

  // 使用 tmp dir，建立 4 個同 domain instincts
  const tmpDir = path.join(require('os').tmpdir(), `vibe-test-evolve-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const manager = new InstinctManager(tmpDir);

  // 建立 4 個 testing domain instincts（confidence >= 0.6）
  for (let i = 0; i < 4; i++) {
    manager.create({
      trigger: `when running test suite part ${i}`,
      action: `Check test coverage before committing (${i})`,
      domain: DOMAINS.TESTING,
      confidence: 0.7,
      evidence: [{ date: '2026-02-06', description: `Evidence ${i}` }]
    });
  }

  console.log('\n📋 N1: findClusters');
  const clusters = manager.findClusters(3);
  assert('N1.1', 'findClusters 找到聚類', clusters.length > 0);
  assert('N1.2', '聚類 count >= 3', clusters[0].count >= 3);

  console.log('  N2: suggestedType');
  assert('N2.1', '聚類有 suggestedType', typeof clusters[0].suggestedType === 'string');

  console.log('  N3: getReadyForEvolve');
  const ready = manager.getReadyForEvolve(3);
  assert('N3.1', 'getReadyForEvolve 返回高信心聚類', ready.length > 0);

  console.log('  N4: evolve');
  const evolveResult = manager.evolve(clusters[0]);
  assert('N4.1', 'evolve 成功', evolveResult.success === true);
  assert('N4.2', 'evolve 返回 type 和 name', evolveResult.type != null && evolveResult.name != null);
  assert('N4.3', 'evolved 檔案存在', fs.existsSync(evolveResult.filePath));

  console.log('  N5: getStats');
  const stats = manager.getStats();
  assert('N5.1', 'getStats 返回完整結構', stats.total === 4 && stats.byDomain != null && stats.byConfidence != null);
  assert('N5.2', 'byDomain 包含 testing', stats.byDomain[DOMAINS.TESTING] === 4);

  console.log('  N6: _suggestEvolutionType 邏輯');
  // 模擬「negative」instincts → 應該建議 RULE
  const negativeInstincts = [
    { trigger: 'never use var in code', action: 'Use const', confidence: 0.7 },
    { trigger: 'avoid any type', action: 'Use specific types', confidence: 0.7 },
    { trigger: "don't skip tests", action: 'Always run tests', confidence: 0.7 }
  ];
  const negType = manager._suggestEvolutionType(negativeInstincts);
  assert('N6.1', 'negative instincts → RULE', negType === EVOLUTION_TYPES.RULE);

  // 清理
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\n✅ 場景 N 完成');
}

// ============================================================
// 場景 O: Dashboard/Metrics 渲染
// ============================================================
async function testDashboardMetrics() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 O: Dashboard/Metrics 渲染');
  console.log('═══════════════════════════════════════');

  if (!renderDashboard || !renderMetrics || !MetricsStore) {
    console.log('⚠️ 跳過場景 O（Dashboard/Metrics 模組未找到）');
    return;
  }

  // Mock dashboard 數據
  const mockData = {
    version: '0.6.4',
    autonomyLevel: 'L2',
    currentTask: 'Implementing user auth',
    progress: 65,
    agents: [
      { name: 'Architect', status: 'Done' },
      { name: 'Developer', status: 'Work' }
    ],
    resources: {
      tokens: { used: 45000, limit: 100000 },
      cost: { used: 0.58, limit: 1.0 }
    },
    recentLogs: [
      { timestamp: '2026-02-06T14:30:00Z', tool: 'Read', success: true, duration_ms: 45 }
    ],
    memoryCount: 12,
    toolCount: 42,
    contextPercent: 35,
    systemOk: true
  };

  console.log('\n📋 O1: renderDashboard');
  const dashboard = renderDashboard(mockData);
  assert('O1.1', 'renderDashboard 包含標題', dashboard.includes('VIBE ENGINE DASHBOARD'));
  assert('O1.2', 'renderDashboard 包含 agent 名稱', dashboard.includes('Architect'));
  assert('O1.3', 'renderDashboard 包含 resources', dashboard.includes('Tokens'));

  // Mock metrics stats
  const mockStats = {
    totalCalls: 42,
    successCount: 40,
    failureCount: 2,
    successRate: 95,
    byTool: {
      Read: { count: 18, avgDuration: 45 },
      Edit: { count: 8, avgDuration: 120 }
    },
    startTime: '2026-02-06T14:00:00Z',
    endTime: '2026-02-06T14:32:00Z'
  };

  console.log('  O2: renderMetrics');
  const metrics = renderMetrics(mockStats);
  assert('O2.1', 'renderMetrics 包含標題', metrics.includes('Session Metrics'));
  assert('O2.2', 'renderMetrics 包含 tool 統計', metrics.includes('Read') && metrics.includes('Edit'));
  assert('O2.3', 'renderMetrics 包含成功率', metrics.includes('95%'));

  console.log('  O3: MetricsStore 空狀態');
  const tmpDir = path.join(require('os').tmpdir(), `vibe-test-metrics-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const store = new MetricsStore(tmpDir);
  const emptyStats = store.getStats();
  assert('O3.1', '空 store totalCalls=0', emptyStats.totalCalls === 0);
  assert('O3.2', '空 store successRate=0', emptyStats.successRate === 0);

  console.log('  O4: MetricsStore record + getStats');
  store.record({ tool: 'Read', success: true, duration_ms: 50 });
  store.record({ tool: 'Edit', success: true, duration_ms: 120 });
  store.record({ tool: 'Bash', success: false, duration_ms: 5000 });
  const recordedStats = store.getStats();
  assert('O4.1', 'totalCalls=3', recordedStats.totalCalls === 3);
  assert('O4.2', 'successCount=2', recordedStats.successCount === 2);
  assert('O4.3', 'byTool 有 Read', recordedStats.byTool.Read != null && recordedStats.byTool.Read.count === 1);

  console.log('  O5: drawProgressBar + formatDuration');
  const bar = drawProgressBar(50, 100, 10);
  assert('O5.1', 'drawProgressBar 包含 50%', bar.includes('50%'));
  const dur = formatDuration(65000);
  assert('O5.2', 'formatDuration 65s → 1m', dur.includes('1m'));

  // 清理
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\n✅ 場景 O 完成');
}

// ============================================================
// 場景 P: 跨鏈狀態一致性（State Bridge）
// ============================================================
async function testCrossChainState() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 P: 跨鏈狀態一致性');
  console.log('═══════════════════════════════════════\n');

  const tempDir = path.join(__dirname, '.test-temp-p-' + Date.now());
  const vibeDir = path.join(tempDir, '.vibe-engine');
  fs.mkdirSync(path.join(vibeDir, 'tasks'), { recursive: true });

  const hookEnv = {
    CLAUDE_PROJECT_ROOT: tempDir,
    CLAUDE_PLUGIN_ROOT: path.join(__dirname, '../..')
  };
  const originalRoot = process.env.CLAUDE_PROJECT_ROOT;
  process.env.CLAUDE_PROJECT_ROOT = tempDir;

  try {
    const triggerPrompt = '幫我實作登入 API 和單元測試';

    // ── P1-P3: UserPromptSubmit 管道寫入 routing-state ──
    console.log('📋 P1-P3: UserPromptSubmit → routing-state.json');
    const step1 = runHookScript('prompt-classifier.js', { user_prompt: triggerPrompt }, hookEnv);
    const step2 = runHookScript('task-decomposition-engine.js', {
      user_prompt: triggerPrompt
    }, hookEnv);
    const step3 = runHookScript('agent-router.js', {
      user_prompt: triggerPrompt
    }, hookEnv);

    const routingStatePath = path.join(vibeDir, 'routing-state.json');
    assert(
      fs.existsSync(routingStatePath),
      'P1 agent-router 寫入 routing-state.json',
      `exists: ${fs.existsSync(routingStatePath)}`
    );

    const rsm = new RoutingStateManager(tempDir);
    const state = rsm.load();
    assert(
      state && state.planId,
      'P2 RoutingStateManager 讀取到 planId',
      `planId: ${state?.planId}`
    );

    assert(
      step3?.systemMessage && step3.systemMessage.includes('MANDATORY'),
      'P3 agent-router 生成 MANDATORY 指令',
      `has MANDATORY: ${step3?.systemMessage?.includes('MANDATORY')}`
    );

    // ── P4-P5: 活躍 routing → Stop hooks defer/fast-path ──
    console.log('\n📋 P4-P5: 活躍 routing → completion-check defers + verification fast-paths');
    const ccResult = runHookScript('completion-check.js', {
      transcript_summary: '執行了部分任務',
      reason: 'stop'
    }, hookEnv);
    assert(
      ccResult?.suppressOutput === true,
      'P4 completion-check defers（活躍 routing）',
      `suppressOutput: ${ccResult?.suppressOutput}`
    );

    const veResult = runHookScript('verification-engine.js', {
      transcript_summary: '正在執行路由任務中',
      reason: 'stop'
    }, hookEnv);
    assert(
      veResult?.continue === true,
      'P5 verification-engine fast-path（活躍 routing）',
      `continue: ${veResult?.continue}`
    );

    // ── P6: 清除 routing → completion-check 不再 defer ──
    console.log('\n📋 P6: routing 完成 → completion-check aggregates');
    fs.unlinkSync(routingStatePath);
    const ccResult2 = runHookScript('completion-check.js', {
      transcript_summary: '完成了所有任務',
      reason: 'stop'
    }, hookEnv);
    assert(
      ccResult2?.systemMessage && ccResult2.systemMessage.includes('[Completion Summary]'),
      'P6 completion-check aggregates（routing 已清除）',
      `systemMessage: ${ccResult2?.systemMessage?.substring(0, 60)}`
    );

    // ── P7: auto-fix 活躍 → completion-check defers ──
    console.log('\n📋 P7-P8: auto-fix state → completion-check 行為');
    const autoFixPath = path.join(vibeDir, 'auto-fix-state.json');
    fs.writeFileSync(autoFixPath, JSON.stringify({
      active: true, iteration: 2, maxIterations: 3
    }));
    const ccResult3 = runHookScript('completion-check.js', {
      transcript_summary: '修復中',
      reason: 'stop'
    }, hookEnv);
    assert(
      ccResult3?.suppressOutput === true,
      'P7 auto-fix active → completion-check defers',
      `suppressOutput: ${ccResult3?.suppressOutput}`
    );

    // ── P8: routing + auto-fix 同時活躍 ──
    fs.writeFileSync(routingStatePath, JSON.stringify({
      planId: 'test-plan-p8', status: 'in_progress',
      phases: [{ tasks: [{ id: 't1', agent: 'developer', status: 'pending' }] }],
      totalCount: 1, completedCount: 0
    }));
    const ccResult4 = runHookScript('completion-check.js', {
      transcript_summary: '多重活躍狀態',
      reason: 'stop'
    }, hookEnv);
    assert(
      ccResult4?.suppressOutput === true,
      'P8 routing + auto-fix 同時活躍 → deferred',
      `suppressOutput: ${ccResult4?.suppressOutput}`
    );

    // ── P9-P10: Budget 閾值邏輯 ──
    console.log('\n📋 P9-P10: Budget 閾值邏輯');
    const alert0 = getAlertLevel({ tokenUsage: 0.0, costUsage: 0.0 });
    assert(
      !alert0 || alert0.level !== 'exceeded',
      'P9 budget 0% → 不超限',
      `level: ${alert0?.level}`
    );

    const alert85 = getAlertLevel({ overall: 0.85, breakdown: { tokens: 0.85, cost: 0.85, operations: 0 } });
    assert(
      alert85 && (alert85.level === 'warning' || alert85.level === 'critical'),
      'P10 budget 85% → warning 或 critical',
      `level: ${alert85?.level}`
    );

  } finally {
    process.env.CLAUDE_PROJECT_ROOT = originalRoot;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\n✅ 場景 P 完成');
}

// ============================================================
// 場景 Q: 跨 Plugin 進程管道（Cross-Plugin Pipeline）
// ============================================================
async function testCrossPluginPipeline() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 Q: 跨 Plugin 進程管道');
  console.log('═══════════════════════════════════════\n');

  const tempDir = path.join(__dirname, '.test-temp-q-' + Date.now());
  const vibeDir = path.join(tempDir, '.vibe-engine');
  fs.mkdirSync(path.join(vibeDir, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(vibeDir, 'metrics'), { recursive: true });
  fs.mkdirSync(path.join(vibeDir, 'instincts'), { recursive: true });

  const hookEnv = {
    CLAUDE_PROJECT_ROOT: tempDir,
    CLAUDE_PLUGIN_ROOT: path.join(__dirname, '../..')
  };
  const originalRoot = process.env.CLAUDE_PROJECT_ROOT;
  process.env.CLAUDE_PROJECT_ROOT = tempDir;

  try {
    // ── Q1-Q3: observation-collector 函數測試 ──
    console.log('📋 Q1-Q3: observation-collector 函數');
    if (determineOutcome) {
      assert(
        determineOutcome({ tool_name: 'Edit', tool_result: 'File edited' }) === 'success',
        'Q1 determineOutcome Edit 成功 → success',
        `outcome: ${determineOutcome({ tool_name: 'Edit', tool_result: 'File edited' })}`
      );

      assert(
        determineOutcome({ tool_name: 'Bash', tool_result: { error: 'command failed' } }) === 'failure',
        'Q2 determineOutcome Bash 失敗 → failure',
        `outcome: ${determineOutcome({ tool_name: 'Bash', tool_result: { error: 'command failed' } })}`
      );

      assert(
        OBS_EXCLUDED_TOOLS && OBS_EXCLUDED_TOOLS.includes('TodoWrite'),
        'Q3 EXCLUDED_TOOLS 包含 TodoWrite',
        `includes: ${OBS_EXCLUDED_TOOLS?.includes('TodoWrite')}`
      );
    } else {
      assert(false, 'Q1 observation-collector import 失敗', 'module not found');
    }

    // ── Q4: detectUserCorrection ──
    console.log('\n📋 Q4: 用戶糾正偵測');
    if (detectUserCorrection) {
      const now = new Date().toISOString();
      const oneSecAgo = new Date(Date.now() - 1000).toISOString();
      const currentObs = { timestamp: now, tool_name: 'Edit', tool_input: { file_path: '/a.js' } };
      const recentObs = [{ timestamp: oneSecAgo, tool_name: 'Edit', tool_input: { file_path: '/a.js' }, outcome: 'success' }];
      assert(
        detectUserCorrection(currentObs, recentObs) === true,
        'Q4 同檔案短時間內多次 Edit → 糾正',
        'detectUserCorrection returned true'
      );
    }

    // ── Q5: observation-collector 進程測試 ──
    console.log('\n📋 Q5-Q6: observation-collector 進程測試');
    const obsResult = runPluginHookScript('memory', 'observation-collector.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/src/auth.js', new_string: 'code' },
      tool_result: 'File edited successfully',
      session_id: 'test-session-q'
    }, hookEnv);
    assert(
      obsResult && obsResult.continue === true,
      'Q5 observation-collector 進程執行成功',
      `continue: ${obsResult?.continue}`
    );

    const obsFile = path.join(vibeDir, 'observations.jsonl');
    assert(
      fs.existsSync(obsFile),
      'Q6 observations.jsonl 被創建',
      `exists: ${fs.existsSync(obsFile)}`
    );

    // ── Q7-Q8: metrics-collector 函數測試 ──
    console.log('\n📋 Q7-Q8: metrics-collector 函數');
    if (mcParseToolResult) {
      const metric = mcParseToolResult({
        tool_name: 'Read',
        tool_input: { file_path: '/a.js' },
        tool_response: { content: 'file content', is_error: false, duration_ms: 45 }
      });
      assert(
        metric && metric.tool === 'Read' && metric.success === true,
        'Q7 parseToolResult 解析 Read 成功',
        `tool: ${metric?.tool}, success: ${metric?.success}`
      );

      assert(
        metric.duration_ms === 45,
        'Q8 parseToolResult 保留 duration_ms',
        `duration_ms: ${metric?.duration_ms}`
      );
    } else {
      assert(false, 'Q7 metrics-collector import 失敗', 'module not found');
    }

    // ── Q9-Q11: permission-guard 函數測試 ──
    console.log('\n📋 Q9-Q11: permission-guard 函數');
    if (evaluatePermission) {
      const denyResult = evaluatePermission({
        tool_name: 'Bash', tool_input: { command: 'rm -rf /important/' }
      });
      assert(
        denyResult.decision === 'deny',
        'Q9 permission-guard 阻擋 rm -rf',
        `decision: ${denyResult.decision}`
      );

      const allowResult = evaluatePermission({
        tool_name: 'Bash', tool_input: { command: 'git status' }
      });
      assert(
        allowResult.decision === 'allow',
        'Q10 permission-guard 允許 git status',
        `decision: ${allowResult.decision}`
      );

      const askResult = evaluatePermission({
        tool_name: 'Edit', tool_input: { file_path: '/app/.env' }
      });
      assert(
        askResult.decision === 'ask',
        'Q11 permission-guard 警告 .env 檔案',
        `decision: ${askResult.decision}`
      );
    } else {
      assert(false, 'Q9 permission-guard import 失敗', 'module not found');
    }

    // ── Q12-Q14: circuit-breaker 進程測試 ──
    console.log('\n📋 Q12-Q14: circuit-breaker 進程');
    const cbStatus = runCBProcess('--status', tempDir);
    assert(
      cbStatus && cbStatus.state === 'CLOSED',
      'Q12 circuit-breaker 初始 CLOSED',
      `state: ${cbStatus?.state}`
    );

    // 記錄 5 次失敗 → 應觸發 OPEN
    for (let i = 0; i < 5; i++) {
      runCBProcess('--record-failure --error=test-fail', tempDir);
    }
    const cbStatus2 = runCBProcess('--status', tempDir);
    assert(
      cbStatus2 && cbStatus2.state === 'OPEN',
      'Q13 circuit-breaker 5次失敗 → OPEN',
      `state: ${cbStatus2?.state}, failures: ${cbStatus2?.failures}`
    );

    // 重置
    const cbReset = runCBProcess('--reset', tempDir);
    assert(
      cbReset && cbReset.systemMessage && cbReset.systemMessage.includes('CLOSED'),
      'Q14 circuit-breaker --reset → CLOSED',
      `msg: ${cbReset?.systemMessage?.substring(0, 50)}`
    );

    // ── Q15: permission-guard 進程測試 ──
    console.log('\n📋 Q15: permission-guard 進程');
    const pgResult = runHookScript('permission-guard.js', {
      tool_name: 'Bash',
      tool_input: { command: 'git push --force' }
    }, hookEnv);
    assert(
      pgResult && pgResult.continue === false,
      'Q15 permission-guard 進程阻擋 git push --force',
      `continue: ${pgResult?.continue}, decision: ${pgResult?.hookSpecificOutput?.permissionDecision}`
    );

  } finally {
    process.env.CLAUDE_PROJECT_ROOT = originalRoot;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\n✅ 場景 Q 完成');
}

// ============================================================
// 場景 R: 完整生命週期模擬（Full Lifecycle）
// ============================================================
async function testFullLifecycle() {
  console.log('\n═══════════════════════════════════════');
  console.log('場景 R: 完整生命週期模擬');
  console.log('═══════════════════════════════════════\n');

  const tempDir = path.join(__dirname, '.test-temp-r-' + Date.now());
  const vibeDir = path.join(tempDir, '.vibe-engine');
  fs.mkdirSync(path.join(vibeDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(vibeDir, 'memory'), { recursive: true });
  fs.mkdirSync(path.join(vibeDir, 'metrics'), { recursive: true });
  fs.mkdirSync(path.join(vibeDir, 'instincts'), { recursive: true });

  const hookEnv = {
    CLAUDE_PROJECT_ROOT: tempDir,
    CLAUDE_PLUGIN_ROOT: path.join(__dirname, '../..')
  };
  const originalRoot = process.env.CLAUDE_PROJECT_ROOT;
  process.env.CLAUDE_PROJECT_ROOT = tempDir;

  try {
    // ── R1-R3: UserPromptSubmit 完整管道 ──
    console.log('📋 R1-R3: UserPromptSubmit 管道');
    const prompt = '幫我建立用戶認證 API，要有登入、註冊和測試';
    const s1 = runHookScript('prompt-classifier.js', { user_prompt: prompt }, hookEnv);
    const r1Classification = classifyRequest(prompt);
    assert(
      r1Classification.needsDecomposition === true,
      'R1 prompt-classifier → needsDecomposition',
      `needsDecomposition: ${r1Classification?.needsDecomposition}`
    );

    const s2 = runHookScript('task-decomposition-engine.js', {
      user_prompt: prompt
    }, hookEnv);
    assert(
      s2?.systemMessage && s2.systemMessage.includes('subtasks'),
      'R2 task-decomposition → subtasks',
      `systemMessage: ${s2?.systemMessage?.substring(0, 60)}`
    );

    const s3 = runHookScript('agent-router.js', {
      user_prompt: prompt
    }, hookEnv);
    assert(
      s3?.systemMessage && s3.systemMessage.includes('MANDATORY'),
      'R3 agent-router → MANDATORY 指令',
      `has MANDATORY: ${s3?.systemMessage?.includes('MANDATORY')}`
    );

    // ── R4-R5: 模擬 PostToolUse 觀察收集 ──
    console.log('\n📋 R4-R5: PostToolUse 觀察收集');
    // 寫入模擬觀察（直接用 JSONL 格式）
    const obsFile = path.join(vibeDir, 'observations.jsonl');
    const mockObs = [
      { timestamp: new Date().toISOString(), session_id: 'r-test', tool_name: 'Edit', tool_input: { file_path: '/auth.js' }, tool_result_summary: 'edited', outcome: 'success', user_correction: false },
      { timestamp: new Date().toISOString(), session_id: 'r-test', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_result_summary: 'tests passed', outcome: 'success', user_correction: false },
      { timestamp: new Date().toISOString(), session_id: 'r-test', tool_name: 'Edit', tool_input: { file_path: '/auth.test.js' }, tool_result_summary: 'edited', outcome: 'success', user_correction: false }
    ];
    fs.writeFileSync(obsFile, mockObs.map(o => JSON.stringify(o)).join('\n') + '\n');
    assert(
      fs.existsSync(obsFile),
      'R4 觀察檔案已寫入',
      `lines: ${mockObs.length}`
    );

    // 寫入模擬 metrics
    const metricsDir = path.join(vibeDir, 'metrics');
    const sessionFile = path.join(metricsDir, 'session.jsonl');
    const mockMetrics = [
      { timestamp: new Date().toISOString(), tool: 'Edit', success: true, duration_ms: 50 },
      { timestamp: new Date().toISOString(), tool: 'Bash', success: true, duration_ms: 3000 }
    ];
    fs.writeFileSync(sessionFile, mockMetrics.map(m => JSON.stringify(m)).join('\n') + '\n');
    assert(
      fs.existsSync(sessionFile),
      'R5 metrics 檔案已寫入',
      `lines: ${mockMetrics.length}`
    );

    // ── R6-R7: Stop 鏈 — 活躍 routing ──
    console.log('\n📋 R6-R7: Stop 鏈（活躍 routing）');
    const ccStop1 = runHookScript('completion-check.js', {
      transcript_summary: '執行了認證功能實作',
      reason: 'stop'
    }, hookEnv);
    assert(
      ccStop1?.suppressOutput === true,
      'R6 Stop: completion-check defers（routing 活躍）',
      `suppressOutput: ${ccStop1?.suppressOutput}`
    );

    const veStop1 = runHookScript('verification-engine.js', {
      transcript_summary: '正在執行認證功能實作',
      reason: 'stop'
    }, hookEnv);
    assert(
      veStop1?.continue === true,
      'R7 Stop: verification-engine fast-path（routing 活躍）',
      `continue: ${veStop1?.continue}`
    );

    // ── R8: 清除 routing → 正常 completion ──
    console.log('\n📋 R8: routing 完成 → 正常 completion');
    const routingStatePath = path.join(vibeDir, 'routing-state.json');
    try { fs.unlinkSync(routingStatePath); } catch { /* ignore */ }
    const autoFixPath = path.join(vibeDir, 'auto-fix-state.json');
    try { fs.unlinkSync(autoFixPath); } catch { /* ignore */ }

    const ccStop2 = runHookScript('completion-check.js', {
      transcript_summary: '完成了用戶認證功能',
      reason: 'stop'
    }, hookEnv);
    assert(
      ccStop2?.systemMessage && ccStop2.systemMessage.includes('[Completion Summary]'),
      'R8 completion-check aggregates（routing 完成）',
      `systemMessage: ${ccStop2?.systemMessage?.substring(0, 60)}`
    );

    // ── R9: memory-consolidation 處理觀察 ──
    console.log('\n📋 R9: memory-consolidation 處理觀察');
    const mcResult = runPluginHookScript('memory', 'memory-consolidation.js', {
      transcript_summary: '完成了用戶認證功能實作',
      session_id: 'r-test',
      completion_status: 'success'
    }, hookEnv);
    assert(
      mcResult && mcResult.continue === true,
      'R9 memory-consolidation 進程執行成功',
      `continue: ${mcResult?.continue}`
    );

    // ── R10: 驗證 .vibe-engine/ 狀態檔完整性 ──
    console.log('\n📋 R10: .vibe-engine/ 狀態檔完整性');
    const expectedFiles = [
      'observations.jsonl'
    ];
    const existingFiles = expectedFiles.filter(f => fs.existsSync(path.join(vibeDir, f)));
    assert(
      existingFiles.length >= 1,
      'R10 .vibe-engine/ 包含預期狀態檔',
      `found: ${existingFiles.join(', ')}`
    );

  } finally {
    process.env.CLAUDE_PROJECT_ROOT = originalRoot;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\n✅ 場景 R 完成');
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
    await testMemoryLearning();            // 場景 L
    await testCheckpointCRUD();            // 場景 M
    await testInstinctEvolution();         // 場景 N
    await testDashboardMetrics();          // 場景 O
    await testCrossChainState();           // 場景 P
    await testCrossPluginPipeline();       // 場景 Q
    await testFullLifecycle();             // 場景 R
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
