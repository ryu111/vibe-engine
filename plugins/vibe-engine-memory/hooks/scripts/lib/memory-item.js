/**
 * Memory Item Utilities - 記憶項目模組
 *
 * 提供 MemoryItem 結構的創建、驗證、格式化：
 * - 創建新記憶項目
 * - 驗證記憶項目結構
 * - 格式化輸出
 *
 * 對應章節：Ch5 記憶系統
 */

const { generateId, now } = require('./common');

/**
 * 記憶類型
 */
const MEMORY_TYPES = {
  SEMANTIC: 'semantic',     // 事實知識
  EPISODIC: 'episodic',     // 過往經驗
  PROCEDURAL: 'procedural'  // 操作程序
};

/**
 * 記憶來源
 */
const MEMORY_SOURCES = {
  USER: 'user',       // 用戶明確說的
  AGENT: 'agent',     // AI 推斷的
  SYSTEM: 'system'    // 系統自動提取的
};

/**
 * 創建新的記憶項目
 *
 * @param {string} type - 記憶類型 (semantic/episodic/procedural)
 * @param {string} content - 記憶內容
 * @param {object} options - 選項
 * @returns {object} - MemoryItem
 */
function createMemoryItem(type, content, options = {}) {
  const {
    source = MEMORY_SOURCES.AGENT,
    confidence = 0.5,
    tags = [],
    relations = {}
  } = options;

  // 驗證類型
  if (!Object.values(MEMORY_TYPES).includes(type)) {
    throw new Error(`Invalid memory type: ${type}`);
  }

  const timestamp = now();

  return {
    id: generateId('mem'),
    type,
    content: content.trim(),
    metadata: {
      created_at: timestamp,
      updated_at: timestamp,
      access_count: 0,
      last_accessed: null,
      source,
      confidence: Math.max(0, Math.min(1, confidence)), // 限制在 0-1
      tags: Array.isArray(tags) ? tags : [tags]
    },
    relations: {
      supersedes: relations.supersedes || null,
      related_to: relations.related_to || []
    }
  };
}

/**
 * 更新記憶項目的存取時間
 *
 * @param {object} item - MemoryItem
 * @returns {object} - 更新後的 MemoryItem
 */
function touchMemoryItem(item) {
  return {
    ...item,
    metadata: {
      ...item.metadata,
      access_count: (item.metadata.access_count || 0) + 1,
      last_accessed: now(),
      updated_at: now()
    }
  };
}

/**
 * 更新記憶項目的內容
 *
 * @param {object} item - MemoryItem
 * @param {string} newContent - 新內容
 * @param {object} options - 選項
 * @returns {object} - 更新後的 MemoryItem
 */
function updateMemoryContent(item, newContent, options = {}) {
  const updates = {
    content: newContent.trim(),
    metadata: {
      ...item.metadata,
      updated_at: now()
    }
  };

  if (options.confidence !== undefined) {
    updates.metadata.confidence = Math.max(0, Math.min(1, options.confidence));
  }

  if (options.tags) {
    updates.metadata.tags = Array.isArray(options.tags) ? options.tags : [options.tags];
  }

  return { ...item, ...updates };
}

/**
 * 驗證記憶項目結構
 *
 * @param {object} item - 要驗證的物件
 * @returns {object} - { valid: boolean, errors: string[] }
 */
function validateMemoryItem(item) {
  const errors = [];

  if (!item) {
    return { valid: false, errors: ['Item is null or undefined'] };
  }

  if (!item.id || typeof item.id !== 'string') {
    errors.push('Missing or invalid id');
  }

  if (!Object.values(MEMORY_TYPES).includes(item.type)) {
    errors.push(`Invalid type: ${item.type}`);
  }

  if (!item.content || typeof item.content !== 'string') {
    errors.push('Missing or invalid content');
  }

  if (!item.metadata) {
    errors.push('Missing metadata');
  } else {
    if (typeof item.metadata.confidence !== 'number') {
      errors.push('Missing or invalid confidence');
    }
    if (!item.metadata.created_at) {
      errors.push('Missing created_at');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 格式化記憶項目為顯示字串
 *
 * @param {object} item - MemoryItem
 * @param {string} format - 格式 (short/full)
 * @returns {string}
 */
function formatMemoryItem(item, format = 'short') {
  const icons = {
    [MEMORY_TYPES.SEMANTIC]: '\u{1F4CC}',   // 📌
    [MEMORY_TYPES.EPISODIC]: '\u{1F4A1}',   // 💡
    [MEMORY_TYPES.PROCEDURAL]: '\u{1F4CB}'  // 📋
  };

  const icon = icons[item.type] || '\u{1F4DD}'; // 📝 default
  const confidence = item.metadata?.confidence || 0;
  const stars = confidence >= 0.9 ? '\u2B50\u2B50' :
                confidence >= 0.7 ? '\u2B50' :
                confidence >= 0.5 ? '\u25CB' : '\u00B7';

  if (format === 'short') {
    return `${icon} ${item.content.substring(0, 80)}${item.content.length > 80 ? '...' : ''} ${stars}`;
  }

  // full format
  const lines = [
    `${icon} [${item.type.toUpperCase()}] ${stars} (${(confidence * 100).toFixed(0)}%)`,
    `Content: ${item.content}`,
    `Created: ${item.metadata.created_at}`,
    `Accessed: ${item.metadata.access_count} times`
  ];

  if (item.metadata.tags?.length > 0) {
    lines.push(`Tags: ${item.metadata.tags.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * 計算兩個記憶項目的相似度（基於內容）
 * 簡單實作：基於共同詞彙
 *
 * @param {object} item1 - MemoryItem
 * @param {object} item2 - MemoryItem
 * @returns {number} - 0-1 的相似度分數
 */
function calculateSimilarity(item1, item2) {
  const words1 = new Set(item1.content.toLowerCase().split(/\s+/));
  const words2 = new Set(item2.content.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * 檢查是否為重複記憶
 *
 * @param {object} newItem - 新記憶
 * @param {Array} existingItems - 現有記憶列表
 * @param {number} threshold - 相似度閾值
 * @returns {object|null} - 找到的重複項目或 null
 */
function findDuplicate(newItem, existingItems, threshold = 0.8) {
  for (const existing of existingItems) {
    if (existing.type !== newItem.type) continue;

    const similarity = calculateSimilarity(newItem, existing);
    if (similarity >= threshold) {
      return existing;
    }
  }
  return null;
}

module.exports = {
  MEMORY_TYPES,
  MEMORY_SOURCES,
  createMemoryItem,
  touchMemoryItem,
  updateMemoryContent,
  validateMemoryItem,
  formatMemoryItem,
  calculateSimilarity,
  findDuplicate
};
