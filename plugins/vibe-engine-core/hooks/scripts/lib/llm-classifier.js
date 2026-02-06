/**
 * LLM Classifier - 使用 Anthropic Haiku 進行精確 prompt 分類
 *
 * 功能：
 * 1. 呼叫 Anthropic Messages API 做意圖分類
 * 2. 結果快取（避免重複呼叫）
 * 3. 可注入 mock（測試用）
 *
 * 約束：
 * - 只用 Node.js 內建 https 模組
 * - LLM 延遲預算 3 秒（hook 總 timeout 5 秒）
 * - 失敗時由呼叫方 fallback
 *
 * 對應章節：Ch1 協調引擎 — 混合分類器 Layer 2
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================================
// 常量
// ============================================================

const ANTHROPIC_API_HOST = 'api.anthropic.com';
const ANTHROPIC_API_PATH = '/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_CACHE_TTL_MS = 86400000; // 24 小時
const DEFAULT_CACHE_MAX_ENTRIES = 500;

const CLASSIFICATION_PROMPT = `You are a prompt complexity classifier for a software development AI assistant.

Classify the following user prompt into exactly ONE of these categories:

COMPLEXITY:
- "simple": Pure questions, status checks, reading requests. No code changes needed.
- "moderate": Single-file changes, simple fixes, adding one feature/button/endpoint.
- "complex": Multi-file changes, building entire features/apps/systems, refactoring across files.

REQUEST_TYPE:
- "query": Questions about code/concepts, reading files, checking status.
- "action": Making changes to code, fixing bugs, adding features.
- "multi-step": Tasks with explicit sequential steps or multiple distinct sub-tasks.

AGENT:
- "explorer": For queries and code exploration.
- "developer": For single moderate changes.
- "architect": For complex design and multi-file work.
- null: For simple questions that need no agent.

Respond with ONLY a JSON object, no explanation:
{"complexity":"...","requestType":"...","suggestedAgent":"...","needsDecomposition":true|false}

User prompt: `;

// ============================================================
// HTTP 請求注入點（測試用 mock）
// ============================================================

let _httpRequestFn = null;

/**
 * 設定自訂 HTTP 請求函數（測試用）
 * @param {Function|null} fn - 替換 https.request 的函數，null 恢復預設
 */
function setHttpRequestFn(fn) {
  _httpRequestFn = fn;
}

/**
 * 取得 HTTP 請求函數
 */
function getHttpRequestFn() {
  return _httpRequestFn || https.request;
}

// ============================================================
// API Key 管理
// ============================================================

/**
 * 取得 API Key
 * 優先級：VIBE_ENGINE_API_KEY → ANTHROPIC_API_KEY
 * @returns {string|null}
 */
function getApiKey() {
  return process.env.VIBE_ENGINE_API_KEY
    || process.env.ANTHROPIC_API_KEY
    || null;
}

// ============================================================
// LLM 分類
// ============================================================

/**
 * 使用 LLM 分類用戶 prompt
 * @param {string} userPrompt - 用戶的原始 prompt
 * @param {string} apiKey - Anthropic API key
 * @param {object} options - { model, timeoutMs }
 * @returns {Promise<object>} - { complexity, requestType, suggestedAgent, needsDecomposition }
 */
async function classifyWithLLM(userPrompt, apiKey, options = {}) {
  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const truncatedPrompt = userPrompt.substring(0, 500);

  const payload = JSON.stringify({
    model,
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: CLASSIFICATION_PROMPT + truncatedPrompt
    }]
  });

  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: ANTHROPIC_API_HOST,
      port: 443,
      path: ANTHROPIC_API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: timeoutMs
    };

    const httpRequest = getHttpRequestFn();
    const req = httpRequest(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`API ${res.statusCode}: ${data.substring(0, 200)}`));
          return;
        }
        try {
          const response = JSON.parse(data);
          const content = response.content?.[0]?.text || '';
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            resolve(validateLLMResult(result));
          } else {
            reject(new Error('No JSON in LLM response'));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request error: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('LLM timeout'));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * 驗證 LLM 回傳的 JSON 符合預期 schema
 * @param {object} result - LLM 回傳的 raw JSON
 * @returns {object} - 正規化後的結果
 */
function validateLLMResult(result) {
  const validComplexity = ['simple', 'moderate', 'complex'];
  const validRequestType = ['query', 'action', 'multi-step'];
  const validAgent = ['architect', 'developer', 'explorer', null];

  const suggestedAgent = result.suggestedAgent === 'null' ? null : result.suggestedAgent;

  return {
    complexity: validComplexity.includes(result.complexity) ? result.complexity : 'moderate',
    requestType: validRequestType.includes(result.requestType) ? result.requestType : 'action',
    suggestedAgent: validAgent.includes(suggestedAgent) ? suggestedAgent : null,
    needsDecomposition: typeof result.needsDecomposition === 'boolean' ? result.needsDecomposition : false
  };
}

// ============================================================
// 快取管理
// ============================================================

/**
 * 正規化 prompt 用於快取 key
 */
function normalizePrompt(prompt) {
  return prompt
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[。！？.,!?]+$/, '')
    .trim();
}

/**
 * 計算 prompt 的 hash（快取 key）
 * @param {string} prompt
 * @returns {string} - 8 碼 hex
 */
function hashPrompt(prompt) {
  const normalized = normalizePrompt(prompt);
  return crypto.createHash('md5')
    .update(normalized)
    .digest('hex')
    .substring(0, 8);
}

/**
 * 載入快取
 * @param {string} cachePath - 快取檔案路徑
 * @returns {object} - { version, entries, stats }
 */
function loadCache(cachePath) {
  try {
    const content = fs.readFileSync(cachePath, 'utf8');
    const cache = JSON.parse(content);
    if (cache && cache.version === 1 && cache.entries) {
      return cache;
    }
  } catch {
    // 檔案不存在或格式錯誤
  }
  return { version: 1, entries: {}, stats: { totalHits: 0, totalMisses: 0, llmCalls: 0 } };
}

/**
 * 從快取查找分類結果
 * @param {string} prompt - 用戶 prompt
 * @param {string} cachePath - 快取檔案路徑
 * @param {number} ttlMs - 快取有效期（毫秒）
 * @returns {object|null} - { complexity, requestType, ... } 或 null
 */
function lookupCache(prompt, cachePath, ttlMs = DEFAULT_CACHE_TTL_MS) {
  const cache = loadCache(cachePath);
  const hash = hashPrompt(prompt);
  const entry = cache.entries[hash];

  if (entry && (Date.now() - entry.timestamp) < ttlMs) {
    // 更新命中統計
    entry.hitCount = (entry.hitCount || 0) + 1;
    cache.stats.totalHits = (cache.stats.totalHits || 0) + 1;
    saveCache(cachePath, cache);
    return entry.result;
  }

  return null;
}

/**
 * 寫入快取
 * @param {string} prompt - 用戶 prompt
 * @param {object} result - 分類結果
 * @param {string} cachePath - 快取檔案路徑
 * @param {number} maxEntries - 最大條目數
 */
function writeCache(prompt, result, cachePath, maxEntries = DEFAULT_CACHE_MAX_ENTRIES) {
  const cache = loadCache(cachePath);
  const hash = hashPrompt(prompt);

  cache.entries[hash] = {
    result,
    timestamp: Date.now(),
    hitCount: 0
  };
  cache.stats.llmCalls = (cache.stats.llmCalls || 0) + 1;
  cache.stats.totalMisses = (cache.stats.totalMisses || 0) + 1;

  // LRU 淘汰：超過最大條目數時移除最舊的
  const entries = Object.entries(cache.entries);
  if (entries.length > maxEntries) {
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.length - maxEntries;
    for (let i = 0; i < toRemove; i++) {
      delete cache.entries[entries[i][0]];
    }
  }

  saveCache(cachePath, cache);
}

/**
 * 儲存快取到檔案
 */
function saveCache(cachePath, cache) {
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
  } catch {
    // 靜默失敗 — 快取寫入不影響功能
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // 核心 API
  classifyWithLLM,
  validateLLMResult,
  getApiKey,

  // 快取
  lookupCache,
  writeCache,
  loadCache,
  hashPrompt,
  normalizePrompt,

  // 測試支援
  setHttpRequestFn,
  getHttpRequestFn,

  // 常量
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_CACHE_MAX_ENTRIES,
  CLASSIFICATION_PROMPT
};
