#!/usr/bin/env node
/**
 * Budget Tracker Engine - 預算追蹤引擎
 *
 * 功能：
 * 1. 多維度預算追蹤（tokens, cost, time, operations）
 * 2. 三級警報系統（70% 警告, 90% 緊急, 100% 暫停）
 * 3. 智能模型路由建議
 * 4. 預算報告生成
 *
 * 用法：
 * - 在 PreToolUse 檢查預算
 * - 在 PostToolUse 更新使用量
 * - 直接呼叫生成報告
 *
 * 對應章節：Ch6 資源管理
 */

const fs = require('fs');
const path = require('path');

// 配置
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../..');
const VIBE_ENGINE_DIR = path.join(PLUGIN_ROOT, '../../.vibe-engine');
const CONFIG_FILE = path.join(VIBE_ENGINE_DIR, 'config.yaml');
const USAGE_DIR = path.join(VIBE_ENGINE_DIR, 'usage');

// 模型定價（美元/1M tokens）- 2024 價格
const MODEL_PRICING = {
  'claude-3-opus': {
    input: 15.0,
    output: 75.0,
    cached_input: 1.5
  },
  'claude-3-5-sonnet': {
    input: 3.0,
    output: 15.0,
    cached_input: 0.3
  },
  'claude-3-haiku': {
    input: 0.25,
    output: 1.25,
    cached_input: 0.025
  },
  // 簡化別名
  opus: { input: 15.0, output: 75.0, cached_input: 1.5 },
  sonnet: { input: 3.0, output: 15.0, cached_input: 0.3 },
  haiku: { input: 0.25, output: 1.25, cached_input: 0.025 }
};

// 預設預算配置
const DEFAULT_BUDGET = {
  tokens: {
    per_task: {
      simple: 20000,
      moderate: 50000,
      complex: 150000
    },
    per_session: 500000
  },
  cost: {
    per_task: 1.0,  // $1.00
    per_day: 20.0   // $20.00
  },
  operations: {
    file_edits: 50,
    bash_commands: 100
  },
  reserves: {
    memory_injection: 0.15,
    verification: 0.20
  }
};

// 警報閾值
const ALERT_THRESHOLDS = {
  warning: 0.70,    // 70%
  critical: 0.90,   // 90%
  exceeded: 1.00    // 100%
};

// 工具操作類型
const TOOL_OPERATIONS = {
  Edit: 'file_edit',
  Write: 'file_edit',
  Bash: 'bash_command',
  Read: 'read',
  Grep: 'read',
  Glob: 'read',
  Task: 'subagent'
};

/**
 * 載入配置
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf8');
      // 簡單 YAML 解析（只支援基本格式）
      const config = parseSimpleYaml(content);
      return { ...DEFAULT_BUDGET, ...config.budget };
    }
  } catch (error) {
    console.error(`[Budget Tracker] Config load error: ${error.message}`);
  }
  return DEFAULT_BUDGET;
}

/**
 * 簡單 YAML 解析
 */
function parseSimpleYaml(content) {
  const result = {};
  const lines = content.split('\n');
  let currentPath = [];
  let currentIndent = 0;

  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const content = line.trim();

    if (indent < currentIndent) {
      currentPath = currentPath.slice(0, Math.floor(indent / 2));
    }
    currentIndent = indent;

    if (content.includes(':')) {
      const [key, ...valueParts] = content.split(':');
      const value = valueParts.join(':').trim();

      if (value === '') {
        currentPath.push(key.trim());
      } else {
        let parsed = value;
        if (value.startsWith('$')) {
          parsed = parseFloat(value.slice(1));
        } else if (!isNaN(value)) {
          parsed = value.includes('.') ? parseFloat(value) : parseInt(value);
        } else if (value === 'true') {
          parsed = true;
        } else if (value === 'false') {
          parsed = false;
        }

        let obj = result;
        for (const p of currentPath) {
          obj[p] = obj[p] || {};
          obj = obj[p];
        }
        obj[key.trim()] = parsed;
      }
    }
  }

  return result;
}

/**
 * 載入使用量資料
 */
function loadUsage(sessionId) {
  const today = new Date().toISOString().split('T')[0];
  const usageFile = path.join(USAGE_DIR, `${today}.json`);

  try {
    if (fs.existsSync(usageFile)) {
      const content = fs.readFileSync(usageFile, 'utf8');
      const data = JSON.parse(content);
      return data[sessionId] || createEmptyUsage();
    }
  } catch (error) {
    console.error(`[Budget Tracker] Usage load error: ${error.message}`);
  }

  return createEmptyUsage();
}

/**
 * 建立空的使用量結構
 */
function createEmptyUsage() {
  return {
    tokens: {
      prompt: 0,
      completion: 0,
      cached: 0,
      total: 0
    },
    cost: 0,
    operations: {
      file_edits: 0,
      bash_commands: 0,
      reads: 0,
      subagents: 0
    },
    start_time: Date.now(),
    last_update: Date.now(),
    model_usage: {}
  };
}

/**
 * 保存使用量資料
 */
function saveUsage(sessionId, usage) {
  const today = new Date().toISOString().split('T')[0];
  const usageFile = path.join(USAGE_DIR, `${today}.json`);

  try {
    // 確保目錄存在
    if (!fs.existsSync(USAGE_DIR)) {
      fs.mkdirSync(USAGE_DIR, { recursive: true });
    }

    // 載入現有資料
    let data = {};
    if (fs.existsSync(usageFile)) {
      data = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
    }

    // 更新
    usage.last_update = Date.now();
    data[sessionId] = usage;

    // 保存
    fs.writeFileSync(usageFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`[Budget Tracker] Usage save error: ${error.message}`);
  }
}

/**
 * 計算成本
 */
function calculateCost(tokens, model = 'sonnet') {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.sonnet;

  const inputCost = (tokens.prompt - (tokens.cached || 0)) * pricing.input / 1000000;
  const cachedCost = (tokens.cached || 0) * pricing.cached_input / 1000000;
  const outputCost = tokens.completion * pricing.output / 1000000;

  return inputCost + cachedCost + outputCost;
}

/**
 * 取得預算使用率
 */
function getBudgetUsage(usage, budget, complexity = 'moderate') {
  const tokenLimit = budget.tokens.per_task[complexity] || budget.tokens.per_task.moderate;
  const tokenUsage = usage.tokens.total / tokenLimit;

  const costLimit = budget.cost.per_task;
  const costUsage = usage.cost / costLimit;

  const editLimit = budget.operations.file_edits;
  const editUsage = usage.operations.file_edits / editLimit;

  const bashLimit = budget.operations.bash_commands;
  const bashUsage = usage.operations.bash_commands / bashLimit;

  // 取最高使用率
  const maxUsage = Math.max(tokenUsage, costUsage, editUsage, bashUsage);

  return {
    overall: maxUsage,
    breakdown: {
      tokens: { used: usage.tokens.total, limit: tokenLimit, percentage: tokenUsage },
      cost: { used: usage.cost, limit: costLimit, percentage: costUsage },
      file_edits: { used: usage.operations.file_edits, limit: editLimit, percentage: editUsage },
      bash_commands: { used: usage.operations.bash_commands, limit: bashLimit, percentage: bashUsage }
    }
  };
}

/**
 * 判斷警報等級
 */
function getAlertLevel(budgetUsage) {
  const usage = budgetUsage.overall;

  if (usage >= ALERT_THRESHOLDS.exceeded) {
    return {
      level: 'exceeded',
      icon: '🛑',
      message: '預算已用盡，請增加預算或結束任務'
    };
  }
  if (usage >= ALERT_THRESHOLDS.critical) {
    return {
      level: 'critical',
      icon: '⚠️',
      message: '預算即將用盡，建議創建 checkpoint 並完成當前步驟'
    };
  }
  if (usage >= ALERT_THRESHOLDS.warning) {
    return {
      level: 'warning',
      icon: '⚡',
      message: '預算使用超過 70%，考慮使用更經濟的模型'
    };
  }
  return {
    level: 'normal',
    icon: '✅',
    message: '預算充足'
  };
}

/**
 * 建議模型選擇
 */
function suggestModel(budgetUsage, taskComplexity = 'moderate') {
  const usage = budgetUsage.overall;

  // 基於任務複雜度的預設選擇
  const complexityModel = {
    simple: 'haiku',
    moderate: 'sonnet',
    complex: 'opus'
  };

  let suggested = complexityModel[taskComplexity] || 'sonnet';
  let reason = `Task complexity: ${taskComplexity}`;

  // 預算壓力調整
  if (usage >= ALERT_THRESHOLDS.critical) {
    suggested = 'haiku';
    reason = 'Budget critical (>90%), forced to Haiku';
  } else if (usage >= ALERT_THRESHOLDS.warning) {
    if (suggested === 'opus') {
      suggested = 'sonnet';
      reason = 'Budget warning (>70%), downgraded from Opus';
    } else if (suggested === 'sonnet' && usage >= 0.85) {
      suggested = 'haiku';
      reason = 'Budget high (>85%), downgraded from Sonnet';
    }
  }

  return {
    model: suggested,
    reason,
    alternatives: getModelAlternatives(suggested)
  };
}

/**
 * 取得模型替代選項
 */
function getModelAlternatives(model) {
  const alternatives = {
    opus: ['sonnet', 'haiku'],
    sonnet: ['haiku'],
    haiku: []
  };
  return alternatives[model] || [];
}

/**
 * 記錄工具使用
 */
function recordToolUse(usage, toolName, tokenUsage = null, model = 'sonnet') {
  const opType = TOOL_OPERATIONS[toolName];

  if (opType === 'file_edit') {
    usage.operations.file_edits++;
  } else if (opType === 'bash_command') {
    usage.operations.bash_commands++;
  } else if (opType === 'read') {
    usage.operations.reads++;
  } else if (opType === 'subagent') {
    usage.operations.subagents++;
  }

  // 更新 token 使用（如果有）
  if (tokenUsage) {
    usage.tokens.prompt += tokenUsage.prompt_tokens || 0;
    usage.tokens.completion += tokenUsage.completion_tokens || 0;
    usage.tokens.cached += tokenUsage.cache_read_tokens || 0;
    usage.tokens.total = usage.tokens.prompt + usage.tokens.completion;

    // 更新成本
    usage.cost += calculateCost({
      prompt: tokenUsage.prompt_tokens || 0,
      completion: tokenUsage.completion_tokens || 0,
      cached: tokenUsage.cache_read_tokens || 0
    }, model);

    // 更新模型使用統計
    usage.model_usage[model] = usage.model_usage[model] || { calls: 0, tokens: 0 };
    usage.model_usage[model].calls++;
    usage.model_usage[model].tokens += (tokenUsage.prompt_tokens || 0) + (tokenUsage.completion_tokens || 0);
  }

  return usage;
}

/**
 * 生成預算報告
 */
function generateBudgetReport(usage, budget, complexity = 'moderate') {
  const budgetUsage = getBudgetUsage(usage, budget, complexity);
  const alert = getAlertLevel(budgetUsage);
  const modelSuggestion = suggestModel(budgetUsage, complexity);

  const elapsed = Date.now() - usage.start_time;
  const elapsedMinutes = Math.round(elapsed / 60000);

  return {
    budget_report: {
      timestamp: new Date().toISOString(),
      elapsed_time: `${elapsedMinutes}m`,
      usage: {
        tokens: {
          used: usage.tokens.total,
          limit: budgetUsage.breakdown.tokens.limit,
          percentage: `${Math.round(budgetUsage.breakdown.tokens.percentage * 100)}%`
        },
        cost: {
          used: `$${usage.cost.toFixed(2)}`,
          limit: `$${budget.cost.per_task.toFixed(2)}`,
          percentage: `${Math.round(budgetUsage.breakdown.cost.percentage * 100)}%`
        },
        operations: {
          file_edits: `${usage.operations.file_edits}/${budget.operations.file_edits}`,
          bash_commands: `${usage.operations.bash_commands}/${budget.operations.bash_commands}`
        }
      },
      overall_usage: `${Math.round(budgetUsage.overall * 100)}%`,
      alert: {
        level: alert.level,
        icon: alert.icon,
        message: alert.message
      },
      model_routing: {
        suggested: modelSuggestion.model,
        reason: modelSuggestion.reason,
        alternatives: modelSuggestion.alternatives
      },
      model_breakdown: usage.model_usage,
      recommendations: generateRecommendations(budgetUsage, alert)
    }
  };
}

/**
 * 生成建議
 */
function generateRecommendations(budgetUsage, alert) {
  const recommendations = [];

  if (alert.level === 'exceeded') {
    recommendations.push('增加預算以繼續任務');
    recommendations.push('保存當前進度並結束');
  } else if (alert.level === 'critical') {
    recommendations.push('創建 checkpoint 以保存進度');
    recommendations.push('完成當前步驟後暫停');
    recommendations.push('考慮簡化剩餘任務');
  } else if (alert.level === 'warning') {
    recommendations.push('切換到更經濟的模型');
    recommendations.push('減少不必要的探索操作');
  }

  // 特定維度建議
  if (budgetUsage.breakdown.file_edits.percentage > 0.8) {
    recommendations.push('檔案編輯次數接近上限，嘗試批量修改');
  }
  if (budgetUsage.breakdown.bash_commands.percentage > 0.8) {
    recommendations.push('命令執行次數接近上限，合併命令執行');
  }

  return recommendations.length > 0 ? recommendations : ['繼續正常執行'];
}

/**
 * 格式化報告為文字
 */
function formatReportText(report) {
  const r = report.budget_report;

  const lines = [
    '',
    '╔══════════════════════════════════════════════════╗',
    '║          Budget Tracker Report                   ║',
    '╠══════════════════════════════════════════════════╣',
    `║ ${r.alert.icon} Status: ${r.alert.level.toUpperCase().padEnd(10)} Usage: ${r.overall_usage.padEnd(6)}   ║`,
    '╠══════════════════════════════════════════════════╣',
    '║ Resource Usage                                   ║',
    `║ ├─ Tokens: ${r.usage.tokens.used.toString().padEnd(8)} / ${r.usage.tokens.limit.toString().padEnd(8)} (${r.usage.tokens.percentage})`.padEnd(53) + '║',
    `║ ├─ Cost:   ${r.usage.cost.used.padEnd(8)} / ${r.usage.cost.limit.padEnd(8)} (${r.usage.cost.percentage})`.padEnd(53) + '║',
    `║ ├─ Edits:  ${r.usage.operations.file_edits}`.padEnd(53) + '║',
    `║ └─ Bash:   ${r.usage.operations.bash_commands}`.padEnd(53) + '║',
    '╠══════════════════════════════════════════════════╣',
    '║ Model Routing                                    ║',
    `║ ├─ Suggested: ${r.model_routing.suggested}`.padEnd(53) + '║',
    `║ └─ Reason: ${r.model_routing.reason.slice(0, 35)}`.padEnd(53) + '║'
  ];

  if (r.recommendations.length > 0) {
    lines.push('╠══════════════════════════════════════════════════╣');
    lines.push('║ Recommendations                                  ║');
    r.recommendations.slice(0, 3).forEach((rec, i) => {
      const prefix = i === r.recommendations.length - 1 || i === 2 ? '└─' : '├─';
      lines.push(`║ ${prefix} ${rec.slice(0, 45)}`.padEnd(53) + '║');
    });
  }

  lines.push('╚══════════════════════════════════════════════════╝');
  lines.push('');

  return lines.join('\n');
}

/**
 * PreToolUse 檢查
 */
function preToolUseCheck(toolName, sessionId, budget, usage) {
  const budgetUsage = getBudgetUsage(usage, budget);
  const alert = getAlertLevel(budgetUsage);

  // 如果預算已用盡，阻止操作
  if (alert.level === 'exceeded') {
    return {
      continue: false,
      decision: 'block',
      reason: `預算已用盡 (${Math.round(budgetUsage.overall * 100)}%)。請增加預算或結束任務。`
    };
  }

  // 危險操作在緊急狀態下警告
  if (alert.level === 'critical' && ['Edit', 'Write', 'Bash'].includes(toolName)) {
    return {
      continue: true,
      decision: 'warn',
      reason: `預算緊急 (${Math.round(budgetUsage.overall * 100)}%)。建議完成當前步驟後暫停。`,
      suggested_model: 'haiku'
    };
  }

  return {
    continue: true,
    decision: 'approve',
    budget_status: `${Math.round(budgetUsage.overall * 100)}%`
  };
}

/**
 * 主函數
 */
async function main() {
  let input = '';

  // 讀取 stdin
  if (!process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');

    await new Promise((resolve) => {
      process.stdin.on('data', (chunk) => { input += chunk; });
      process.stdin.on('end', resolve);
    });
  }

  try {
    const budget = loadConfig();
    let sessionId = process.env.CLAUDE_SESSION_ID || 'default';
    let usage = loadUsage(sessionId);
    let hookType = null;
    let toolName = null;
    let complexity = 'moderate';

    // 解析輸入
    if (input.trim()) {
      try {
        const hookInput = JSON.parse(input);
        sessionId = hookInput.session_id || sessionId;

        // 判斷 hook 類型
        if (hookInput.tool_name) {
          toolName = hookInput.tool_name;
          hookType = hookInput.tool_result ? 'PostToolUse' : 'PreToolUse';
        }

        // 獲取任務複雜度（如果有）
        if (hookInput.hookSpecificOutput?.complexity) {
          complexity = hookInput.hookSpecificOutput.complexity;
        }

        // 處理 token 使用（PostToolUse）
        if (hookType === 'PostToolUse' && hookInput.tool_result) {
          const tokenUsage = hookInput.token_usage || null;
          const model = hookInput.model || 'sonnet';
          usage = recordToolUse(usage, toolName, tokenUsage, model);
          saveUsage(sessionId, usage);
        }

      } catch {
        // 不是 JSON，當作命令
      }
    }

    // 命令列參數處理
    const args = process.argv.slice(2);
    if (args.includes('--report') || args.includes('-r') || (!hookType && !input.trim())) {
      // 生成報告
      const report = generateBudgetReport(usage, budget, complexity);
      console.log(formatReportText(report));
      return;
    }

    if (args.includes('--json')) {
      const report = generateBudgetReport(usage, budget, complexity);
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (args.includes('--reset')) {
      usage = createEmptyUsage();
      saveUsage(sessionId, usage);
      console.log('Budget usage reset.');
      return;
    }

    // Hook 模式輸出
    if (hookType === 'PreToolUse') {
      const check = preToolUseCheck(toolName, sessionId, budget, usage);
      console.log(JSON.stringify(check));
    } else if (hookType === 'PostToolUse') {
      const budgetUsage = getBudgetUsage(usage, budget, complexity);
      const alert = getAlertLevel(budgetUsage);

      const output = {
        continue: true,
        suppressOutput: false,
        hookSpecificOutput: {
          budget_status: `${Math.round(budgetUsage.overall * 100)}%`,
          alert_level: alert.level
        }
      };

      // 警報時添加系統訊息 - 使用 Forced Eval Pattern 強制語言
      if (alert.level === 'exceeded') {
        output.systemMessage = `⛔ MANDATORY STOP: Budget exhausted (${Math.round(budgetUsage.overall * 100)}%). ⛔ BLOCK all further operations until budget reset or user approval.`;
        output.continue = false;
      } else if (alert.level === 'urgent') {
        output.systemMessage = `⛔ CRITICAL: Budget nearly exhausted (${Math.round(budgetUsage.overall * 100)}%). MUST create checkpoint immediately. Consider stopping or downgrading model.`;
      } else if (alert.level !== 'normal') {
        output.systemMessage = `[Budget Tracker] ${alert.icon} ${alert.message} (${Math.round(budgetUsage.overall * 100)}%)`;
      }

      console.log(JSON.stringify(output));
    } else {
      // 直接呼叫，顯示報告
      const report = generateBudgetReport(usage, budget, complexity);
      console.log(formatReportText(report));
    }

  } catch (error) {
    console.log(JSON.stringify({
      continue: true,
      error: error.message
    }));
  }
}

// 導出供其他模組使用
module.exports = {
  loadConfig,
  loadUsage,
  saveUsage,
  recordToolUse,
  getBudgetUsage,
  getAlertLevel,
  suggestModel,
  generateBudgetReport,
  calculateCost,
  DEFAULT_BUDGET,
  ALERT_THRESHOLDS,
  MODEL_PRICING
};

// 執行主函數
main().catch(console.error);
