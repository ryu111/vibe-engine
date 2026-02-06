/**
 * Pattern Analyzer - 模式偵測與 Instinct 生成
 *
 * 從觀察（observations.jsonl）中自動偵測行為模式，
 * 並透過 InstinctManager 創建或增強 Instincts。
 *
 * 三種模式：
 * 1. CORRECTION — 用戶糾正（user_correction=true）
 * 2. REPETITION — 同工具+同目標 3+ 次
 * 3. ERROR_FIX — failure → success 相鄰配對
 *
 * 對應章節：Ch5 記憶系統 - Instinct Learning
 */

const path = require('path');
const { DOMAINS } = require('./instinct-manager');

const PATTERN_TYPES = {
  CORRECTION: 'correction',
  REPETITION: 'repetition',
  ERROR_FIX: 'error_fix'
};

/**
 * 從觀察推斷 domain
 * 基於 file extension、目錄名、工具類型
 *
 * @param {object} obs - 觀察物件
 * @returns {string} - DOMAINS 中的值
 */
function inferDomain(obs) {
  const filePath = obs.tool_input?.file_path || '';
  const ext = path.extname(filePath).toLowerCase();

  if (filePath.includes('test') || filePath.includes('spec') || filePath.includes('__tests__')) {
    return DOMAINS.TESTING;
  }
  if (/\.(md|txt|rst)$/i.test(ext) || filePath.includes('docs/')) {
    return DOMAINS.DOCUMENTATION;
  }
  if (/\.(json|yaml|yml|toml)$/i.test(ext) || filePath.includes('config')) {
    return DOMAINS.ARCHITECTURE;
  }
  if (obs.tool_name === 'Bash') {
    const cmd = (obs.tool_input?.command || '').toLowerCase();
    if (/test|jest|mocha|vitest/.test(cmd)) return DOMAINS.TESTING;
    if (/lint|eslint/.test(cmd)) return DOMAINS.CODE_STYLE;
    return DOMAINS.WORKFLOW;
  }
  return DOMAINS.CODE_STYLE;
}

// ============================================================
// 模式偵測
// ============================================================

/**
 * 偵測用戶糾正模式
 * 信心：0.4（單次觀察 + 糾正加成）
 *
 * @param {Array} observations
 * @returns {Array} Pattern[]
 */
function detectCorrections(observations) {
  const patterns = [];
  const corrections = observations.filter(o => o.user_correction);

  for (const obs of corrections) {
    const original = obs.corrects_previous
      ? observations.find(o => o.timestamp === obs.corrects_previous)
      : null;
    const target = obs.tool_input?.file_path
      ? path.basename(obs.tool_input.file_path)
      : obs.tool_name;

    patterns.push({
      type: PATTERN_TYPES.CORRECTION,
      trigger: `when using ${obs.tool_name} on ${target}`,
      action: original
        ? `User corrected previous ${original.tool_name} operation — review approach before applying`
        : `User has corrected ${obs.tool_name} operations — be careful`,
      domain: inferDomain(obs),
      confidence: 0.4,
      evidence: [
        { date: obs.timestamp.split('T')[0], description: `User corrected ${obs.tool_name} on ${target}` }
      ]
    });
  }
  return patterns;
}

/**
 * 偵測重複操作模式
 * 同工具+同目標出現 3+ 次
 * 信心：0.3 + count * 0.05（最高 0.6）
 *
 * @param {Array} observations
 * @returns {Array} Pattern[]
 */
function detectRepetitions(observations) {
  const patterns = [];
  const groups = {};

  for (const obs of observations) {
    if (obs.outcome !== 'success') continue;
    const target = obs.tool_input?.file_path
      ? path.basename(obs.tool_input.file_path)
      : (obs.tool_input?.command?.substring(0, 30) || obs.tool_name);
    const key = `${obs.tool_name}:${target}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(obs);
  }

  for (const [key, obs] of Object.entries(groups)) {
    if (obs.length < 3) continue;
    const [toolName, target] = key.split(':');
    patterns.push({
      type: PATTERN_TYPES.REPETITION,
      trigger: `when working with ${target}`,
      action: `Frequently uses ${toolName} (${obs.length}x) — established pattern`,
      domain: inferDomain(obs[0]),
      confidence: Math.min(0.6, 0.3 + obs.length * 0.05),
      evidence: obs.slice(0, 5).map(o => ({
        date: o.timestamp.split('T')[0],
        description: `${toolName} on ${target}`
      }))
    });
  }
  return patterns;
}

/**
 * 偵測錯誤修復模式
 * failure → success 相鄰配對（同工具或同目標）
 * 信心：0.5（error+fix 是較強訊號）
 *
 * @param {Array} observations
 * @returns {Array} Pattern[]
 */
function detectErrorFixes(observations) {
  const patterns = [];
  for (let i = 1; i < observations.length; i++) {
    const prev = observations[i - 1];
    const curr = observations[i];

    if (prev.outcome !== 'failure' || curr.outcome !== 'success') continue;

    const prevTarget = prev.tool_input?.file_path || prev.tool_name;
    const currTarget = curr.tool_input?.file_path || curr.tool_name;

    // 必須是同目標或同工具
    if (prevTarget !== currTarget && prev.tool_name !== curr.tool_name) continue;

    const target = path.basename(prevTarget);
    patterns.push({
      type: PATTERN_TYPES.ERROR_FIX,
      trigger: `when ${prev.tool_name} fails on ${target}`,
      action: `Fix approach: use ${curr.tool_name} with adjusted parameters`,
      domain: inferDomain(curr),
      confidence: 0.5,
      evidence: [
        { date: prev.timestamp.split('T')[0], description: `Failed: ${prev.tool_name} on ${target}` },
        { date: curr.timestamp.split('T')[0], description: `Fixed: ${curr.tool_name}` }
      ]
    });
  }
  return patterns;
}

// ============================================================
// 模式分析入口
// ============================================================

/**
 * 分析觀察，返回所有偵測到的模式
 *
 * @param {Array} observations - 觀察列表（至少 3 條才分析）
 * @returns {Array} Pattern[]
 */
function analyzePatterns(observations) {
  if (!observations || observations.length < 3) return [];

  return [
    ...detectCorrections(observations),
    ...detectRepetitions(observations),
    ...detectErrorFixes(observations)
  ];
}

// ============================================================
// Instinct 生成
// ============================================================

/**
 * 簡易觸發語相似度（Jaccard word overlap）
 *
 * @param {string} t1
 * @param {string} t2
 * @returns {number} 0.0-1.0
 */
function calculateTriggerSimilarity(t1, t2) {
  const w1 = new Set(t1.toLowerCase().split(/\s+/));
  const w2 = new Set(t2.toLowerCase().split(/\s+/));
  const intersection = [...w1].filter(w => w2.has(w)).length;
  const union = new Set([...w1, ...w2]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * 從偵測到的模式生成 Instincts
 *
 * 去重：如果已有相似 trigger（Jaccard >= 0.7）+ 相同 domain → 增強信心而非重建
 *
 * @param {Array} patterns - analyzePatterns() 的結果
 * @param {object} instinctManager - InstinctManager 實例
 * @returns {{ created: number, updated: number, skipped: number }}
 */
function generateInstincts(patterns, instinctManager) {
  let created = 0, updated = 0, skipped = 0;
  const existing = instinctManager.list();

  for (const pattern of patterns) {
    // 去重檢查
    const similar = existing.find(inst =>
      calculateTriggerSimilarity(inst.trigger, pattern.trigger) >= 0.7 &&
      inst.domain === pattern.domain
    );

    if (similar) {
      // 已存在：增強信心
      const result = instinctManager.adjustConfidenceById(similar.id, 'REPEATED_OBSERVATION');
      if (result.success) updated++;
      else skipped++;
    } else {
      // 新建 Instinct
      const result = instinctManager.create({
        trigger: pattern.trigger,
        action: pattern.action,
        domain: pattern.domain,
        confidence: pattern.confidence,
        evidence: pattern.evidence
      });
      if (result.success) {
        created++;
        existing.push(result.instinct); // 避免同一批重複創建
      } else {
        skipped++;
      }
    }
  }

  return { created, updated, skipped };
}

module.exports = {
  PATTERN_TYPES,
  inferDomain,
  analyzePatterns,
  detectCorrections,
  detectRepetitions,
  detectErrorFixes,
  generateInstincts,
  calculateTriggerSimilarity
};
