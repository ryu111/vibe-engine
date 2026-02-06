#!/usr/bin/env node
/**
 * UserPromptSubmit Hook - 混合 Prompt 分類器（B+C+D 三層架構）
 *
 * Layer 0: 快速路徑 — 指令模式（/status, /help）確定性 simple
 * Layer 1: 結構特徵分析 — 句式、長度、動詞模式判斷信度
 * Layer 2: LLM 分類 — Haiku 精確分類（僅在 Layer 1 信度不足時）
 *
 * 設計原則：
 * - 越簡單的案例越早返回（<1ms → <5ms → ~500ms）
 * - Fallback 預設 complex（寧可多分解也不要漏掉）
 * - 向後相容：所有既有欄位不變，新增 classificationMethod/classificationConfidence
 *
 * 對應章節：Ch1 協調引擎
 */

const fs = require('fs');
const path = require('path');

// 配置
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../..');

// LLM 分類器
const {
  classifyWithLLM,
  getApiKey,
  lookupCache,
  writeCache,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_CACHE_MAX_ENTRIES
} = require('./lib/llm-classifier');

// ============================================================
// 保留的 INDICATORS 常量（向後相容，外部有引用）
// 注意：不再用於主分類邏輯，改由 STRUCTURAL_FEATURES 取代
// ============================================================

const INDICATORS = {
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
      '加入', '加上', '增加', '補上', '換成', '改成',
      '做', '寫', '弄', '改', '加'
    ],
    patterns: [/^\/verify/, /^\/spec/]
  },
  complex: {
    en: [
      'implement', 'build', 'create', 'develop', 'design', 'architect',
      'refactor', 'migrate', 'integrate', 'multiple files', 'rewrite',
      'restructure', 'overhaul', 'setup', 'configure', 'deploy',
      'full', 'complete', 'entire', 'whole', 'all', 'game', 'app',
      'website', 'application', 'system', 'platform', 'service'
    ],
    zh: [
      '實現', '實作', '建立', '創建', '開發', '設計', '架構',
      '重構', '遷移', '整合', '多個檔案', '重寫', '重建',
      '改造', '設置', '配置', '部署', '完整', '全部', '整個',
      '做一個', '寫一個', '製作', '幫我做', '幫我寫', '幫我建',
      '遊戲', '應用', '網站', '系統', '平台', '服務'
    ],
    patterns: [/多個/, /multiple/i, /all files/i, /整個專案/, /做一個.+/]
  }
};

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
// 中文 NLP 工具函數（保留既有）
// ============================================================

let _segmenter = null;
function getSegmenter() {
  if (!_segmenter) _segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  return _segmenter;
}

/**
 * 消除路徑類 token，避免英文 substring 誤報
 */
function sanitizePrompt(prompt) {
  const PATH_PATTERN = /[\w\-.]+\/[\w\-./]+/g;
  const paths = prompt.match(PATH_PATTERN) || [];
  const sanitized = prompt.replace(PATH_PATTERN, ' ');
  return { sanitized, paths };
}

/**
 * 使用 Intl.Segmenter 準確計算中英混合文本的詞數
 */
function countWords(prompt) {
  try {
    return [...getSegmenter().segment(prompt)].filter(seg => seg.isWordLike).length;
  } catch {
    return prompt.split(/\s+/).filter(w => w.length > 0).length;
  }
}

/**
 * 偵測中文複合需求模式
 */
function detectCompoundRequirements(prompt) {
  const REQUIREMENT_VERBS = /要有|包含|需要|包括|具備|涵蓋|支援|支持/;
  const CONJUNCTION_PATTERN = /[和與及、]|以及|還有|並且/g;
  const hasRequirementVerb = REQUIREMENT_VERBS.test(prompt);
  const conjunctions = (prompt.match(CONJUNCTION_PATTERN) || []).length;
  const count = hasRequirementVerb ? conjunctions + 1 : 0;
  return { count, hasRequirementVerb, conjunctions };
}

const { getVibeEnginePaths, safeWriteJSON, safeReadJSON } = require('./lib/common');

// ============================================================
// Layer 0: 快速路徑（確定性路由）
// ============================================================

const FAST_PATH_PATTERNS = [
  /^\/status/,
  /^\/help/,
  /^\/budget/,
  /^\/verify/,
  /^\/spec/,
  /^\/dashboard/,
  /^\/metrics/,
  /^\/health/,
  /^\/checkpoint/,
  /^\/instinct/,
  /^\/recall/,
  /^\/evolve/,
  /^\/handoff/,
  /^\/notify/,
  /^\?$/,
];

/**
 * Layer 0: 快速路徑 — 指令型 prompt 直接返回 simple
 * @param {string} prompt
 * @returns {{ level: string, confidence: number }|null}
 */
function tryFastPath(prompt) {
  const trimmed = prompt.trim();
  for (const pattern of FAST_PATH_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { level: 'simple', confidence: 1.0 };
    }
  }
  return null;
}

// ============================================================
// Layer 1: 結構特徵分析
// ============================================================

// 動作動詞 regex（中英文）— 用於多個特徵規則
// 包含 simple/moderate/complex 各級別的動作動詞
const ACTION_VERB_RE = /(?:做|寫|建|改|修|加|刪|移|重構|實作|實現|開發|設計|製作|更新|新增|添加|修改|修復|修正|優化|測試|除錯|清理|格式化|調整|編輯|create|build|implement|fix|add|delete|refactor|develop|design|update|modify|optimize|test|debug|remove|change|improve)/iu;

// 產品名詞 regex — 表示要建立完整的產品/系統/功能模組
const PRODUCT_NOUN_RE = /(?:遊戲|網站|應用|系統|平台|服務|程式|機器人|功能|模組|流程|工具|擴充|外掛|API|app|game|website|application|platform|service|bot|server|module|tool|plugin|extension|feature|component)/iu;

// 疑問詞開頭 regex
const QUESTION_START_RE = /^(?:what|how|why|where|which|when|who|explain|describe|tell me|show me|can you explain|could you|is it|are there|do you|does it)/i;
const QUESTION_START_ZH_RE = /^(?:什麼|如何|為什麼|為何|怎麼|哪|誰|何時|在哪|解釋|說明|顯示|列出|幫我看|看一下|請問|是不是|有沒有|能不能)/u;

/**
 * 結構特徵定義
 * 每個特徵：{ name, level, test(prompt, metrics), confidence }
 */
const STRUCTURAL_FEATURES = {
  // ── 明確 simple 的特徵（高信度 >= 0.85）──
  definitelySimple: [
    {
      name: 'question_pattern',
      test: (prompt, metrics, _sanitized) => {
        const questionStart = QUESTION_START_RE.test(prompt) || QUESTION_START_ZH_RE.test(prompt);
        const questionEnd = /[?？]$/.test(prompt.trim());
        const isShort = metrics.wordCount <= 20;
        return (questionStart && isShort) || (questionStart && questionEnd);
      },
      confidence: 0.95
    },
    {
      name: 'very_short_no_action',
      test: (_prompt, metrics, sanitized) => {
        // 用 sanitized 避免路徑中的 "build"/"test" 等誤觸發
        return metrics.wordCount <= 8 && !ACTION_VERB_RE.test(sanitized) && !metrics.hasMultipleSteps;
      },
      confidence: 0.9
    },
    {
      name: 'zh_query_suffix',
      test: (prompt, _metrics, _sanitized) => {
        return /(?:是什麼|做什麼|什麼意思|怎麼用|怎麼回事|怎麼辦|有什麼|什麼區別|什麼差異|有什麼好處)/.test(prompt)
          && prompt.length <= 50;
      },
      confidence: 0.9
    }
  ],

  // ── 明確 complex 的特徵（高信度 >= 0.8）──
  definitelyComplex: [
    {
      name: 'multi_step_markers',
      test: (_prompt, metrics, _sanitized) => metrics.hasMultipleSteps,
      confidence: 0.85
    },
    {
      name: 'create_product_pattern',
      test: (_prompt, _metrics, sanitized) => {
        // 「做/寫/建 + (一個)? + 產品名詞」— 完整產品建立
        // 使用 sanitized 避免路徑中的 "build"/"server" 等誤觸發
        return /(?:做|寫|建|製作|開發|設計|實作|幫我做|幫我寫|幫我建|create|build|implement|develop|make)\s*(?:一個|一套)?\s*.*/.test(sanitized)
          && PRODUCT_NOUN_RE.test(sanitized);
      },
      confidence: 0.9
    },
    {
      name: 'long_action_prompt',
      test: (_prompt, metrics, sanitized) => {
        return metrics.wordCount > 50 && ACTION_VERB_RE.test(sanitized);
      },
      confidence: 0.85
    },
    {
      name: 'high_compound_requirements',
      test: (_prompt, metrics, _sanitized) => metrics.compoundRequirements >= 3,
      confidence: 0.85
    },
    {
      name: 'multiple_files_mentioned',
      test: (prompt, metrics, _sanitized) => {
        const filePatterns = prompt.match(/[\w\-.]+\.\w{1,5}/g) || [];
        return filePatterns.length >= 3 || metrics.mentionsMultipleFiles;
      },
      confidence: 0.8
    }
  ],

  // ── 傾向 moderate 的特徵（中信度 0.6-0.8）──
  leanModerate: [
    {
      name: 'single_action_short',
      test: (_prompt, metrics, sanitized) => {
        // 用 sanitized 避免路徑誤觸發
        const actionMatches = sanitized.match(/(?:修復|修正|更新|修改|添加|新增|刪除|移除|加入|加上|加|改|優化|測試|除錯|格式化|調整|fix|update|modify|add|change|delete|remove|optimize|debug|improve)/gu) || [];
        return actionMatches.length >= 1 && metrics.wordCount <= 30 && !metrics.hasMultipleSteps;
      },
      confidence: 0.7
    },
    {
      name: 'action_without_product',
      test: (_prompt, _metrics, sanitized) => {
        // 用 sanitized 避免路徑誤觸發
        return ACTION_VERB_RE.test(sanitized) && !PRODUCT_NOUN_RE.test(sanitized);
      },
      confidence: 0.65
    }
  ]
};

/**
 * Layer 1: 結構特徵分析
 * 注意：特徵規則的 verb/noun 匹配使用 sanitized prompt（避免路徑 substring 誤報）
 * @param {string} prompt - 原始 prompt
 * @returns {{ level: string, confidence: number, matchedFeatures: string[], metrics: object, needsLLM: boolean }}
 */
function analyzeStructural(prompt, confidenceThreshold = 0.8) {
  const metrics = analyzePromptMetrics(prompt);
  const { sanitized } = sanitizePrompt(prompt);
  const matchedFeatures = [];

  // 收集所有匹配的特徵（傳入 sanitized 用於 verb/noun 匹配）
  for (const feature of STRUCTURAL_FEATURES.definitelySimple) {
    if (feature.test(prompt, metrics, sanitized)) {
      matchedFeatures.push({ name: feature.name, level: 'simple', confidence: feature.confidence });
    }
  }
  for (const feature of STRUCTURAL_FEATURES.definitelyComplex) {
    if (feature.test(prompt, metrics, sanitized)) {
      matchedFeatures.push({ name: feature.name, level: 'complex', confidence: feature.confidence });
    }
  }
  for (const feature of STRUCTURAL_FEATURES.leanModerate) {
    if (feature.test(prompt, metrics, sanitized)) {
      matchedFeatures.push({ name: feature.name, level: 'moderate', confidence: feature.confidence });
    }
  }

  // 計算各級別的最高信度
  const levelConfidence = { simple: 0, moderate: 0, complex: 0 };
  for (const f of matchedFeatures) {
    levelConfidence[f.level] = Math.max(levelConfidence[f.level], f.confidence);
  }

  // 衝突檢測：simple 和 complex 都高信度 → 不確定 → 需要 LLM
  if (levelConfidence.simple >= 0.8 && levelConfidence.complex >= 0.8) {
    return {
      level: 'complex', // fallback 預設 complex
      confidence: 0,
      matchedFeatures: matchedFeatures.map(f => f.name),
      metrics,
      needsLLM: true
    };
  }

  // 選擇最高信度的級別
  let bestLevel = 'complex'; // 預設 complex（寧可多分解）
  let bestConfidence = 0;

  for (const [level, conf] of Object.entries(levelConfidence)) {
    if (conf > bestConfidence) {
      bestConfidence = conf;
      bestLevel = level;
    }
  }

  return {
    level: bestLevel,
    confidence: bestConfidence,
    matchedFeatures: matchedFeatures.map(f => f.name),
    metrics,
    needsLLM: bestConfidence < confidenceThreshold
  };
}

// ============================================================
// 分類輔助函數（保留既有）
// ============================================================

/**
 * 識別請求類型
 */
function identifyRequestType(prompt) {
  const lowerPrompt = prompt.toLowerCase();

  for (const indicator of REQUEST_TYPES.multiStep) {
    if (prompt.includes(indicator) || lowerPrompt.includes(indicator)) {
      return 'multi-step';
    }
  }
  for (const indicator of REQUEST_TYPES.query) {
    if (lowerPrompt.startsWith(indicator) || prompt.startsWith(indicator)) {
      return 'query';
    }
  }
  for (const indicator of REQUEST_TYPES.action) {
    if (lowerPrompt.includes(indicator) || prompt.includes(indicator)) {
      return 'action';
    }
  }
  return 'action';
}

/**
 * 分析 prompt 指標
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
  if (requestType === 'query') return 'explorer';
  switch (complexity) {
    case 'complex': return 'architect';
    case 'moderate': return 'developer';
    case 'simple':
    default: return null;
  }
}

// ============================================================
// 載入分類器配置
// ============================================================

/**
 * 從 config.yaml 載入分類器配置
 * @returns {object}
 */
function loadClassifierConfig() {
  try {
    const paths = getVibeEnginePaths();
    const configPath = paths.config;
    if (!fs.existsSync(configPath)) return {};
    const content = fs.readFileSync(configPath, 'utf8');
    // 簡單解析 YAML classifier 區段
    const yamlParser = require('./lib/yaml-parser');
    const config = yamlParser.parseYaml(content);
    return config?.classifier || {};
  } catch {
    return {};
  }
}

// ============================================================
// 三層混合分類主流程
// ============================================================

/**
 * 混合分類主流程（async）
 * Layer 0 → Layer 1 → (cache) → Layer 2 → fallback
 *
 * @param {string} prompt - 用戶原始 prompt
 * @returns {Promise<object>} - 完整分類結果
 */
async function classifyHybrid(prompt) {
  const config = loadClassifierConfig();
  const confidenceThreshold = config.confidence_threshold || 0.8;

  // Layer 0: 快速路徑
  const fast = tryFastPath(prompt);
  if (fast) {
    return buildClassificationResult(fast.level, 'fast_path', fast.confidence, prompt);
  }

  // Layer 1: 結構特徵分析
  const structural = analyzeStructural(prompt, confidenceThreshold);

  // 高信度 → 直接返回
  if (!structural.needsLLM) {
    return buildClassificationResult(
      structural.level, 'structural', structural.confidence,
      prompt, structural.metrics
    );
  }

  // LLM 層是否啟用？
  const llmEnabled = config.llm_enabled !== false; // 預設 true
  const apiKey = getApiKey();

  if (!llmEnabled || !apiKey) {
    // 無 LLM → fallback（預設 complex）
    const fallbackLevel = structural.confidence > 0 ? structural.level : 'complex';
    return buildClassificationResult(
      fallbackLevel, 'structural_fallback', structural.confidence,
      prompt, structural.metrics
    );
  }

  // 檢查快取
  const cacheEnabled = config.cache_enabled !== false;
  const paths = getVibeEnginePaths();
  const cachePath = path.join(paths.root, 'classifier-cache.json');

  if (cacheEnabled) {
    const ttl = config.cache_ttl_ms || DEFAULT_CACHE_TTL_MS;
    const cached = lookupCache(prompt, cachePath, ttl);
    if (cached) {
      return buildClassificationResult(
        cached.complexity, 'cache', 0.95,
        prompt, structural.metrics, cached
      );
    }
  }

  // Layer 2: LLM 分類
  try {
    const model = config.llm_model || DEFAULT_MODEL;
    const timeoutMs = config.llm_timeout_ms || DEFAULT_TIMEOUT_MS;
    const llmResult = await classifyWithLLM(prompt, apiKey, { model, timeoutMs });

    // 寫入快取
    if (cacheEnabled) {
      const maxEntries = config.cache_max_entries || DEFAULT_CACHE_MAX_ENTRIES;
      writeCache(prompt, llmResult, cachePath, maxEntries);
    }

    return buildClassificationResult(
      llmResult.complexity, 'llm', 0.95,
      prompt, structural.metrics, llmResult
    );
  } catch {
    // LLM 失敗 → fallback（預設 complex）
    const fallbackLevel = structural.confidence > 0 ? structural.level : 'complex';
    return buildClassificationResult(
      fallbackLevel, 'structural_fallback', structural.confidence,
      prompt, structural.metrics
    );
  }
}

/**
 * 建構分類結果（統一輸出格式）
 */
function buildClassificationResult(complexity, method, confidence, prompt, metrics = null, llmResult = null) {
  const m = metrics || analyzePromptMetrics(prompt);
  const requestType = llmResult?.requestType || identifyRequestType(prompt);
  const agent = llmResult?.suggestedAgent !== undefined ? llmResult.suggestedAgent : suggestAgent(complexity, requestType);

  return {
    // 既有欄位（向後相容）
    complexity,
    requestType,
    needsDecomposition: llmResult?.needsDecomposition
      ?? (complexity === 'complex'
        || m.hasMultipleSteps
        || (complexity === 'moderate' && m.compoundRequirements >= 2)),
    suggestedAgent: agent,
    metrics: m,
    // 新增欄位
    classificationMethod: method,
    classificationConfidence: confidence
  };
}

// ============================================================
// 公開 API
// ============================================================

/**
 * 完整請求分類（async — 支援 LLM 路徑）
 * @param {string} prompt
 * @returns {Promise<object>}
 */
async function classifyRequest(prompt) {
  return classifyHybrid(prompt);
}

/**
 * 同步複雜度分類（向後相容 — 僅用 Layer 0 + Layer 1）
 * 注意：這是 legacy API，不會觸發 LLM 呼叫
 */
function classifyComplexity(prompt, metrics) {
  const m = metrics || analyzePromptMetrics(prompt);

  // Layer 0
  const fast = tryFastPath(prompt);
  if (fast) return fast.level;

  // Layer 1
  const structural = analyzeStructural(prompt);
  return structural.level;
}

// ============================================================
// Hook 入口
// ============================================================

async function main() {
  let input = '';
  process.stdin.setEncoding('utf8');

  await new Promise((resolve) => {
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', resolve);
    // TTY stdin 不會有 end 事件
    if (process.stdin.isTTY) {
      resolve();
    }
  });

  try {
    const hookInput = JSON.parse(input);
    const userPrompt = hookInput.user_prompt || hookInput.prompt || '';

    // 分類請求（async — 可能觸發 LLM）
    const classification = await classifyRequest(userPrompt);

    // 寫入共享檔案供下游 hooks 讀取
    const paths = getVibeEnginePaths();
    safeWriteJSON(path.join(paths.root, 'last-classification.json'), {
      ...classification,
      timestamp: Date.now(),
      prompt: userPrompt.substring(0, 200)
    }, false);

    // 輸出分類結果
    const output = {
      continue: true,
      suppressOutput: false
    };

    if (classification.complexity === 'complex') {
      output.systemMessage = `[Vibe Engine] Complex request detected (${classification.requestType}). Task decomposition recommended. [method: ${classification.classificationMethod}]`;
    }

    console.log(JSON.stringify(output));

  } catch (error) {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: false
    }));
  }
}

// 導出供測試使用
module.exports = {
  // 核心 API
  classifyRequest,
  classifyHybrid,
  classifyComplexity,
  identifyRequestType,
  analyzePromptMetrics,
  suggestAgent,

  // 三層架構
  tryFastPath,
  analyzeStructural,
  buildClassificationResult,
  loadClassifierConfig,

  // 工具函數
  sanitizePrompt,
  countWords,
  detectCompoundRequirements,

  // 常量（向後相容）
  INDICATORS,
  STRUCTURAL_FEATURES,
  FAST_PATH_PATTERNS
};

// 直接執行時作為 hook 腳本
if (require.main === module) {
  main().catch(() => {
    console.log(JSON.stringify({ continue: true, suppressOutput: false }));
  });
}
