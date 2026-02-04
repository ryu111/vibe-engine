/**
 * Memory Store - 記憶存儲引擎
 *
 * 封裝三層記憶架構的 CRUD 操作：
 * - 儲存（store）
 * - 檢索（retrieve）
 * - 更新（update）
 * - 刪除（delete）
 * - 高信心記憶查詢
 * - 信心衰減
 *
 * 對應章節：Ch5 記憶系統
 */

const path = require('path');
const { getVibeEnginePaths, ensureVibeEngineDirs } = require('./common');
const { readJSONL, appendJSONL, updateJSONL, deleteJSONL, queryJSONL } = require('./jsonl');
const {
  MEMORY_TYPES,
  createMemoryItem,
  touchMemoryItem,
  findDuplicate,
  formatMemoryItem
} = require('./memory-item');
const {
  shouldInject,
  calculateDecay,
  compareMemoryPriority,
  THRESHOLDS
} = require('./confidence');

/**
 * MemoryStore 類別
 */
class MemoryStore {
  constructor(projectRoot = null) {
    this.paths = ensureVibeEngineDirs(projectRoot);
  }

  /**
   * 獲取指定類型的 JSONL 檔案路徑
   */
  getFilePath(type) {
    switch (type) {
      case MEMORY_TYPES.SEMANTIC:
        return this.paths.memory.semantic;
      case MEMORY_TYPES.EPISODIC:
        return this.paths.memory.episodic;
      case MEMORY_TYPES.PROCEDURAL:
        return this.paths.memory.procedural;
      default:
        throw new Error(`Unknown memory type: ${type}`);
    }
  }

  /**
   * 儲存新記憶
   *
   * @param {string} type - 記憶類型
   * @param {string} content - 內容
   * @param {object} options - 選項 { source, confidence, tags, dedup }
   * @returns {object} - { success, item, duplicate }
   */
  store(type, content, options = {}) {
    const { dedup = true, ...itemOptions } = options;

    try {
      const filePath = this.getFilePath(type);

      // 去重檢查
      if (dedup) {
        const existing = readJSONL(filePath);
        const tempItem = { type, content };
        const duplicate = findDuplicate(tempItem, existing, 0.8);

        if (duplicate) {
          // 更新現有記憶的信心分數
          const updatedItem = touchMemoryItem(duplicate);
          updateJSONL(filePath, duplicate.id, updatedItem);

          return {
            success: true,
            item: updatedItem,
            duplicate: true,
            message: 'Updated existing memory'
          };
        }
      }

      // 創建新記憶
      const item = createMemoryItem(type, content, itemOptions);
      const success = appendJSONL(filePath, item);

      return {
        success,
        item,
        duplicate: false,
        message: success ? 'Memory stored' : 'Failed to store'
      };
    } catch (e) {
      return {
        success: false,
        item: null,
        duplicate: false,
        message: e.message
      };
    }
  }

  /**
   * 檢索記憶
   *
   * @param {string} query - 搜尋關鍵字
   * @param {object} options - { types, minConfidence, limit, includeLowConfidence }
   * @returns {Array} - 符合條件的記憶列表
   */
  retrieve(query, options = {}) {
    const {
      types = Object.values(MEMORY_TYPES),
      minConfidence = THRESHOLDS.INJECT,
      limit = 10,
      includeLowConfidence = false
    } = options;

    const results = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);

    for (const type of types) {
      try {
        const filePath = this.getFilePath(type);
        const items = readJSONL(filePath);

        for (const item of items) {
          // 信心過濾
          const confidence = item.metadata?.confidence || 0;
          if (!includeLowConfidence && confidence < minConfidence) {
            continue;
          }

          // 計算相關性分數
          const contentLower = item.content.toLowerCase();
          let relevanceScore = 0;

          // 完全匹配
          if (contentLower.includes(queryLower)) {
            relevanceScore = 1.0;
          } else {
            // 詞彙匹配
            const matchedWords = queryWords.filter(w => contentLower.includes(w));
            relevanceScore = queryWords.length > 0
              ? matchedWords.length / queryWords.length
              : 0;
          }

          // 標籤匹配
          const tags = item.metadata?.tags || [];
          if (tags.some(t => t.toLowerCase().includes(queryLower))) {
            relevanceScore = Math.max(relevanceScore, 0.8);
          }

          if (relevanceScore > 0.2) {
            results.push({
              ...item,
              _relevanceScore: relevanceScore,
              _combinedScore: relevanceScore * 0.6 + confidence * 0.4
            });
          }
        }
      } catch (e) {
        // 忽略讀取錯誤，繼續處理其他類型
      }
    }

    // 排序：綜合分數降序
    results.sort((a, b) => b._combinedScore - a._combinedScore);

    // 限制數量並清理內部欄位
    return results.slice(0, limit).map(item => {
      const { _relevanceScore, _combinedScore, ...cleanItem } = item;
      return cleanItem;
    });
  }

  /**
   * 根據 ID 獲取記憶
   */
  getById(id) {
    for (const type of Object.values(MEMORY_TYPES)) {
      try {
        const filePath = this.getFilePath(type);
        const items = readJSONL(filePath);
        const found = items.find(item => item.id === id);
        if (found) {
          return found;
        }
      } catch (e) {
        // 繼續
      }
    }
    return null;
  }

  /**
   * 更新記憶
   */
  update(id, updates) {
    const item = this.getById(id);
    if (!item) {
      return { success: false, message: 'Memory not found' };
    }

    const filePath = this.getFilePath(item.type);
    const success = updateJSONL(filePath, id, {
      ...updates,
      metadata: {
        ...item.metadata,
        ...(updates.metadata || {}),
        updated_at: new Date().toISOString()
      }
    });

    return { success, message: success ? 'Updated' : 'Failed to update' };
  }

  /**
   * 刪除記憶
   */
  delete(id) {
    const item = this.getById(id);
    if (!item) {
      return { success: false, message: 'Memory not found' };
    }

    const filePath = this.getFilePath(item.type);
    const success = deleteJSONL(filePath, id);

    return { success, message: success ? 'Deleted' : 'Failed to delete' };
  }

  /**
   * 查找高信心記憶
   *
   * @param {number} threshold - 信心閾值
   * @param {object} options - { types, limit }
   * @returns {Array}
   */
  findHighConfidence(threshold = THRESHOLDS.AUTO_APPLY, options = {}) {
    const { types = Object.values(MEMORY_TYPES), limit = 20 } = options;
    const results = [];

    for (const type of types) {
      try {
        const filePath = this.getFilePath(type);
        const items = queryJSONL(filePath, item => {
          const confidence = item.metadata?.confidence || 0;
          return confidence >= threshold;
        }, { sortBy: 'metadata.confidence', sortOrder: 'desc' });

        results.push(...items);
      } catch (e) {
        // 繼續
      }
    }

    // 按信心分數排序
    results.sort(compareMemoryPriority);

    return results.slice(0, limit);
  }

  /**
   * 執行信心衰減
   *
   * @returns {object} - { processed, decayed }
   */
  runDecay() {
    let processed = 0;
    let decayed = 0;

    for (const type of Object.values(MEMORY_TYPES)) {
      try {
        const filePath = this.getFilePath(type);
        const items = readJSONL(filePath);
        let hasChanges = false;

        const updatedItems = items.map(item => {
          processed++;

          const currentConfidence = item.metadata?.confidence || 0;
          const newConfidence = calculateDecay(item);

          if (newConfidence < currentConfidence) {
            decayed++;
            hasChanges = true;
            return {
              ...item,
              metadata: {
                ...item.metadata,
                confidence: newConfidence,
                updated_at: new Date().toISOString()
              }
            };
          }

          return item;
        });

        if (hasChanges) {
          const { writeJSONL } = require('./jsonl');
          writeJSONL(filePath, updatedItems);
        }
      } catch (e) {
        // 繼續處理其他類型
      }
    }

    return { processed, decayed };
  }

  /**
   * 獲取統計資訊
   */
  getStats() {
    const stats = {
      total: 0,
      byType: {},
      byConfidence: {
        near_certain: 0,
        strong: 0,
        moderate: 0,
        tentative: 0,
        uncertain: 0
      }
    };

    for (const type of Object.values(MEMORY_TYPES)) {
      try {
        const filePath = this.getFilePath(type);
        const items = readJSONL(filePath);

        stats.byType[type] = items.length;
        stats.total += items.length;

        for (const item of items) {
          const conf = item.metadata?.confidence || 0;
          if (conf >= 0.9) stats.byConfidence.near_certain++;
          else if (conf >= 0.7) stats.byConfidence.strong++;
          else if (conf >= 0.5) stats.byConfidence.moderate++;
          else if (conf >= 0.3) stats.byConfidence.tentative++;
          else stats.byConfidence.uncertain++;
        }
      } catch (e) {
        stats.byType[type] = 0;
      }
    }

    return stats;
  }

  /**
   * 格式化記憶列表為注入字串
   *
   * @param {Array} memories - 記憶列表
   * @returns {string}
   */
  formatForInjection(memories) {
    if (!memories || memories.length === 0) {
      return '';
    }

    const lines = ['## 相關背景資訊', ''];

    for (const mem of memories) {
      lines.push(formatMemoryItem(mem, 'short'));
    }

    lines.push('', '---', '');

    return lines.join('\n');
  }
}

module.exports = { MemoryStore };
