/**
 * JSONL Utilities - JSONL 讀寫模組
 *
 * 提供 JSONL (JSON Lines) 格式的讀寫操作：
 * - 追加（append）
 * - 讀取（read）
 * - 查詢（query）
 * - 更新（update）
 * - 刪除（delete）
 *
 * JSONL 格式：每行一個獨立的 JSON 物件
 *
 * 對應章節：Ch5 記憶系統
 */

const fs = require('fs');
const path = require('path');

/**
 * 追加一個項目到 JSONL 檔案
 *
 * @param {string} filePath - JSONL 檔案路徑
 * @param {object} item - 要追加的物件
 * @returns {boolean} - 是否成功
 */
function appendJSONL(filePath, item) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const line = JSON.stringify(item) + '\n';
    fs.appendFileSync(filePath, line);
    return true;
  } catch (e) {
    console.error(`[JSONL] Append error: ${e.message}`);
    return false;
  }
}

/**
 * 讀取 JSONL 檔案的所有項目
 *
 * @param {string} filePath - JSONL 檔案路徑
 * @returns {Array} - 解析後的物件陣列
 */
function readJSONL(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l.trim());

    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (e) {
    console.error(`[JSONL] Read error: ${e.message}`);
    return [];
  }
}

/**
 * 查詢 JSONL 檔案，支援過濾和限制
 *
 * @param {string} filePath - JSONL 檔案路徑
 * @param {function} predicate - 過濾函數 (item) => boolean
 * @param {object} options - 選項 { limit, offset, sortBy, sortOrder }
 * @returns {Array} - 符合條件的物件陣列
 */
function queryJSONL(filePath, predicate = null, options = {}) {
  const { limit = 0, offset = 0, sortBy = null, sortOrder = 'desc' } = options;

  let items = readJSONL(filePath);

  // 過濾
  if (predicate && typeof predicate === 'function') {
    items = items.filter(predicate);
  }

  // 排序
  if (sortBy) {
    items.sort((a, b) => {
      const aVal = getNestedValue(a, sortBy);
      const bVal = getNestedValue(b, sortBy);

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  // 分頁
  if (offset > 0) {
    items = items.slice(offset);
  }

  if (limit > 0) {
    items = items.slice(0, limit);
  }

  return items;
}

/**
 * 更新 JSONL 檔案中的特定項目
 *
 * @param {string} filePath - JSONL 檔案路徑
 * @param {string} id - 項目 ID
 * @param {object} updates - 要更新的欄位
 * @returns {boolean} - 是否成功
 */
function updateJSONL(filePath, id, updates) {
  try {
    const items = readJSONL(filePath);
    let found = false;

    const updatedItems = items.map(item => {
      if (item.id === id) {
        found = true;
        return { ...item, ...updates };
      }
      return item;
    });

    if (!found) {
      return false;
    }

    return writeJSONL(filePath, updatedItems);
  } catch (e) {
    console.error(`[JSONL] Update error: ${e.message}`);
    return false;
  }
}

/**
 * 從 JSONL 檔案中刪除特定項目
 *
 * @param {string} filePath - JSONL 檔案路徑
 * @param {string} id - 項目 ID
 * @returns {boolean} - 是否成功
 */
function deleteJSONL(filePath, id) {
  try {
    const items = readJSONL(filePath);
    const filteredItems = items.filter(item => item.id !== id);

    if (filteredItems.length === items.length) {
      return false; // 沒找到要刪除的項目
    }

    return writeJSONL(filePath, filteredItems);
  } catch (e) {
    console.error(`[JSONL] Delete error: ${e.message}`);
    return false;
  }
}

/**
 * 覆寫整個 JSONL 檔案
 *
 * @param {string} filePath - JSONL 檔案路徑
 * @param {Array} items - 物件陣列
 * @returns {boolean} - 是否成功
 */
function writeJSONL(filePath, items) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = items.map(item => JSON.stringify(item)).join('\n') + '\n';
    fs.writeFileSync(filePath, content);
    return true;
  } catch (e) {
    console.error(`[JSONL] Write error: ${e.message}`);
    return false;
  }
}

/**
 * 根據 ID 查找單個項目
 *
 * @param {string} filePath - JSONL 檔案路徑
 * @param {string} id - 項目 ID
 * @returns {object|null} - 找到的項目或 null
 */
function findById(filePath, id) {
  const items = readJSONL(filePath);
  return items.find(item => item.id === id) || null;
}

/**
 * 計算檔案中的項目數量
 *
 * @param {string} filePath - JSONL 檔案路徑
 * @param {function} predicate - 可選的過濾函數
 * @returns {number} - 項目數量
 */
function countJSONL(filePath, predicate = null) {
  const items = readJSONL(filePath);
  if (predicate && typeof predicate === 'function') {
    return items.filter(predicate).length;
  }
  return items.length;
}

/**
 * 檢查檔案中是否存在符合條件的項目
 *
 * @param {string} filePath - JSONL 檔案路徑
 * @param {function} predicate - 過濾函數
 * @returns {boolean}
 */
function existsJSONL(filePath, predicate) {
  const items = readJSONL(filePath);
  return items.some(predicate);
}

/**
 * 獲取嵌套物件的值
 * 支援 "metadata.confidence" 這樣的路徑
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

module.exports = {
  appendJSONL,
  readJSONL,
  queryJSONL,
  updateJSONL,
  deleteJSONL,
  writeJSONL,
  findById,
  countJSONL,
  existsJSONL
};
