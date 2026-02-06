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
      '優化', '清理', '格式化',
      '加入', '加上', '增加', '補上', '換成', '改成'
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

// ============================================================
// 中文 NLP 工具函數
// ============================================================

// Lazy singleton Intl.Segmenter（Node.js v16+ 內建）
let _segmenter = null;
function getSegmenter() {
  if (!_segmenter) _segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  return _segmenter;
}

/**
 * 消除路徑類 token，避免英文 substring 誤報
 * 例如 "test-projects/phone-login" 中的 "test" 不應匹配 moderate 關鍵字
 * @param {string} prompt
 * @returns {{ sanitized: string, paths: string[] }}
 */
function sanitizePrompt(prompt) {
  const PATH_PATTERN = /[\w\-.]+\/[\w\-./]+/g;
  const paths = prompt.match(PATH_PATTERN) || [];
  const sanitized = prompt.replace(PATH_PATTERN, ' ');
  return { sanitized, paths };
}

/**
 * 使用 Intl.Segmenter 準確計算中英混合文本的詞數
 * 解決中文 split(/\s+/) 嚴重低估的問題
 * @param {string} prompt
 * @returns {number}
 */
function countWords(prompt) {
  try {
    return [...getSegmenter().segment(prompt)].filter(seg => seg.isWordLike).length;
  } catch {
    // Fallback：Intl.Segmenter 不可用時退回空格分割
    return prompt.split(/\s+/).filter(w => w.length > 0).length;
  }
}

/**
 * 偵測中文複合需求模式（"要有 UI 和驗證邏輯" → 2 子需求）
 * @param {string} prompt
 * @returns {{ count: number, hasRequirementVerb: boolean, conjunctions: number }}
 */
function detectCompoundRequirements(prompt) {
  const REQUIREMENT_VERBS = /要有|包含|需要|包括|具備|涵蓋|支援|支持/;
  const CONJUNCTION_PATTERN = /[和與及、]|以及|還有|並且/g;
  const hasRequirementVerb = REQUIREMENT_VERBS.test(prompt);
  const conjunctions = (prompt.match(CONJUNCTION_PATTERN) || []).length;
  const count = hasRequirementVerb ? conjunctions + 1 : 0;
  return { count, hasRequirementVerb, conjunctions };
}

// ============================================================
// 請求類型
// ============================================================

const REQUEST_TYPES = {
  query: ['what', 'how', 'why', 'where', 'which', 'explain', '什麼', '如何', '為什麼', '哪'],
  action: [
    'do', 'make', 'create', 'fix', 'update',
    '做', '創建', '修復', '更新',
    '加入', '加上', '新增', '添加', '建立', '修改'
  ],
  multiStep: ['and then', 'after that', 'first...then', '然後', '接著', '之後', '首先']
};

// ============================================================
// 分類核心邏輯
// ============================================================

/**
 * 完整請求分類
 */
function classifyRequest(prompt) {
  const metrics = analyzePromptMetrics(prompt);
  const complexity = classifyComplexity(prompt, metrics);
  const requestType = identifyRequestType(prompt);

  return {
    complexity,
    requestType,
    needsDecomposition: complexity === 'complex'
      || metrics.hasMultipleSteps
      || (complexity === 'moderate' && metrics.compoundRequirements >= 2),
    suggestedAgent: suggestAgent(complexity, requestType),
    metrics
  };
}

/**
 * 複雜度分類（支援中英文，路徑消除 + Segmenter 詞數 + 複合需求偵測）
 * @param {string} prompt - 原始 prompt
 * @param {object} metrics - analyzePromptMetrics 的結果
 */
function classifyComplexity(prompt, metrics) {
  const { sanitized } = sanitizePrompt(prompt);
  const lowerSanitized = sanitized.toLowerCase();

  // 1. 先檢查 pattern（優先級最高，用原始 prompt）
  for (const pattern of INDICATORS.simple.patterns) {
    if (pattern.test(prompt)) return 'simple';
  }
  for (const pattern of INDICATORS.complex.patterns) {
    if (pattern.test(prompt)) return 'complex';
  }
  for (const pattern of INDICATORS.moderate.patterns) {
    if (pattern.test(prompt)) return 'moderate';
  }

  // 2. 計算各級別匹配分數（用 sanitized 避免路徑誤報）
  const scores = { simple: 0, moderate: 0, complex: 0 };

  for (const level of ['simple', 'moderate', 'complex']) {
    // 英文指標（用 sanitized — 路徑已移除）
    for (const word of INDICATORS[level].en) {
      if (lowerSanitized.includes(word)) scores[level] += 1;
    }
    // 中文指標
    for (const word of INDICATORS[level].zh) {
      if (sanitized.includes(word)) scores[level] += 1.2;
    }
  }

  // 3. 結構分析加權
  if (metrics.wordCount > 50) scores.complex += 1;
  if (metrics.hasMultipleSteps) scores.complex += 2;
  if (metrics.mentionsMultipleFiles) scores.complex += 1.5;
  if (metrics.wordCount < 10 && !metrics.hasMultipleSteps) scores.simple += 1;

  // 4. 複合需求加權
  if (metrics.compoundRequirements >= 2) scores.moderate += 1;
  if (metrics.compoundRequirements >= 3) scores.complex += 1.5;

  // 5. 返回最高分級別
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
 * 分析 prompt 指標（使用 Intl.Segmenter + 路徑消除 + 複合需求偵測）
 */
function analyzePromptMetrics(prompt) {
  const { sanitized, paths } = sanitizePrompt(prompt);
  const compound = detectCompoundRequirements(sanitized);

  return {
    charCount: prompt.length,
    wordCount: countWords(sanitized),
    hasMultipleSteps: /(\d+\.|first|then|after|finally|接著|然後|首先|最後|第[一二三四五])/i.test(prompt),
    mentionsMultipleFiles: /(files?|檔案|多個|several|multiple|all)/i.test(sanitized),
    hasCodeBlock: /```/.test(prompt),
    isQuestion: /[?？]/.test(prompt),
    compoundRequirements: compound.count,
    detectedPaths: paths
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

// ============================================================
// Hook 入口
// ============================================================

function main() {
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
}

// 導出供測試使用
module.exports = {
  classifyRequest,
  classifyComplexity,
  identifyRequestType,
  analyzePromptMetrics,
  suggestAgent,
  sanitizePrompt,
  countWords,
  detectCompoundRequirements,
  INDICATORS
};

// 直接執行時作為 hook 腳本
if (require.main === module) {
  main();
}
