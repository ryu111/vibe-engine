#!/usr/bin/env node
/**
 * Agent Router - 根據分類自動派發 Task 給 SubAgents
 *
 * 功能：
 * 1. 讀取 prompt-classifier 的分類結果
 * 2. 讀取 task-decomposition-engine 的任務分解
 * 3. 根據分類和分解結果，產生路由指令
 * 4. 遵循 Star Topology 原則（所有路由通過 Main Agent）
 * 5. 支援並行執行群組
 *
 * 觸發點：
 * - UserPromptSubmit hook（在 task-decomposition-engine 之後）
 *
 * 對應章節：Ch1 協調引擎
 */

const fs = require('fs');
const path = require('path');
const { getProjectRoot, generateId } = require('./lib/common');
const { parseSimpleYaml } = require('./lib/yaml-parser');
const { RoutingStateManager } = require('./lib/routing-state-manager');

// ============================================================
// 配置
// ============================================================

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../..');

const PROJECT_ROOT = getProjectRoot();
const VIBE_ENGINE_DIR = path.join(PROJECT_ROOT, '.vibe-engine');
const TASKS_DIR = path.join(VIBE_ENGINE_DIR, 'tasks');

// Agent 定義
const AGENTS = {
  architect: {
    name: 'architect',
    description: 'Software architecture specialist',
    model: 'opus',
    capabilities: ['design', 'api', 'architecture', 'interface', 'schema'],
    tools: ['Read', 'Grep', 'Glob'],
    maxConcurrent: 1,
    costWeight: 3  // opus 成本較高
  },
  developer: {
    name: 'developer',
    description: 'Code implementation specialist',
    model: 'sonnet',
    capabilities: ['implement', 'fix', 'refactor', 'code', 'edit'],
    tools: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
    maxConcurrent: 2,
    costWeight: 2
  },
  tester: {
    name: 'tester',
    description: 'Testing specialist',
    model: 'sonnet',
    capabilities: ['test', 'verify', 'assert', 'spec', 'coverage'],
    tools: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
    maxConcurrent: 1,
    costWeight: 2
  },
  reviewer: {
    name: 'reviewer',
    description: 'Code review and security specialist',
    model: 'sonnet',
    capabilities: ['review', 'security', 'audit', 'quality'],
    tools: ['Read', 'Grep', 'Glob', 'Bash'],
    maxConcurrent: 1,
    costWeight: 2
  },
  explorer: {
    name: 'explorer',
    description: 'Code exploration specialist',
    model: 'haiku',
    capabilities: ['search', 'find', 'explore', 'analyze', 'understand'],
    tools: ['Read', 'Grep', 'Glob'],
    maxConcurrent: 3,
    costWeight: 1  // haiku 成本較低
  }
};

// 路由規則
const ROUTING_RULES = {
  // 直接回答條件（不委派）
  directResponse: {
    patterns: [
      /^(what|how|why|where|which|explain|describe|tell me)/i,
      /^(什麼|如何|為什麼|哪|解釋|說明)/,
      /\?$/,
      /^\/status/,
      /^\/help/,
      /^\/budget/
    ],
    complexityThreshold: 'simple'
  },

  // Agent 路由映射
  agentMapping: {
    architecture: ['architect'],
    design: ['architect'],
    implement: ['developer'],
    fix: ['developer', 'explorer'],
    refactor: ['developer', 'architect'],
    test: ['tester'],
    review: ['reviewer'],
    explore: ['explorer'],
    search: ['explorer'],
    security: ['reviewer']
  },

  // 任務類型到 Agent 流程
  taskFlows: {
    newFeature: ['architect', 'developer', 'tester', 'reviewer'],
    bugFix: ['explorer', 'developer', 'tester'],
    refactor: ['architect', 'developer', 'reviewer'],
    documentation: ['explorer', 'developer'],
    security: ['reviewer', 'developer'],
    exploration: ['explorer']
  }
};

// 並行限制
const CONCURRENCY_LIMITS = {
  maxParallelAgents: 4,
  maxParallelPerType: {
    architect: 1,
    developer: 2,
    tester: 1,
    reviewer: 1,
    explorer: 3
  }
};

// ============================================================
// 任務讀取
// ============================================================

/**
 * 讀取最新的任務分解檔案
 */
function getLatestTaskDecomposition() {
  try {
    if (!fs.existsSync(TASKS_DIR)) {
      return null;
    }

    const files = fs.readdirSync(TASKS_DIR)
      .filter(f => f.startsWith('task-') && f.endsWith('.yaml'))
      .sort()
      .reverse();

    if (files.length === 0) {
      return null;
    }

    const latestFile = path.join(TASKS_DIR, files[0]);
    const content = fs.readFileSync(latestFile, 'utf8');

    // 簡單解析 YAML（不用外部庫）
    return parseSimpleYaml(content);
  } catch (error) {
    console.error(`[Agent Router] Error reading task: ${error.message}`);
    return null;
  }
}

// ============================================================
// 路由決策
// ============================================================

/**
 * 判斷是否應該直接回答（不委派）
 */
function shouldDirectResponse(prompt, classification) {
  // 檢查複雜度
  if (classification.complexity === 'simple') {
    return true;
  }

  // 檢查 pattern
  for (const pattern of ROUTING_RULES.directResponse.patterns) {
    if (pattern.test(prompt)) {
      return true;
    }
  }

  // 檢查請求類型
  if (classification.requestType === 'query') {
    return true;
  }

  return false;
}

/**
 * 根據任務選擇最佳 Agent
 */
function selectAgent(task) {
  // 如果任務已指定 agent
  if (task.agent && AGENTS[task.agent]) {
    return task.agent;
  }

  // 根據任務描述分析
  const description = (task.description || '').toLowerCase();

  // 嘗試匹配關鍵字
  for (const [keyword, agents] of Object.entries(ROUTING_RULES.agentMapping)) {
    if (description.includes(keyword)) {
      return agents[0];
    }
  }

  // 檢查 agent 能力匹配
  let bestMatch = null;
  let bestScore = 0;

  for (const [agentName, agent] of Object.entries(AGENTS)) {
    let score = 0;
    for (const capability of agent.capabilities) {
      if (description.includes(capability)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = agentName;
    }
  }

  return bestMatch || 'developer';  // 預設使用 developer
}

// ============================================================
// 路由計劃輔助函數（Phase 3 重構提取）
// ============================================================

/**
 * 構建單一任務對象（消除重複代碼）
 */
function buildTask(task, plan) {
  const agent = selectAgent(task);
  plan.agents.add(agent);
  plan.estimatedCost += AGENTS[agent]?.costWeight || 2;

  return {
    id: task.id,
    agent,
    description: task.description,
    inputs: task.inputs || [],
    outputs: task.outputs || [],
    model: AGENTS[agent]?.model || 'sonnet'
  };
}

/**
 * 從並行群組構建階段
 */
function buildPhaseFromGroup(group, subtasks, phaseNumber, plan) {
  const phase = {
    phase: phaseNumber,
    parallel: Object.keys(group).length > 1,
    tasks: []
  };

  for (const taskId of Object.values(group)) {
    const task = subtasks.find(t => t.id === taskId);
    if (task) {
      phase.tasks.push(buildTask(task, plan));
    }
  }

  return phase;
}

/**
 * 生成路由計劃（重構後）
 */
function generateRoutingPlan(taskDecomposition, classification) {
  if (!taskDecomposition?.task_decomposition) {
    return null;
  }

  const plan = {
    strategy: 'sequential',
    phases: [],
    estimatedCost: 0,
    agents: new Set()
  };

  const decomposition = taskDecomposition.task_decomposition;
  const subtasks = Array.isArray(decomposition.subtasks) ? decomposition.subtasks : [];
  const executionOrder = decomposition.execution_order || {};
  const parallelGroups = executionOrder.parallel_groups || [];

  if (parallelGroups.length > 0) {
    plan.strategy = parallelGroups.length > 1 ? 'hybrid' : 'sequential';
    parallelGroups.forEach((group, i) => {
      plan.phases.push(buildPhaseFromGroup(group, subtasks, i + 1, plan));
    });
  } else {
    // 序列執行：每個任務一個階段
    subtasks.forEach((task, i) => {
      plan.phases.push({
        phase: i + 1,
        parallel: false,
        tasks: [buildTask(task, plan)]
      });
    });
  }

  plan.agents = Array.from(plan.agents);
  return plan;
}

// ============================================================
// 指令格式化器（Phase 3 重構提取）
// ============================================================

const InstructionFormatter = {
  BOX_WIDTH: 52,

  boxLine(content) {
    return `║ ${content}`.padEnd(this.BOX_WIDTH) + '║';
  },

  formatHeader(plan) {
    return [
      '',
      '╔══════════════════════════════════════════════════╗',
      '║           Agent Routing Plan                     ║',
      '╠══════════════════════════════════════════════════╣',
      this.boxLine(`Strategy: ${plan.strategy}`),
      this.boxLine(`Phases: ${plan.phases.length}`),
      this.boxLine(`Agents: ${plan.agents.join(', ').slice(0, 38)}`),
      this.boxLine(`Est. Cost: ${plan.estimatedCost} units`),
      '╠══════════════════════════════════════════════════╣'
    ];
  },

  formatPhases(phases) {
    const lines = [];
    for (const phase of phases) {
      lines.push(this.boxLine(`Phase ${phase.phase}: ${phase.parallel ? '並行' : '序列'}`));
      for (const task of phase.tasks) {
        lines.push(this.boxLine(`├─ [${task.agent}] ${task.description.slice(0, 33)}`));
      }
    }
    return lines;
  },

  formatGuidelines() {
    return [
      '╠══════════════════════════════════════════════════╣',
      '║ 執行指引                                         ║',
      '║ 1. 按照 Phase 順序執行                           ║',
      '║ 2. 同一 Phase 的任務可並行 (使用 Task tool)      ║',
      '║ 3. 等待前一 Phase 完成後再開始下一 Phase         ║',
      '║ 4. 收集所有結果後彙整回覆                        ║',
      '╚══════════════════════════════════════════════════╝',
      ''
    ];
  },

  formatTaskExample(task) {
    return [
      `Task({`,
      `  subagent_type: "vibe-engine-core:${task.agent}",`,
      `  description: "${task.description.slice(0, 30)}...",`,
      `  prompt: "${task.description}",`,
      `  model: "${task.model}"`,
      `})`,
      ''
    ];
  },

  formatExamples(phases) {
    const lines = ['【Task 呼叫範例】', ''];
    for (const phase of phases) {
      lines.push(`// Phase ${phase.phase}${phase.parallel ? ' (並行執行)' : ''}`);
      if (phase.parallel && phase.tasks.length > 1) {
        lines.push('// 在單一訊息中使用多個 Task tool 呼叫：');
      }
      for (const task of phase.tasks) {
        lines.push(...this.formatTaskExample(task));
      }
    }
    return lines;
  }
};

/**
 * 生成路由指令（重構後 - 舊版保留供參考）
 */
function generateRoutingInstructions(plan, originalRequest) {
  if (!plan || plan.phases.length === 0) {
    return null;
  }

  return [
    ...InstructionFormatter.formatHeader(plan),
    ...InstructionFormatter.formatPhases(plan.phases),
    ...InstructionFormatter.formatGuidelines(),
    ...InstructionFormatter.formatExamples(plan.phases)
  ].join('\n');
}

// ============================================================
// 強制執行指令生成器（新版 - 自動路由）
// ============================================================

/**
 * 生成強制執行指令
 * 這不是建議，而是必須執行的指令
 */
function generateRoutingDirective(plan, planId, originalRequest) {
  if (!plan || plan.phases.length === 0) {
    return null;
  }

  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║  ⚠️  MANDATORY EXECUTION DIRECTIVE - 強制執行指令                 ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Plan ID: ${planId.padEnd(53)}║`,
    `║  Strategy: ${plan.strategy.padEnd(52)}║`,
    `║  Total Tasks: ${String(plan.phases.reduce((s, p) => s + p.tasks.length, 0)).padEnd(49)}║`,
    '╠══════════════════════════════════════════════════════════════════╣',
    '║  此路由計劃為【強制執行】，不可跳過或自行決定。                   ║',
    '╚══════════════════════════════════════════════════════════════════╝',
    ''
  ];

  // 每個 Phase 的任務
  for (const phase of plan.phases) {
    lines.push(`### Phase ${phase.phase} ${phase.parallel ? '(並行執行)' : '(序列執行)'}`);
    lines.push('');

    for (const task of phase.tasks) {
      lines.push(`**MUST**: 使用 Task tool 執行以下任務`);
      lines.push('```');
      lines.push(`Task({`);
      lines.push(`  subagent_type: "vibe-engine-core:${task.agent}",`);
      lines.push(`  description: "${task.description.slice(0, 40)}...",`);
      lines.push(`  prompt: "${task.description}",`);
      lines.push(`  model: "${task.model}"`);
      lines.push(`})`);
      lines.push('```');
      lines.push('');
    }
  }

  // 執行規則
  lines.push('---');
  lines.push('### 執行規則 (MUST FOLLOW)');
  lines.push('');
  lines.push('1. **必須**按 Phase 順序執行，同一 Phase 可並行');
  lines.push('2. **每個 MUST 項目都必須執行**，不可跳過任何一個');
  lines.push('3. 如遇到錯誤，報告錯誤但**繼續執行**其他任務');
  lines.push(`4. 完成所有任務後，在回覆末尾標記: \`[Routing Complete: ${planId}]\``);
  lines.push('');
  lines.push('⛔ **違反此指令將導致任務被判定為未完成，Stop hook 會強制要求繼續執行**');
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  // 讀取 stdin
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
            // 不是 JSON
          }
        }
        resolve();
      });

      setTimeout(resolve, 100);
    });
  }

  // 取得分類結果（從 hookInput 或環境變數）
  let classification = {
    complexity: 'moderate',
    requestType: 'action',
    suggestedAgent: null
  };

  if (hookInput && hookInput.hookSpecificOutput) {
    classification = hookInput.hookSpecificOutput;
  }

  const userPrompt = hookInput?.user_prompt || '';

  // 檢查是否應該直接回答
  if (shouldDirectResponse(userPrompt, classification)) {
    const output = {
      continue: true,
      suppressOutput: true,  // 簡單請求不輸出路由計劃
      hookSpecificOutput: {
        routing: 'direct',
        reason: 'Simple request, no delegation needed'
      }
    };
    console.log(JSON.stringify(output));
    return;
  }

  // 讀取任務分解
  const taskDecomposition = getLatestTaskDecomposition();

  if (!taskDecomposition) {
    // 沒有任務分解，檢查是否需要
    const isComplex = classification.complexity === 'moderate' || classification.complexity === 'complex';
    const suggestedAgent = classification.suggestedAgent || 'developer';

    let systemMessage;
    if (isComplex) {
      // 複雜任務但沒有任務分解 - 使用強制語言
      systemMessage = `⛔ CRITICAL: Complex task detected but no task decomposition found.\n\n**MUST** use task-decomposition skill BEFORE starting implementation.\n\nSuggested workflow:\n1. Use task-decomposition skill to break down the task\n2. Follow the generated routing plan\n3. Execute subtasks according to dependency order\n\n⛔ BLOCK: 複雜任務未經分解禁止直接實作。`;
    } else {
      systemMessage = `[Agent Router] Routing to ${suggestedAgent} agent for this request.`;
    }

    const output = {
      continue: true,
      suppressOutput: false,
      systemMessage,
      hookSpecificOutput: {
        routing: 'single',
        agent: suggestedAgent,
        needsDecomposition: isComplex
      }
    };
    console.log(JSON.stringify(output));
    return;
  }

  // 生成路由計劃
  const plan = generateRoutingPlan(taskDecomposition, classification);

  if (!plan) {
    const output = {
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        routing: 'direct',
        reason: 'Could not generate routing plan'
      }
    };
    console.log(JSON.stringify(output));
    return;
  }

  // 創建路由狀態追蹤
  const routingManager = new RoutingStateManager(PROJECT_ROOT);
  const routingState = routingManager.createPlan(plan, userPrompt);
  const planId = routingState.planId;

  // 生成強制執行指令（新版）
  const directive = generateRoutingDirective(plan, planId, userPrompt);

  // 輸出結果
  const output = {
    continue: true,
    suppressOutput: false,
    systemMessage: directive,
    hookSpecificOutput: {
      routing: plan.strategy,
      planId: planId,
      phases: plan.phases.length,
      agents: plan.agents,
      estimatedCost: plan.estimatedCost,
      totalTasks: routingState.totalCount,
      isDirective: true  // 標記這是強制指令
    }
  };

  console.log(JSON.stringify(output));
}

// 導出供測試
module.exports = {
  AGENTS,
  ROUTING_RULES,
  shouldDirectResponse,
  selectAgent,
  generateRoutingPlan,
  generateRoutingInstructions,
  generateRoutingDirective  // 新增
};

// 執行
main().catch(console.error);
