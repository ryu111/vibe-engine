#!/usr/bin/env node
/**
 * Task Decomposition Engine - 任務分解引擎
 *
 * 功能：
 * 1. 分析複雜任務的職責、檔案、依賴
 * 2. 選擇合適的分解策略
 * 3. 生成可並行執行的子任務計劃
 * 4. 遵循 Star Topology 原則
 *
 * 用法：
 * - 作為 Hook 在 UserPromptSubmit 後執行
 * - 或作為獨立腳本被呼叫
 *
 * 對應章節：Ch1 協調引擎
 */

const fs = require('fs');
const path = require('path');
const { getProjectRoot, getVibeEnginePaths, safeReadJSON } = require('./lib/common');
const { readHookInput, writeHookOutput } = require('./lib/hook-io');
const { jsonToYaml } = require('./lib/yaml-parser');
const { sanitizePrompt, detectCompoundRequirements } = require('./prompt-classifier');

// 配置
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../..');
const PROJECT_ROOT = getProjectRoot();
const VIBE_ENGINE_DIR = path.join(PROJECT_ROOT, '.vibe-engine');
const TASKS_DIR = path.join(VIBE_ENGINE_DIR, 'tasks');

// Agent 定義及其能力
const AGENTS = {
  architect: {
    role: '架構設計',
    capabilities: ['設計', 'API', '架構', '規劃', '介面', '結構'],
    tools: ['Read', 'Grep', 'Glob'],
    model: 'opus'
  },
  developer: {
    role: '代碼實現',
    capabilities: ['實作', '實現', '編寫', '開發', '修改', '修復', 'fix', 'implement'],
    tools: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
    model: 'sonnet'
  },
  tester: {
    role: '測試撰寫',
    capabilities: ['測試', 'test', '驗證', '檢查', 'verify'],
    tools: ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'],
    model: 'sonnet'
  },
  reviewer: {
    role: '代碼審查',
    capabilities: ['審查', 'review', '檢視', '評估', '安全'],
    tools: ['Read', 'Grep', 'Glob', 'Bash'],
    model: 'sonnet'
  },
  explorer: {
    role: '代碼探索',
    capabilities: ['搜尋', 'search', '找', 'find', '探索', '了解', '理解'],
    tools: ['Read', 'Grep', 'Glob'],
    model: 'haiku'
  }
};

// 任務模式識別
const TASK_PATTERNS = {
  // 新功能開發
  newFeature: {
    keywords: ['新增', '添加', '創建', '建立', '實作', 'add', 'create', 'implement', 'build'],
    decomposition: 'byResponsibility',
    defaultFlow: ['architect', 'developer', 'tester', 'reviewer']
  },
  // Bug 修復
  bugFix: {
    keywords: ['修復', '修正', '修', 'fix', 'bug', 'error', '錯誤', '問題'],
    decomposition: 'byDependency',
    defaultFlow: ['explorer', 'developer', 'tester']
  },
  // 重構
  refactor: {
    keywords: ['重構', '重寫', '優化', 'refactor', 'rewrite', 'optimize', '改進'],
    decomposition: 'byFileBoundary',
    defaultFlow: ['architect', 'developer', 'reviewer']
  },
  // 測試相關
  testing: {
    keywords: ['測試', 'test', '驗證', '確認', 'verify'],
    decomposition: 'byResponsibility',
    defaultFlow: ['tester', 'reviewer']
  },
  // 文檔更新
  documentation: {
    keywords: ['文檔', '文件', 'doc', 'readme', '說明', '註解', 'comment'],
    decomposition: 'byContentType',
    defaultFlow: ['developer']
  },
  // 探索/研究
  exploration: {
    keywords: ['找', '搜', '查', 'find', 'search', 'explore', '了解', '理解', '是什麼'],
    decomposition: 'none',
    defaultFlow: ['explorer']
  }
};

// 並行限制（與 agent-router.js CONCURRENCY_LIMITS 保持一致）
const MAX_CONCURRENT_PER_TYPE = {
  architect: 1, developer: 2, tester: 1, reviewer: 1, explorer: 3
};
const MAX_PARALLEL_AGENTS = 4;

/**
 * 識別任務模式（計分制 — 避免 first-match 優先級問題）
 */
function identifyTaskPattern(prompt) {
  const { sanitized } = sanitizePrompt(prompt);
  const lowerSanitized = sanitized.toLowerCase();

  // 計分制：統計每個模式的關鍵字匹配數
  const scores = {};
  for (const [name, pattern] of Object.entries(TASK_PATTERNS)) {
    scores[name] = 0;
    for (const kw of pattern.keywords) {
      if (sanitized.includes(kw) || lowerSanitized.includes(kw)) {
        scores[name]++;
      }
    }
  }

  // 上下文加分：中文「動詞+目標」組合
  if (/(?:新增|添加|撰寫|寫).*測試/.test(sanitized)) scores.testing = (scores.testing || 0) + 2;
  if (/(?:新增|添加|建立|創建).*功能/.test(sanitized)) scores.newFeature = (scores.newFeature || 0) + 2;

  // 取最高分模式
  let best = 'newFeature';
  let bestScore = 0;
  for (const [name, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }

  return { name: best, ...TASK_PATTERNS[best], matchScore: bestScore };
}

/**
 * 提取可能涉及的檔案
 */
function extractMentionedFiles(prompt) {
  const files = [];

  // 匹配常見檔案路徑模式
  const patterns = [
    /[\w\-./]+\.(js|ts|jsx|tsx|py|go|rs|java|md|json|yaml|yml)/gi,
    /`([^`]+\.(js|ts|jsx|tsx|py|go|rs|java|md|json|yaml|yml))`/gi,
    /['"]([^'"]+\.(js|ts|jsx|tsx|py|go|rs|java|md|json|yaml|yml))['"]/gi
  ];

  for (const pattern of patterns) {
    const matches = prompt.matchAll(pattern);
    for (const match of matches) {
      const file = match[1] || match[0];
      if (!files.includes(file)) {
        files.push(file);
      }
    }
  }

  return files;
}

/**
 * 分析任務需要的 agents（路徑消除版）
 */
function analyzeRequiredAgents(prompt, taskPattern) {
  const requiredAgents = new Set();
  const { sanitized } = sanitizePrompt(prompt);
  const lowerSanitized = sanitized.toLowerCase();

  // 根據任務模式添加默認 agents
  taskPattern.defaultFlow.forEach(agent => requiredAgents.add(agent));

  // 根據關鍵詞額外添加 agents（用 sanitized 避免路徑誤報）
  for (const [agentName, agentInfo] of Object.entries(AGENTS)) {
    for (const capability of agentInfo.capabilities) {
      if (sanitized.includes(capability) || lowerSanitized.includes(capability)) {
        requiredAgents.add(agentName);
        break;
      }
    }
  }

  return Array.from(requiredAgents);
}

/**
 * 按職責分解（用於新功能開發）
 */
function decomposeByResponsibility(prompt, requiredAgents, mentionedFiles) {
  const subtasks = [];
  let taskId = 1;
  const dependencyMap = {
    architect: [],
    developer: ['architect'],
    tester: ['developer'],
    reviewer: ['developer', 'tester']
  };

  for (const agent of requiredAgents) {
    const agentInfo = AGENTS[agent];
    if (!agentInfo) continue;

    const task = {
      id: `task-${taskId}`,
      agent,
      description: generateTaskDescription(agent, prompt),
      inputs: generateInputs(agent, prompt, mentionedFiles),
      outputs: generateOutputs(agent),
      depends_on: dependencyMap[agent]?.filter(dep => requiredAgents.includes(dep)).map(dep => {
        const depIndex = requiredAgents.indexOf(dep) + 1;
        return `task-${depIndex}`;
      }) || [],
      estimated_complexity: estimateComplexity(agent, prompt)
    };

    subtasks.push(task);
    taskId++;
  }

  return subtasks;
}

/**
 * 按檔案邊界分解（用於重構）
 */
function decomposeByFileBoundary(prompt, requiredAgents, mentionedFiles) {
  const subtasks = [];
  let taskId = 1;

  // 如果有明確的檔案，為每個檔案創建任務
  if (mentionedFiles.length > 0) {
    for (const file of mentionedFiles) {
      subtasks.push({
        id: `task-${taskId}`,
        agent: 'developer',
        description: `重構 ${file}`,
        inputs: [file],
        outputs: [`${file} (已重構)`],
        depends_on: [],
        estimated_complexity: 'moderate'
      });
      taskId++;
    }

    // 添加最終審查
    subtasks.push({
      id: `task-${taskId}`,
      agent: 'reviewer',
      description: '審查所有重構變更',
      inputs: mentionedFiles,
      outputs: ['審查報告'],
      depends_on: subtasks.slice(0, -1).map(t => t.id),
      estimated_complexity: 'moderate'
    });
  } else {
    // 沒有明確檔案時，按職責分解
    return decomposeByResponsibility(prompt, requiredAgents, mentionedFiles);
  }

  return subtasks;
}

/**
 * 按依賴鏈分解（用於 Bug 修復）
 */
function decomposeByDependency(prompt, requiredAgents, mentionedFiles) {
  const subtasks = [
    {
      id: 'task-1',
      agent: 'explorer',
      description: '定位問題根源',
      inputs: [prompt, ...mentionedFiles],
      outputs: ['問題分析報告', '相關檔案列表'],
      depends_on: [],
      estimated_complexity: 'simple'
    },
    {
      id: 'task-2',
      agent: 'developer',
      description: '修復問題',
      inputs: ['問題分析報告'],
      outputs: ['修復後的代碼'],
      depends_on: ['task-1'],
      estimated_complexity: 'moderate'
    },
    {
      id: 'task-3',
      agent: 'tester',
      description: '驗證修復',
      inputs: ['修復後的代碼'],
      outputs: ['測試結果', '回歸測試報告'],
      depends_on: ['task-2'],
      estimated_complexity: 'simple'
    }
  ];

  return subtasks;
}

/**
 * 按內容類型分解（用於文檔更新任務）
 */
function decomposeByContentType(prompt, requiredAgents, mentionedFiles) {
  const subtasks = [];
  let taskId = 1;

  const contentTypes = [];
  if (/readme|說明|介紹/i.test(prompt)) contentTypes.push('readme');
  if (/api|介面|接口/i.test(prompt)) contentTypes.push('api-doc');
  if (/註解|comment|jsdoc/i.test(prompt)) contentTypes.push('inline-comment');
  if (/教學|tutorial|guide|指南/i.test(prompt)) contentTypes.push('guide');
  if (/changelog|更新日誌/i.test(prompt)) contentTypes.push('changelog');
  if (contentTypes.length === 0) contentTypes.push('general-doc');

  for (const ct of contentTypes) {
    subtasks.push({
      id: `task-${taskId++}`,
      agent: 'developer',
      description: generateTaskDescription('developer', `更新 ${ct}：${prompt}`),
      inputs: [prompt, ...mentionedFiles],
      outputs: [`${ct} 文檔更新`],
      depends_on: [],
      estimated_complexity: 'simple'
    });
  }

  if (contentTypes.length > 1 && requiredAgents.includes('reviewer')) {
    subtasks.push({
      id: `task-${taskId}`,
      agent: 'reviewer',
      description: '審查所有文檔變更的一致性',
      inputs: contentTypes.map(ct => `${ct} 文檔更新`),
      outputs: ['文檔審查報告'],
      depends_on: subtasks.map(t => t.id),
      estimated_complexity: 'simple'
    });
  }

  return subtasks;
}

/**
 * 生成任務描述（含原始請求上下文摘要）
 */
function generateTaskDescription(agent, prompt) {
  const snippet = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt;

  const templates = {
    architect: `根據需求設計架構和 API 介面：${snippet}`,
    developer: `實作功能代碼：${snippet}`,
    tester: `撰寫並執行測試：${snippet}`,
    reviewer: `審查代碼品質和安全性：${snippet}`,
    explorer: `搜尋和分析相關代碼：${snippet}`
  };

  return templates[agent] || `執行 ${agent} 任務：${snippet}`;
}

/**
 * 生成任務輸入
 */
function generateInputs(agent, prompt, files) {
  const baseInputs = [prompt];

  if (files.length > 0) {
    baseInputs.push(...files);
  }

  return baseInputs;
}

/**
 * 生成預期輸出
 */
function generateOutputs(agent) {
  const outputs = {
    architect: ['架構設計文檔', 'API 介面定義'],
    developer: ['實作完成的代碼'],
    tester: ['測試代碼', '測試報告'],
    reviewer: ['審查報告', '改進建議'],
    explorer: ['相關檔案列表', '代碼分析']
  };

  return outputs[agent] || ['任務完成'];
}

/**
 * 估算任務複雜度
 */
function estimateComplexity(agent, prompt) {
  // 基於 prompt 長度和 agent 類型估算
  const baseComplexity = prompt.length > 200 ? 'complex' : prompt.length > 50 ? 'moderate' : 'simple';

  // architect 任務通常更複雜
  if (agent === 'architect') {
    return baseComplexity === 'simple' ? 'moderate' : baseComplexity;
  }

  return baseComplexity;
}

/**
 * 生成並行組
 */
function generateParallelGroups(subtasks) {
  const groups = [];
  const completed = new Set();

  while (completed.size < subtasks.length) {
    const currentGroup = [];
    const agentCount = {};

    for (const task of subtasks) {
      if (completed.has(task.id)) continue;

      // 檢查依賴是否都已完成
      const depsCompleted = task.depends_on.every(dep => completed.has(dep));
      if (!depsCompleted) continue;

      // 並行限制檢查
      const agent = task.agent || 'developer';
      const count = agentCount[agent] || 0;
      if (count >= (MAX_CONCURRENT_PER_TYPE[agent] || 2)) continue;
      if (currentGroup.length >= MAX_PARALLEL_AGENTS) break;

      currentGroup.push(task.id);
      agentCount[agent] = count + 1;
    }

    if (currentGroup.length === 0) {
      // 避免無限迴圈（循環依賴）
      console.error('[Task Decomposition] Warning: Circular dependency detected');
      break;
    }

    groups.push(currentGroup);
    currentGroup.forEach(id => completed.add(id));
  }

  return groups;
}

/**
 * 主要分解函數
 */
function decomposeTask(prompt, classificationResult = null) {
  // 識別任務模式
  const taskPattern = identifyTaskPattern(prompt);

  // 提取檔案引用
  const mentionedFiles = extractMentionedFiles(prompt);

  // 分析需要的 agents
  const requiredAgents = analyzeRequiredAgents(prompt, taskPattern);

  // 根據分解策略生成子任務
  let subtasks;
  switch (taskPattern.decomposition) {
    case 'byResponsibility':
      subtasks = decomposeByResponsibility(prompt, requiredAgents, mentionedFiles);
      break;
    case 'byFileBoundary':
      subtasks = decomposeByFileBoundary(prompt, requiredAgents, mentionedFiles);
      break;
    case 'byDependency':
      subtasks = decomposeByDependency(prompt, requiredAgents, mentionedFiles);
      break;
    case 'byContentType':
      subtasks = decomposeByContentType(prompt, requiredAgents, mentionedFiles);
      break;
    case 'none':
      // 不需要分解，直接派給單一 agent
      subtasks = [{
        id: 'task-1',
        agent: requiredAgents[0] || 'explorer',
        description: prompt,
        inputs: [prompt],
        outputs: ['結果'],
        depends_on: [],
        estimated_complexity: 'simple'
      }];
      break;
    default:
      subtasks = decomposeByResponsibility(prompt, requiredAgents, mentionedFiles);
  }

  // 複合需求保障：確保子任務數不低於複合需求數
  const compoundCount = classificationResult?.metrics?.compoundRequirements || 0;
  if (compoundCount >= 2 && subtasks.length < compoundCount) {
    const deficit = compoundCount - subtasks.length;
    for (let i = 0; i < deficit; i++) {
      subtasks.push({
        id: `task-${subtasks.length + 1}`,
        agent: 'developer',
        description: generateTaskDescription('developer', prompt),
        inputs: [prompt],
        outputs: ['實作完成的代碼'],
        depends_on: subtasks.filter(t => t.agent === 'architect').map(t => t.id),
        estimated_complexity: 'moderate'
      });
    }
  }

  // 生成並行組
  const parallelGroups = generateParallelGroups(subtasks);

  // 構建完整的分解計劃
  const decomposition = {
    task_decomposition: {
      original_request: prompt,
      pattern: taskPattern.name,
      complexity: classificationResult?.complexity || 'complex',
      subtasks,
      execution_order: {
        parallel_groups: parallelGroups,
        total_phases: parallelGroups.length
      },
      metadata: {
        generated_at: new Date().toISOString(),
        mentioned_files: mentionedFiles,
        required_agents: requiredAgents
      }
    }
  };

  return decomposition;
}

/**
 * 將分解計劃保存到檔案
 */
function saveDecomposition(decomposition, taskId = null) {
  try {
    // 確保目錄存在
    if (!fs.existsSync(TASKS_DIR)) {
      fs.mkdirSync(TASKS_DIR, { recursive: true });
    }

    const id = taskId || `task-${Date.now()}`;
    const filePath = path.join(TASKS_DIR, `${id}.yaml`);

    // 簡單的 YAML 序列化
    const yaml = jsonToYaml(decomposition);
    fs.writeFileSync(filePath, yaml, 'utf8');

    return { success: true, filePath, taskId: id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 生成 Claude 可執行的 Task 指令
 */
function generateTaskCommands(decomposition) {
  const commands = [];
  const { subtasks, execution_order } = decomposition.task_decomposition;

  for (const group of execution_order.parallel_groups) {
    const groupCommands = group.map(taskId => {
      const task = subtasks.find(t => t.id === taskId);
      if (!task) {
        console.error(`[Task Decomposition] Warning: taskId "${taskId}" not found in subtasks`);
        return null;
      }

      const agentType = `vibe-engine-core:${task.agent}`;
      return {
        taskId: task.id,
        agent: task.agent,
        subagent_type: agentType,
        prompt: task.description,
        canParallelize: group.length > 1
      };
    }).filter(Boolean);

    commands.push({
      phase: commands.length + 1,
      parallel: groupCommands.length > 1,
      tasks: groupCommands
    });
  }

  return commands;
}

/**
 * 主函數 - 支援 Hook 和獨立呼叫
 */
async function main() {
  // 使用 lib/hook-io 讀取輸入
  const { hookInput, isHook, rawInput } = await readHookInput();

  try {
    let prompt = '';
    let classificationResult = null;

    // 優先 user_prompt，fallback 到 prompt（Claude Code 可能使用任一欄位名）
    const userPrompt = hookInput?.user_prompt || hookInput?.prompt;
    if (userPrompt) {
      prompt = userPrompt;
      // 從共享檔案讀取 prompt-classifier 的分類結果
      const paths = getVibeEnginePaths();
      classificationResult = safeReadJSON(path.join(paths.root, 'last-classification.json'));
    } else if (rawInput) {
      // rawInput 可能是完整 hookInput JSON — 嘗試提取 user_prompt
      try {
        const parsed = JSON.parse(rawInput);
        prompt = parsed.user_prompt || parsed.prompt || rawInput;
      } catch {
        prompt = rawInput;
      }
    }

    // 如果沒有 prompt，從命令列參數讀取
    if (!prompt && process.argv.length > 2) {
      prompt = process.argv.slice(2).join(' ');
    }

    if (!prompt) {
      writeHookOutput({ continue: true, suppressOutput: true });
      return;
    }

    // 執行分解
    const decomposition = decomposeTask(prompt, classificationResult);

    // 生成執行指令
    const taskCommands = generateTaskCommands(decomposition);

    // 保存分解計劃
    const saveResult = saveDecomposition(decomposition);

    if (isHook) {
      // Hook 輸出格式
      const shouldDecompose = decomposition.task_decomposition.subtasks.length > 1;

      const output = {
        continue: true,
        suppressOutput: false
      };

      // 只在需要分解時添加系統訊息（雙通道）
      if (shouldDecompose) {
        const subtaskCount = decomposition.task_decomposition.subtasks.length;
        const phaseCount = decomposition.task_decomposition.execution_order.total_phases;
        const agents = [...new Set(decomposition.task_decomposition.subtasks.map(t => t.agent))];

        const message = `[Vibe Engine] Task decomposed into ${subtaskCount} subtasks across ${phaseCount} phases.
Agents: ${agents.join(', ')}
MUST use the Task tool to delegate subtasks to the specified agents. Do NOT implement directly.
Plan saved to: ${saveResult.filePath || 'memory'}`;
        output.systemMessage = message;
        output.hookSpecificOutput = {
          hookEventName: 'UserPromptSubmit',
          additionalContext: message
        };
      }

      writeHookOutput(output);
    } else {
      // 獨立執行輸出
      console.log('\n═══════════════════════════════════════════════════');
      console.log('  Task Decomposition Result');
      console.log('═══════════════════════════════════════════════════');
      console.log(`\nPattern: ${decomposition.task_decomposition.pattern}`);
      console.log(`Subtasks: ${decomposition.task_decomposition.subtasks.length}`);
      console.log(`Phases: ${decomposition.task_decomposition.execution_order.total_phases}`);
      console.log('\nSubtasks:');
      for (const task of decomposition.task_decomposition.subtasks) {
        console.log(`  [${task.id}] ${task.agent}: ${task.description}`);
        if (task.depends_on.length > 0) {
          console.log(`        depends on: ${task.depends_on.join(', ')}`);
        }
      }
      console.log('\nExecution Order:');
      for (let i = 0; i < taskCommands.length; i++) {
        const phase = taskCommands[i];
        console.log(`  Phase ${phase.phase}: ${phase.parallel ? '(parallel)' : '(sequential)'}`);
        for (const task of phase.tasks) {
          console.log(`    - ${task.taskId}: ${task.agent}`);
        }
      }
      if (saveResult.success) {
        console.log(`\nSaved to: ${saveResult.filePath}`);
      }
      console.log('═══════════════════════════════════════════════════\n');
    }

  } catch (error) {
    writeHookOutput({ continue: true, suppressOutput: true });
  }
}

// 導出供其他模組使用
module.exports = {
  decomposeTask,
  generateTaskCommands,
  generateParallelGroups,
  saveDecomposition,
  identifyTaskPattern,
  AGENTS,
  TASK_PATTERNS,
  MAX_CONCURRENT_PER_TYPE,
  MAX_PARALLEL_AGENTS
};

// 執行主函數
if (require.main === module) {
  main().catch(console.error);
}
