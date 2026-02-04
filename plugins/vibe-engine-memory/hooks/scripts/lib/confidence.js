/**
 * Confidence Scoring - 信心分數模組
 *
 * 實現 Confidence Scoring 系統：
 * - 信心等級判斷
 * - 信心分數計算
 * - 信心衰減
 * - 閾值判斷
 *
 * 對應章節：Ch5 記憶系統 - Confidence Scoring
 */

const { daysBetween } = require('./common');

/**
 * 信心等級定義
 */
const CONFIDENCE_LEVELS = {
  TENTATIVE: {
    name: 'tentative',
    min: 0.3,
    max: 0.4,
    description: '初步觀察，可能不準確',
    behavior: '建議但不強制，需用戶確認'
  },
  MODERATE: {
    name: 'moderate',
    min: 0.5,
    max: 0.6,
    description: '有一定依據，但未完全確認',
    behavior: '相關時應用，允許覆蓋'
  },
  STRONG: {
    name: 'strong',
    min: 0.7,
    max: 0.8,
    description: '多次驗證，高度可信',
    behavior: '自動應用，除非用戶明確否定'
  },
  NEAR_CERTAIN: {
    name: 'near_certain',
    min: 0.9,
    max: 1.0,
    description: '用戶明確聲明或核心行為',
    behavior: '總是應用，視為規則'
  }
};

/**
 * 閾值配置
 */
const THRESHOLDS = {
  INJECT: 0.5,        // 低於此分數不自動注入
  SUGGEST: 0.3,       // 低於此分數不建議
  AUTO_APPLY: 0.7,    // 高於此分數自動應用
  MIN_DECAY: 0.2      // 衰減後的最低分數
};

/**
 * 初始信心分數（根據來源）
 */
const INITIAL_CONFIDENCE = {
  EXPLICIT_USER: 0.9,       // 用戶明確說的
  INFERRED_CODE: 0.6,       // 從代碼推斷的
  SINGLE_OBSERVATION: 0.3,  // 單次觀察
  IMPORTED: 0.5             // 從外部導入
};

/**
 * 信心調整規則
 */
const ADJUSTMENT_RULES = {
  REPEATED_OBSERVATION: 0.1,   // 每次重複觀察 +0.1
  USER_CONFIRMATION: 0.2,      // 用戶確認 +0.2
  USER_CORRECTION: -0.3,       // 用戶糾正 -0.3
  CONTRADICTION: -0.2,         // 發現矛盾 -0.2
  MONTHLY_DECAY: -0.01         // 每 30 天未使用 -0.01
};

/**
 * 獲取信心等級
 *
 * @param {number} score - 信心分數 (0-1)
 * @returns {object} - 信心等級資訊
 */
function getConfidenceLevel(score) {
  if (score >= CONFIDENCE_LEVELS.NEAR_CERTAIN.min) {
    return CONFIDENCE_LEVELS.NEAR_CERTAIN;
  }
  if (score >= CONFIDENCE_LEVELS.STRONG.min) {
    return CONFIDENCE_LEVELS.STRONG;
  }
  if (score >= CONFIDENCE_LEVELS.MODERATE.min) {
    return CONFIDENCE_LEVELS.MODERATE;
  }
  if (score >= CONFIDENCE_LEVELS.TENTATIVE.min) {
    return CONFIDENCE_LEVELS.TENTATIVE;
  }

  return {
    name: 'uncertain',
    min: 0,
    max: 0.3,
    description: '不確定',
    behavior: '不使用'
  };
}

/**
 * 判斷是否應該注入到 context
 *
 * @param {number} score - 信心分數
 * @returns {boolean}
 */
function shouldInject(score) {
  return score >= THRESHOLDS.INJECT;
}

/**
 * 判斷是否應該自動應用
 *
 * @param {number} score - 信心分數
 * @returns {boolean}
 */
function shouldAutoApply(score) {
  return score >= THRESHOLDS.AUTO_APPLY;
}

/**
 * 判斷是否應該建議
 *
 * @param {number} score - 信心分數
 * @returns {boolean}
 */
function shouldSuggest(score) {
  return score >= THRESHOLDS.SUGGEST;
}

/**
 * 計算信心衰減
 *
 * @param {object} memory - 記憶項目
 * @param {string} currentDate - 當前日期（可選，預設為現在）
 * @returns {number} - 衰減後的信心分數
 */
function calculateDecay(memory, currentDate = null) {
  const lastAccessed = memory.metadata?.last_accessed || memory.metadata?.created_at;
  if (!lastAccessed) {
    return memory.metadata?.confidence || 0;
  }

  const days = daysBetween(lastAccessed, currentDate);
  const monthsInactive = Math.floor(days / 30);

  if (monthsInactive === 0) {
    return memory.metadata.confidence;
  }

  const decay = monthsInactive * Math.abs(ADJUSTMENT_RULES.MONTHLY_DECAY);
  const newConfidence = memory.metadata.confidence - decay;

  return Math.max(THRESHOLDS.MIN_DECAY, newConfidence);
}

/**
 * 調整信心分數
 *
 * @param {number} currentScore - 當前分數
 * @param {string} event - 事件類型
 * @returns {number} - 調整後的分數
 */
function adjustConfidence(currentScore, event) {
  let adjustment = 0;

  switch (event) {
    case 'repeated_observation':
      adjustment = ADJUSTMENT_RULES.REPEATED_OBSERVATION;
      break;
    case 'user_confirmation':
      adjustment = ADJUSTMENT_RULES.USER_CONFIRMATION;
      break;
    case 'user_correction':
      adjustment = ADJUSTMENT_RULES.USER_CORRECTION;
      break;
    case 'contradiction':
      adjustment = ADJUSTMENT_RULES.CONTRADICTION;
      break;
    default:
      return currentScore;
  }

  const newScore = currentScore + adjustment;
  return Math.max(0, Math.min(1, newScore)); // 限制在 0-1
}

/**
 * 獲取初始信心分數
 *
 * @param {string} source - 來源類型
 * @returns {number}
 */
function getInitialConfidence(source) {
  switch (source) {
    case 'explicit_user':
    case 'user':
      return INITIAL_CONFIDENCE.EXPLICIT_USER;
    case 'inferred_code':
    case 'code':
      return INITIAL_CONFIDENCE.INFERRED_CODE;
    case 'single_observation':
    case 'observation':
      return INITIAL_CONFIDENCE.SINGLE_OBSERVATION;
    case 'imported':
    case 'import':
      return INITIAL_CONFIDENCE.IMPORTED;
    default:
      return INITIAL_CONFIDENCE.SINGLE_OBSERVATION;
  }
}

/**
 * 獲取信心等級的顯示圖示
 *
 * @param {number} score - 信心分數
 * @returns {string} - 圖示字串
 */
function getConfidenceIcon(score) {
  if (score >= 0.9) return '\u2B50\u2B50';  // ⭐⭐
  if (score >= 0.7) return '\u2B50';        // ⭐
  if (score >= 0.5) return '\u25CB';        // ○
  if (score >= 0.3) return '\u00B7';        // ·
  return '';
}

/**
 * 格式化信心分數為百分比
 *
 * @param {number} score - 信心分數
 * @returns {string}
 */
function formatConfidence(score) {
  return `${(score * 100).toFixed(0)}%`;
}

/**
 * 比較兩個記憶的優先級（用於衝突解決）
 *
 * @param {object} memory1 - 記憶項目 1
 * @param {object} memory2 - 記憶項目 2
 * @returns {number} - -1, 0, 1（memory1 優先為 -1）
 */
function compareMemoryPriority(memory1, memory2) {
  const conf1 = memory1.metadata?.confidence || 0;
  const conf2 = memory2.metadata?.confidence || 0;

  // 首先比較信心分數
  if (conf1 !== conf2) {
    return conf2 - conf1; // 高信心優先
  }

  // 信心相同則比較更新時間
  const date1 = new Date(memory1.metadata?.updated_at || 0);
  const date2 = new Date(memory2.metadata?.updated_at || 0);

  return date2 - date1; // 較新優先
}

module.exports = {
  CONFIDENCE_LEVELS,
  THRESHOLDS,
  INITIAL_CONFIDENCE,
  ADJUSTMENT_RULES,
  getConfidenceLevel,
  shouldInject,
  shouldAutoApply,
  shouldSuggest,
  calculateDecay,
  adjustConfidence,
  getInitialConfidence,
  getConfidenceIcon,
  formatConfidence,
  compareMemoryPriority
};
