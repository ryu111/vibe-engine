#!/usr/bin/env node
/**
 * UserPromptSubmit Hook - 分類用戶請求
 *
 * 功能：
 * 1. 分析用戶請求意圖（支援中英文）
 * 2. 判斷複雜度（simple/moderate/complex）
 * 3. 識別請求類型（query/action/multi-step）
 * 4. 決定是否需要任務分解
 *
 * 對應章節：Ch1 協調引擎
 */

const fs = require('fs');
const path = require('path');

// 配置
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../..');

// 分類指標詞彙（中英文）
const INDICATORS = {
  // 簡單請求 - 純查詢，不需修改
  simple: {
    en: [
      'what is', 'what are', 'how to', 'how do', 'explain', 'show me',
      'find', 'search', 'read', 'list', 'status', 'help', 'describe',
      'where is', 'which', 'why', 'when', 'who', 'tell me'
    ],
    zh: [
      '什麼是', '是什麼', '怎麼', '如何', '解釋', '說明', '顯示',
      '找', '搜尋', '查找', '讀取', '列出', '狀態', '幫助',
      '在哪', '哪個', '為什麼', '為何', '何時', '誰'
    ],
    patterns: [/^\?/, /\?$/, /^\/status/, /^\/help/, /^\/budget/]
  },

  // 中等複雜度 - 單一修改任務
  moderate: {
    en: [
      'fix', 'update', 'modify', 'add', 'change', 'improve', 'test',
      'rename', 'delete', 'remove', 'edit', 'correct', 'adjust',
      'debug', 'optimize', 'clean', 'format'
    ],
    zh: [
      '修復', '修正', '更新', '修改', '添加', '新增', '改變', '改進',
      '測試', '重命名', '刪除', '移除', '編輯', '調整', '除錯',
      '優化', '清理', '格式化'
    ],
    patterns: [/^\/verify/, /^\/spec/]
  },

  // 高複雜度 - 多步驟、多檔案任務
  complex: {
    en: [
      'implement', 'build', 'create', 'develop', 'design', 'architect',
      'refactor', 'migrate', 'integrate', 'multiple files', 'rewrite',
      'restructure', 'overhaul', 'setup', 'configure', 'deploy',
      'full', 'complete', 'entire', 'whole', 'all'
    ],
    zh: [
      '實現', '實作', '建立', '創建', '開發', '設計', '架構',
      '重構', '遷移', '整合', '多個檔案', '重寫', '重建',
      '改造', '設置', '配置', '部署', '完整', '全部', '整個'
    ],
    patterns: [/多個/, /multiple/i, /all files/i, /整個專案/]
  }
};

// 請求類型
const REQUEST_TYPES = {
  query: ['what', 'how', 'why', 'where', 'which', 'explain', '什麼', '如何', '為什麼', '哪'],
  action: ['do', 'make', 'create', 'fix', 'update', '做', '創建', '修復', '更新'],
  multiStep: ['and then', 'after that', 'first...then', '然後', '接著', '之後', '首先']
};

// 讀取 stdin（hook input）
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });

process.stdin.on('end', () => {
  try {
    const hookInput = JSON.parse(input);
    const userPrompt = hookInput.user_prompt || '';

    // 分類請求
    const classification = classifyRequest(userPrompt);

    // 輸出分類結果
    const output = {
      continue: true,
      suppressOutput: false,
      hookSpecificOutput: classification
    };

    // 只在複雜請求時添加系統訊息
    if (classification.complexity === 'complex') {
      output.systemMessage = `[Vibe Engine] Complex request detected (${classification.requestType}). Task decomposition recommended.`;
    }

    console.log(JSON.stringify(output));

  } catch (error) {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: false,
      hookSpecificOutput: {
        complexity: 'unknown',
        error: error.message
      }
    }));
  }
});

/**
 * 完整請求分類
 */
function classifyRequest(prompt) {
  const complexity = classifyComplexity(prompt);
  const requestType = identifyRequestType(prompt);
  const metrics = analyzePromptMetrics(prompt);

  return {
    complexity,
    requestType,
    needsDecomposition: complexity === 'complex' || metrics.hasMultipleSteps,
    suggestedAgent: suggestAgent(complexity, requestType),
    metrics
  };
}

/**
 * 複雜度分類（支援中英文）
 */
function classifyComplexity(prompt) {
  const lowerPrompt = prompt.toLowerCase();

  // 1. 先檢查 pattern（優先級最高）
  for (const pattern of INDICATORS.simple.patterns) {
    if (pattern.test(prompt)) return 'simple';
  }
  for (const pattern of INDICATORS.complex.patterns) {
    if (pattern.test(prompt)) return 'complex';
  }
  for (const pattern of INDICATORS.moderate.patterns) {
    if (pattern.test(prompt)) return 'moderate';
  }

  // 2. 計算各級別匹配分數
  const scores = {
    simple: 0,
    moderate: 0,
    complex: 0
  };

  for (const level of ['simple', 'moderate', 'complex']) {
    // 英文指標
    for (const word of INDICATORS[level].en) {
      if (lowerPrompt.includes(word)) scores[level] += 1;
    }
    // 中文指標
    for (const word of INDICATORS[level].zh) {
      if (prompt.includes(word)) scores[level] += 1.2; // 中文權重略高（更精確）
    }
  }

  // 3. 結構分析加權
  const metrics = analyzePromptMetrics(prompt);
  if (metrics.wordCount > 50) scores.complex += 1;
  if (metrics.hasMultipleSteps) scores.complex += 2;
  if (metrics.mentionsMultipleFiles) scores.complex += 1.5;
  if (metrics.wordCount < 10 && !metrics.hasMultipleSteps) scores.simple += 1;

  // 4. 返回最高分級別
  if (scores.complex > scores.moderate && scores.complex > scores.simple) {
    return 'complex';
  }
  if (scores.simple > scores.moderate) {
    return 'simple';
  }
  return 'moderate';
}

/**
 * 識別請求類型
 */
function identifyRequestType(prompt) {
  const lowerPrompt = prompt.toLowerCase();

  // 檢查多步驟標誌
  for (const indicator of REQUEST_TYPES.multiStep) {
    if (prompt.includes(indicator) || lowerPrompt.includes(indicator)) {
      return 'multi-step';
    }
  }

  // 檢查查詢類型
  for (const indicator of REQUEST_TYPES.query) {
    if (lowerPrompt.startsWith(indicator) || prompt.startsWith(indicator)) {
      return 'query';
    }
  }

  // 檢查動作類型
  for (const indicator of REQUEST_TYPES.action) {
    if (lowerPrompt.includes(indicator) || prompt.includes(indicator)) {
      return 'action';
    }
  }

  return 'action'; // 預設為動作請求
}

/**
 * 分析 prompt 指標
 */
function analyzePromptMetrics(prompt) {
  return {
    charCount: prompt.length,
    wordCount: prompt.split(/\s+/).filter(w => w.length > 0).length,
    hasMultipleSteps: /(\d+\.|first|then|after|finally|接著|然後|首先|最後|第[一二三四五])/i.test(prompt),
    mentionsMultipleFiles: /(files?|檔案|多個|several|multiple|all)/i.test(prompt),
    hasCodeBlock: /```/.test(prompt),
    isQuestion: /[?？]/.test(prompt)
  };
}

/**
 * 建議使用的 Agent
 */
function suggestAgent(complexity, requestType) {
  if (requestType === 'query') {
    return 'explorer';
  }

  switch (complexity) {
    case 'complex':
      return 'architect';
    case 'moderate':
      return 'developer';
    case 'simple':
    default:
      return null; // 主 Agent 直接處理
  }
}
