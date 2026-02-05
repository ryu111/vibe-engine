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
const { getProjectRoot } = require('./lib/common');
const { readHookInput, writeHookOutput } = require('./lib/hook-io');
const { jsonToYaml } = require('./lib/yaml-parser');

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

/**
 * 識別任務模式
 */
function identifyTaskPattern(prompt) {
  const lowerPrompt = prompt.toLowerCase();

  for (const [patternName, pattern] of Object.entries(TASK_PATTERNS)) {
    for (const keyword of pattern.keywords) {
      if (prompt.includes(keyword) || lowerPrompt.includes(keyword)) {
        return { name: patternName, ...pattern };
      }
    }
  }

  // 預設為新功能開發
  return { name: 'newFeature', ...TASK_PATTERNS.newFeature };
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
 * 分析任務需要的 agents
 */
function analyzeRequiredAgents(prompt, taskPattern) {
  const requiredAgents = new Set();
  const lowerPrompt = prompt.toLowerCase();

  // 根據任務模式添加默認 agents
  taskPattern.defaultFlow.forEach(agent => requiredAgents.add(agent));

  // 根據關鍵詞額外添加 agents
  for (const [agentName, agentInfo] of Object.entries(AGENTS)) {
    for (const capability of agentInfo.capabilities) {
      if (prompt.includes(capability) || lowerPrompt.includes(capability)) {
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
 * 生成任務描述
 */
function generateTaskDescription(agent, prompt) {
  const templates = {
    architect: `根據需求設計架構和 API 介面`,
    developer: `實作功能代碼`,
    tester: `撰寫並執行測試`,
    reviewer: `審查代碼品質和安全性`,
    explorer: `搜尋和分析相關代碼`
  };

  return templates[agent] || `執行 ${agent} 任務`;
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

    for (const task of subtasks) {
      if (completed.has(task.id)) continue;

      // 檢查依賴是否都已完成
      const depsCompleted = task.depends_on.every(dep => completed.has(dep));
      if (depsCompleted) {
        currentGroup.push(task.id);
      }
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
      if (!task) return null;

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

    if (hookInput?.user_prompt) {
      prompt = hookInput.user_prompt;
      classificationResult = hookInput.hookSpecificOutput;
    } else if (rawInput) {
      prompt = rawInput;
    }

    // 如果沒有 prompt，從命令列參數讀取
    if (!prompt && process.argv.length > 2) {
      prompt = process.argv.slice(2).join(' ');
    }

    if (!prompt) {
      writeHookOutput({ continue: true, error: 'No prompt provided' });
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
        suppressOutput: false,
        hookSpecificOutput: {
          decomposition,
          taskCommands,
          savedTo: saveResult.success ? saveResult.filePath : null
        }
      };

      // 只在需要分解時添加系統訊息
      if (shouldDecompose) {
        const subtaskCount = decomposition.task_decomposition.subtasks.length;
        const phaseCount = decomposition.task_decomposition.execution_order.total_phases;
        const agents = [...new Set(decomposition.task_decomposition.subtasks.map(t => t.agent))];

        output.systemMessage = `[Vibe Engine] Task decomposed into ${subtaskCount} subtasks across ${phaseCount} phases.
Agents: ${agents.join(', ')}
Use the Task tool to execute subtasks in parallel where possible.
Plan saved to: ${saveResult.filePath || 'memory'}`;
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
    writeHookOutput({ continue: true, error: error.message });
  }
}

// 導出供其他模組使用
module.exports = {
  decomposeTask,
  generateTaskCommands,
  saveDecomposition,
  identifyTaskPattern,
  AGENTS,
  TASK_PATTERNS
};

// 執行主函數
main().catch(console.error);
