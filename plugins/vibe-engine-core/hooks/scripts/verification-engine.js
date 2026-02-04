#!/usr/bin/env node
/**
 * Verification Engine - 自動化驗證協議
 *
 * 功能：
 * 1. 多層驗證協議（Minimal/Standard/Thorough）
 * 2. 六個驗證層（Static/Unit/Integration/E2E/LLM/Human）
 * 3. 預算感知（自動調整驗證層級）
 * 4. 標準優先級（P0/P1/P2）
 * 5. 結果報告生成
 *
 * 觸發點：
 * - Stop hook（任務完成時）
 * - /verify 命令（手動觸發）
 *
 * 對應章節：Ch2 閉環驗證
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// ============================================================
// 配置
// ============================================================

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../..');
const WORKSPACE_ROOT = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
const VIBE_ENGINE_DIR = path.join(WORKSPACE_ROOT, '.vibe-engine');
const VERIFICATION_DIR = path.join(VIBE_ENGINE_DIR, 'verification');

// 驗證層級配置
const VERIFICATION_LEVELS = {
  minimal: {
    description: '快速驗證 - 僅靜態分析',
    layers: ['static'],
    useWhen: ['純格式修改', '文檔更新', '配置變更']
  },
  standard: {
    description: '標準驗證 - 靜態分析 + 單元測試 + LLM Judge',
    layers: ['static', 'unit', 'llm'],
    useWhen: ['一般功能開發', '小型修復']
  },
  thorough: {
    description: '完整驗證 - 全部驗證層',
    layers: ['static', 'unit', 'integration', 'llm'],
    useWhen: ['API 變更', '安全相關', '架構調整']
  }
};

// 驗證標準優先級
const CRITERIA_PRIORITY = {
  P0: {  // 必須通過，否則失敗
    NO_SYNTAX_ERRORS: { description: '無語法錯誤', required: true },
    CODE_COMPILES: { description: '代碼可編譯', required: true }
  },
  P1: {  // 應該通過，可以警告
    TESTS_PASS: { description: '測試通過', required: false },
    LINT_PASS: { description: 'Lint 通過', required: false },
    TYPE_CHECK_PASS: { description: '型別檢查通過', required: false }
  },
  P2: {  // 最好通過，不阻擋
    COVERAGE_80: { description: '覆蓋率 > 80%', required: false },
    NO_TODO_COMMENTS: { description: '無 TODO 註解', required: false }
  }
};

// 專案類型偵測
const PROJECT_TYPES = {
  nodejs: {
    indicators: ['package.json', 'node_modules'],
    commands: {
      typecheck: 'npx tsc --noEmit',
      lint: 'npm run lint',
      test: 'npm test',
      build: 'npm run build'
    }
  },
  typescript: {
    indicators: ['tsconfig.json'],
    commands: {
      typecheck: 'npx tsc --noEmit',
      lint: 'npm run lint',
      test: 'npm test',
      build: 'npm run build'
    }
  },
  python: {
    indicators: ['requirements.txt', 'setup.py', 'pyproject.toml'],
    commands: {
      typecheck: 'python -m mypy .',
      lint: 'python -m flake8 .',
      test: 'python -m pytest',
      build: 'python setup.py build'
    }
  },
  rust: {
    indicators: ['Cargo.toml'],
    commands: {
      typecheck: 'cargo check',
      lint: 'cargo clippy',
      test: 'cargo test',
      build: 'cargo build'
    }
  },
  go: {
    indicators: ['go.mod'],
    commands: {
      typecheck: 'go vet ./...',
      lint: 'golangci-lint run',
      test: 'go test ./...',
      build: 'go build ./...'
    }
  }
};

// 預算閾值
const BUDGET_THRESHOLDS = {
  full: 0.30,      // > 30% 可執行完整驗證
  reduced: 0.10,   // 10-30% 執行簡化驗證
  minimal: 0.0     // < 10% 僅靜態分析
};

// ============================================================
// 專案偵測
// ============================================================

/**
 * 偵測專案類型
 */
function detectProjectType() {
  const detected = [];

  for (const [type, config] of Object.entries(PROJECT_TYPES)) {
    for (const indicator of config.indicators) {
      const indicatorPath = path.join(WORKSPACE_ROOT, indicator);
      if (fs.existsSync(indicatorPath)) {
        detected.push(type);
        break;
      }
    }
  }

  // 優先級：typescript > nodejs > 其他
  if (detected.includes('typescript')) return 'typescript';
  if (detected.includes('nodejs')) return 'nodejs';
  if (detected.length > 0) return detected[0];

  return 'unknown';
}

/**
 * 取得專案可用命令
 */
function getAvailableCommands(projectType) {
  const config = PROJECT_TYPES[projectType];
  if (!config) return {};

  const available = {};

  // 檢查 package.json scripts
  if (projectType === 'nodejs' || projectType === 'typescript') {
    const pkgPath = path.join(WORKSPACE_ROOT, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const scripts = pkg.scripts || {};

        // 檢查各命令是否可用
        if (scripts.lint || scripts['lint:check']) {
          available.lint = scripts.lint ? 'npm run lint' : 'npm run lint:check';
        }
        if (scripts.test || scripts['test:unit']) {
          available.test = scripts.test ? 'npm test' : 'npm run test:unit';
        }
        if (scripts.build) {
          available.build = 'npm run build';
        }
        if (scripts.typecheck || scripts['type-check']) {
          available.typecheck = scripts.typecheck ? 'npm run typecheck' : 'npm run type-check';
        } else if (fs.existsSync(path.join(WORKSPACE_ROOT, 'tsconfig.json'))) {
          available.typecheck = 'npx tsc --noEmit';
        }
      } catch (e) {
        // 使用預設
      }
    }
  }

  // 合併預設命令（如果未覆蓋）
  return { ...config.commands, ...available };
}

// ============================================================
// 預算整合
// ============================================================

/**
 * 讀取當前預算使用情況
 */
function getBudgetUsage() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const usageFile = path.join(VIBE_ENGINE_DIR, 'usage', `${today}.json`);

    if (fs.existsSync(usageFile)) {
      const usage = JSON.parse(fs.readFileSync(usageFile, 'utf8'));

      // 計算使用百分比
      const costLimit = 1.00; // $1 per task default
      const costUsed = usage.summary?.totalCost || 0;
      const costPercentage = costUsed / costLimit;

      return {
        used: costUsed,
        limit: costLimit,
        percentage: costPercentage,
        remaining: 1 - costPercentage
      };
    }
  } catch (e) {
    // 忽略錯誤
  }

  // 預設：假設有足夠預算
  return {
    used: 0,
    limit: 1.00,
    percentage: 0,
    remaining: 1.0
  };
}

/**
 * 根據預算決定驗證層級
 */
function selectVerificationLevel(budget, changeType) {
  // 安全相關變更強制完整驗證
  if (changeType === 'security') {
    return 'thorough';
  }

  // 根據剩餘預算選擇
  if (budget.remaining > BUDGET_THRESHOLDS.full) {
    // > 30% 預算：根據變更類型選擇
    if (changeType === 'architecture' || changeType === 'api') {
      return 'thorough';
    }
    return 'standard';
  } else if (budget.remaining > BUDGET_THRESHOLDS.reduced) {
    // 10-30% 預算：簡化驗證
    return 'minimal';
  } else {
    // < 10% 預算：僅靜態分析
    return 'minimal';
  }
}

// ============================================================
// 驗證層實作
// ============================================================

/**
 * 執行命令並捕獲結果
 */
function runCommand(command, options = {}) {
  const { timeout = 60000, cwd = WORKSPACE_ROOT } = options;

  try {
    const output = execSync(command, {
      cwd,
      timeout,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' }
    });

    return {
      success: true,
      output: output.trim(),
      exitCode: 0
    };
  } catch (error) {
    return {
      success: false,
      output: error.stdout?.toString() || '',
      error: error.stderr?.toString() || error.message,
      exitCode: error.status || 1
    };
  }
}

/**
 * Layer 1: 靜態分析
 */
async function runStaticAnalysis(commands) {
  const results = {
    layer: 'static',
    status: 'pass',
    checks: []
  };

  // Type check
  if (commands.typecheck) {
    const typecheck = runCommand(commands.typecheck, { timeout: 120000 });
    results.checks.push({
      name: 'typecheck',
      status: typecheck.success ? 'pass' : 'fail',
      output: typecheck.success ? 'No type errors' : typecheck.error,
      priority: 'P0'
    });

    if (!typecheck.success) {
      results.status = 'fail';
    }
  }

  // Lint
  if (commands.lint) {
    const lint = runCommand(commands.lint, { timeout: 60000 });
    results.checks.push({
      name: 'lint',
      status: lint.success ? 'pass' : 'fail',
      output: lint.success ? 'No lint errors' : lint.error,
      priority: 'P1'
    });

    // Lint 失敗不阻擋，只是警告
    if (!lint.success && results.status === 'pass') {
      results.status = 'warn';
    }
  }

  // Build check
  if (commands.build) {
    const build = runCommand(commands.build, { timeout: 180000 });
    results.checks.push({
      name: 'build',
      status: build.success ? 'pass' : 'fail',
      output: build.success ? 'Build successful' : build.error,
      priority: 'P0'
    });

    if (!build.success) {
      results.status = 'fail';
    }
  }

  return results;
}

/**
 * Layer 2: 單元測試
 */
async function runUnitTests(commands) {
  const results = {
    layer: 'unit',
    status: 'pass',
    checks: []
  };

  if (commands.test) {
    const test = runCommand(commands.test, { timeout: 300000 });

    // 嘗試解析測試結果
    let testSummary = {
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: null
    };

    // 簡單解析（可擴展）
    const output = test.output + (test.error || '');
    const passMatch = output.match(/(\d+)\s*(passing|passed)/i);
    const failMatch = output.match(/(\d+)\s*(failing|failed)/i);

    if (passMatch) testSummary.passed = parseInt(passMatch[1]);
    if (failMatch) testSummary.failed = parseInt(failMatch[1]);

    results.checks.push({
      name: 'unit_tests',
      status: test.success ? 'pass' : 'fail',
      summary: testSummary,
      output: test.success ? `${testSummary.passed} tests passed` : test.error,
      priority: 'P1'
    });

    if (!test.success) {
      results.status = 'fail';
    }
  } else {
    results.checks.push({
      name: 'unit_tests',
      status: 'skip',
      output: 'No test command configured',
      priority: 'P1'
    });
    results.status = 'skip';
  }

  return results;
}

/**
 * Layer 3: 整合測試
 */
async function runIntegrationTests(commands) {
  const results = {
    layer: 'integration',
    status: 'pass',
    checks: []
  };

  // 尋找整合測試命令
  const integrationCmd = commands['test:integration'] || commands['test:e2e'];

  if (integrationCmd) {
    const test = runCommand(integrationCmd, { timeout: 600000 });
    results.checks.push({
      name: 'integration_tests',
      status: test.success ? 'pass' : 'fail',
      output: test.success ? 'Integration tests passed' : test.error,
      priority: 'P1'
    });

    if (!test.success) {
      results.status = 'fail';
    }
  } else {
    results.checks.push({
      name: 'integration_tests',
      status: 'skip',
      output: 'No integration test command configured',
      priority: 'P1'
    });
    results.status = 'skip';
  }

  return results;
}

/**
 * Layer 5: LLM Judge（產生 prompt 供 Main Agent 判斷）
 */
async function runLLMJudge(context) {
  const results = {
    layer: 'llm',
    status: 'pending',
    checks: []
  };

  // 收集變更資訊
  let changes = '';
  try {
    changes = execSync('git diff --cached --stat 2>/dev/null || git diff HEAD~1 --stat 2>/dev/null', {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      timeout: 10000
    }).trim();
  } catch (e) {
    changes = '(無法取得變更資訊)';
  }

  // 生成 LLM Judge prompt
  const judgePrompt = `
## 代碼審查請求

請評估以下代碼變更是否正確且完整：

### 變更摘要
${changes || '(無變更)'}

### 原始任務
${context.originalRequest || '(未知)'}

### 評估標準
1. 功能正確性：變更是否實現了預期功能？
2. 代碼品質：代碼是否清晰、可維護？
3. 安全性：是否有潛在安全風險？
4. 完整性：是否遺漏了必要的測試或文檔？

請以 JSON 格式回覆：
\`\`\`json
{
  "verdict": "PASS | FAIL | NEEDS_REVIEW",
  "functionality_score": 1-10,
  "quality_score": 1-10,
  "risks": ["風險1", "風險2"],
  "suggestions": ["建議1", "建議2"]
}
\`\`\`
`;

  results.checks.push({
    name: 'llm_judge',
    status: 'pending',
    prompt: judgePrompt,
    priority: 'P2'
  });

  // LLM Judge 需要 Main Agent 執行，這裡只準備 prompt
  results.status = 'pending';

  return results;
}

// ============================================================
// 驗證報告
// ============================================================

/**
 * 生成驗證報告
 */
function generateReport(level, layerResults, context) {
  // 計算整體狀態
  let overallStatus = 'pass';
  const blockingIssues = [];
  const warnings = [];
  const recommendations = [];

  for (const layer of layerResults) {
    if (layer.status === 'fail') {
      // 檢查是否有 P0 失敗
      const p0Failures = layer.checks.filter(c => c.priority === 'P0' && c.status === 'fail');
      if (p0Failures.length > 0) {
        overallStatus = 'fail';
        p0Failures.forEach(c => blockingIssues.push(`[P0] ${c.name}: ${c.output}`));
      } else {
        if (overallStatus !== 'fail') overallStatus = 'partial';
        layer.checks.filter(c => c.status === 'fail').forEach(c => {
          warnings.push(`[${c.priority}] ${c.name}: ${c.output}`);
        });
      }
    }
  }

  // 生成建議
  if (blockingIssues.length > 0) {
    recommendations.push('修復所有 P0 blocking issues 後重新驗證');
  }
  if (warnings.length > 0) {
    recommendations.push('考慮修復 P1 warnings 以提升代碼品質');
  }

  const report = {
    verification_report: {
      level,
      status: overallStatus,
      timestamp: new Date().toISOString(),
      project_type: context.projectType,
      budget_remaining: `${Math.round(context.budget.remaining * 100)}%`,
      layers: {},
      blocking_issues: blockingIssues,
      warnings,
      recommendations
    }
  };

  // 填充各層結果
  for (const layer of layerResults) {
    report.verification_report.layers[layer.layer] = {
      status: layer.status,
      checks: layer.checks.map(c => ({
        name: c.name,
        status: c.status,
        priority: c.priority,
        ...(c.summary && { summary: c.summary }),
        ...(c.output && c.status !== 'pass' && { output: c.output })
      }))
    };
  }

  return report;
}

/**
 * 保存驗證報告
 */
function saveReport(report) {
  try {
    if (!fs.existsSync(VERIFICATION_DIR)) {
      fs.mkdirSync(VERIFICATION_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(VERIFICATION_DIR, `report-${timestamp}.json`);

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.error(`[Verification] Report saved: ${reportFile}`);

    // 同時更新 latest.json
    const latestFile = path.join(VERIFICATION_DIR, 'latest.json');
    fs.writeFileSync(latestFile, JSON.stringify(report, null, 2));

  } catch (error) {
    console.error(`[Verification] Failed to save report: ${error.message}`);
  }
}

// ============================================================
// 主流程
// ============================================================

/**
 * 執行驗證
 */
async function runVerification(options = {}) {
  const {
    level: requestedLevel,
    changeType = 'general',
    originalRequest = ''
  } = options;

  // 偵測專案類型
  const projectType = detectProjectType();
  const commands = getAvailableCommands(projectType);

  // 取得預算
  const budget = getBudgetUsage();

  // 決定驗證層級
  const level = requestedLevel || selectVerificationLevel(budget, changeType);
  const levelConfig = VERIFICATION_LEVELS[level];

  console.error(`[Verification] Starting ${level} verification`);
  console.error(`[Verification] Project type: ${projectType}`);
  console.error(`[Verification] Layers: ${levelConfig.layers.join(', ')}`);

  const context = {
    projectType,
    commands,
    budget,
    originalRequest
  };

  // 執行各層驗證
  const layerResults = [];

  for (const layerName of levelConfig.layers) {
    console.error(`[Verification] Running layer: ${layerName}`);

    let result;
    switch (layerName) {
      case 'static':
        result = await runStaticAnalysis(commands);
        break;
      case 'unit':
        result = await runUnitTests(commands);
        break;
      case 'integration':
        result = await runIntegrationTests(commands);
        break;
      case 'llm':
        result = await runLLMJudge(context);
        break;
      default:
        result = { layer: layerName, status: 'skip', checks: [] };
    }

    layerResults.push(result);

    // P0 失敗時快速終止（除非是最後一層）
    if (result.status === 'fail') {
      const hasP0Failure = result.checks.some(c => c.priority === 'P0' && c.status === 'fail');
      if (hasP0Failure && layerName !== levelConfig.layers[levelConfig.layers.length - 1]) {
        console.error(`[Verification] P0 failure detected, stopping early`);
        break;
      }
    }
  }

  // 生成報告
  const report = generateReport(level, layerResults, context);

  // 保存報告
  saveReport(report);

  return report;
}

/**
 * 格式化報告為人類可讀格式
 */
function formatReportForDisplay(report) {
  const r = report.verification_report;
  const lines = [];

  // 標題
  const statusIcon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
  lines.push('');
  lines.push('╔══════════════════════════════════════════════════╗');
  lines.push('║            Verification Report                   ║');
  lines.push('╠══════════════════════════════════════════════════╣');
  lines.push(`║ Status: ${statusIcon} ${r.status.toUpperCase().padEnd(39)}║`);
  lines.push(`║ Level: ${r.level.padEnd(41)}║`);
  lines.push(`║ Project: ${r.project_type.padEnd(39)}║`);
  lines.push(`║ Budget Remaining: ${r.budget_remaining.padEnd(30)}║`);
  lines.push('╠══════════════════════════════════════════════════╣');
  lines.push('║ Layer Results                                    ║');

  // 各層結果
  for (const [layerName, layer] of Object.entries(r.layers)) {
    const layerIcon = layer.status === 'pass' ? '✅' : layer.status === 'fail' ? '❌' : layer.status === 'skip' ? '⏭️' : '⏳';
    lines.push(`║ ${layerIcon} ${layerName.padEnd(46)}║`);

    for (const check of layer.checks) {
      const checkIcon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : check.status === 'skip' ? '-' : '?';
      lines.push(`║   ${checkIcon} ${check.name} [${check.priority}]`.padEnd(51) + '║');
    }
  }

  // Blocking issues
  if (r.blocking_issues.length > 0) {
    lines.push('╠══════════════════════════════════════════════════╣');
    lines.push('║ ❌ Blocking Issues                                ║');
    for (const issue of r.blocking_issues) {
      const truncated = issue.length > 48 ? issue.substring(0, 45) + '...' : issue;
      lines.push(`║   ${truncated}`.padEnd(51) + '║');
    }
  }

  // Warnings
  if (r.warnings.length > 0) {
    lines.push('╠══════════════════════════════════════════════════╣');
    lines.push('║ ⚠️  Warnings                                      ║');
    for (const warn of r.warnings.slice(0, 3)) {
      const truncated = warn.length > 48 ? warn.substring(0, 45) + '...' : warn;
      lines.push(`║   ${truncated}`.padEnd(51) + '║');
    }
    if (r.warnings.length > 3) {
      lines.push(`║   ... and ${r.warnings.length - 3} more`.padEnd(51) + '║');
    }
  }

  // Recommendations
  if (r.recommendations.length > 0) {
    lines.push('╠══════════════════════════════════════════════════╣');
    lines.push('║ 💡 Recommendations                               ║');
    for (const rec of r.recommendations) {
      const truncated = rec.length > 48 ? rec.substring(0, 45) + '...' : rec;
      lines.push(`║   ${truncated}`.padEnd(51) + '║');
    }
  }

  lines.push('╚══════════════════════════════════════════════════╝');
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// Hook 入口
// ============================================================

async function main() {
  // 檢查是否從 stdin 接收 hook input
  let hookInput = null;

  if (!process.stdin.isTTY) {
    let input = '';
    process.stdin.setEncoding('utf8');

    await new Promise((resolve) => {
      process.stdin.on('data', (chunk) => { input += chunk; });
      process.stdin.on('end', () => {
        if (input.trim()) {
          try {
            hookInput = JSON.parse(input);
          } catch (e) {
            // 不是 JSON，可能是直接呼叫
          }
        }
        resolve();
      });

      // 超時處理
      setTimeout(resolve, 100);
    });
  }

  // 從命令列參數或 hook input 取得選項
  const args = process.argv.slice(2);
  let options = {};

  if (hookInput) {
    // 從 Stop hook 觸發
    options = {
      originalRequest: hookInput.transcript_summary || '',
      changeType: hookInput.change_type || 'general'
    };
  } else if (args.includes('--level')) {
    // 命令列指定層級
    const levelIndex = args.indexOf('--level');
    options.level = args[levelIndex + 1] || 'standard';
  }

  // 執行驗證
  const report = await runVerification(options);

  // 輸出結果
  if (hookInput) {
    // Hook 呼叫：輸出 hook response
    const displayReport = formatReportForDisplay(report);
    const isBlocking = report.verification_report.status === 'fail';

    const output = {
      continue: !isBlocking,
      stopReason: isBlocking ? 'Verification failed with blocking issues' : undefined,
      systemMessage: displayReport
    };

    console.log(JSON.stringify(output));
  } else {
    // 直接呼叫：輸出報告
    console.log(formatReportForDisplay(report));
  }
}

// 導出供測試使用
module.exports = {
  runVerification,
  detectProjectType,
  getAvailableCommands,
  selectVerificationLevel,
  formatReportForDisplay
};

// 執行
main().catch(console.error);
