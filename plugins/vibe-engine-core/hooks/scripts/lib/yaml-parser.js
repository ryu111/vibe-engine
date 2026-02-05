/**
 * Simple YAML Parser - 簡單 YAML 解析器
 *
 * 支援基本 YAML 格式：
 * - 鍵值對 (key: value)
 * - 嵌套對象 (縮進)
 * - 基本類型 (string, number, boolean)
 * - 美元符號數字 ($1.00)
 *
 * 不支援：
 * - 陣列 (- item)
 * - 多行字串
 * - 複雜類型
 *
 * 對應章節：Ch6 資源管理
 */

/**
 * 解析 YAML 值
 * @param {string} value - 原始值字串
 * @returns {any} 解析後的值
 */
function parseYamlValue(value) {
  const trimmed = value.trim();

  // 美元符號數字 ($1.00)
  if (trimmed.startsWith('$')) {
    const num = parseFloat(trimmed.slice(1));
    return isNaN(num) ? trimmed : num;
  }

  // 布爾值
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // 數字
  if (!isNaN(trimmed) && trimmed !== '') {
    return trimmed.includes('.') ? parseFloat(trimmed) : parseInt(trimmed, 10);
  }

  // 字串（移除引號）
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * 設置嵌套對象的值
 * @param {object} obj - 目標對象
 * @param {string[]} path - 路徑陣列
 * @param {string} key - 鍵名
 * @param {any} value - 值
 */
function setNestedValue(obj, path, key, value) {
  let current = obj;
  for (const p of path) {
    current[p] = current[p] || {};
    current = current[p];
  }
  current[key] = value;
}

/**
 * 簡單 YAML 解析
 * @param {string} content - YAML 內容
 * @returns {object} 解析後的對象
 */
function parseSimpleYaml(content) {
  if (!content || typeof content !== 'string') {
    return {};
  }

  const result = {};
  const lines = content.split('\n');
  let currentPath = [];
  let currentIndent = 0;

  for (const line of lines) {
    // 跳過空行和註解
    if (line.trim() === '' || line.trim().startsWith('#')) {
      continue;
    }

    const indent = line.search(/\S/);
    const lineContent = line.trim();

    // 縮進減少時，調整當前路徑
    if (indent < currentIndent) {
      const levels = Math.floor(indent / 2);
      currentPath = currentPath.slice(0, levels);
    }
    currentIndent = indent;

    // 解析鍵值對
    if (lineContent.includes(':')) {
      const colonIndex = lineContent.indexOf(':');
      const key = lineContent.slice(0, colonIndex).trim();
      const value = lineContent.slice(colonIndex + 1).trim();

      if (value === '') {
        // 嵌套對象開始
        currentPath.push(key);
      } else {
        // 鍵值對
        setNestedValue(result, currentPath, key, parseYamlValue(value));
      }
    }
  }

  return result;
}

/**
 * 將對象轉換為 YAML 字串
 * @param {object} obj - 要轉換的對象
 * @param {number} indent - 當前縮進級別
 * @returns {string} YAML 字串
 */
function stringifyYaml(obj, indent = 0) {
  const lines = [];
  const spaces = '  '.repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${spaces}${key}:`);
      lines.push(stringifyYaml(value, indent + 1));
    } else {
      let strValue = value;
      if (typeof value === 'string' && value.includes(':')) {
        strValue = `"${value}"`;
      }
      lines.push(`${spaces}${key}: ${strValue}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  parseSimpleYaml,
  parseYamlValue,
  stringifyYaml
};
