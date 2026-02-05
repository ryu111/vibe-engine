/**
 * Simple YAML Parser - 簡單 YAML 解析器
 *
 * 支援基本 YAML 格式：
 * - 鍵值對 (key: value)
 * - 嵌套對象 (縮進)
 * - 基本類型 (string, number, boolean)
 * - 美元符號數字 ($1.00)
 * - 陣列 (- item)
 * - 物件陣列 (- key: value)
 *
 * 不支援：
 * - 多行字串
 * - 流式陣列 [a, b, c]
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
 * 獲取或創建嵌套路徑的容器
 */
function getOrCreateContainer(obj, path) {
  let current = obj;
  for (const p of path) {
    if (typeof p === 'number') {
      // 陣列索引
      current = current[p];
    } else {
      current = current[p];
    }
  }
  return current;
}

/**
 * 在指定路徑設置值（支援陣列）
 */
function setValueAtPath(obj, path, key, value) {
  let current = obj;
  for (const p of path) {
    current = current[p];
  }
  if (key !== null) {
    current[key] = value;
  }
}

/**
 * 簡單 YAML 解析（支援陣列）
 * @param {string} content - YAML 內容
 * @returns {object} 解析後的對象
 */
function parseSimpleYaml(content) {
  if (!content || typeof content !== 'string') {
    return {};
  }

  const result = {};
  const lines = content.split('\n');

  // 追蹤結構：[{ indent, key, isArray, container }]
  const stack = [{ indent: -2, key: null, isArray: false, container: result }];

  for (const line of lines) {
    // 跳過空行和註解
    if (line.trim() === '' || line.trim().startsWith('#')) {
      continue;
    }

    const indent = line.search(/\S/);
    const lineContent = line.trim();

    // 根據縮進調整 stack
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    // 處理陣列項 (- ...)
    if (lineContent.startsWith('- ')) {
      const itemContent = lineContent.slice(2).trim();

      // 確保父容器是陣列
      if (!Array.isArray(parent.container)) {
        continue; // 跳過格式錯誤
      }

      // 檢查是否為 JSON 陣列 (- ["item1", "item2"])
      if (itemContent.startsWith('[') && itemContent.endsWith(']')) {
        try {
          const jsonArray = JSON.parse(itemContent);
          parent.container.push(jsonArray);
          continue;
        } catch {
          // 不是有效 JSON，繼續正常處理
        }
      }

      // 檢查是否為 - key: value 格式
      if (itemContent.includes(':')) {
        const colonIndex = itemContent.indexOf(':');
        const key = itemContent.slice(0, colonIndex).trim();
        const value = itemContent.slice(colonIndex + 1).trim();

        const newItem = {};
        if (value === '' || value === '[]') {
          // 物件陣列項開始，或空陣列
          newItem[key] = value === '[]' ? [] : undefined;
        } else {
          newItem[key] = parseYamlValue(value);
        }

        parent.container.push(newItem);
        stack.push({ indent, key, isArray: false, container: newItem });
      } else {
        // 簡單值陣列項
        parent.container.push(parseYamlValue(itemContent));
      }
    }
    // 處理鍵值對
    else if (lineContent.includes(':')) {
      const colonIndex = lineContent.indexOf(':');
      const key = lineContent.slice(0, colonIndex).trim();
      const value = lineContent.slice(colonIndex + 1).trim();

      if (value === '') {
        // 嵌套結構開始 - 檢查下一行是否為陣列
        const nextLineIndex = lines.indexOf(line) + 1;
        const nextLine = lines.slice(nextLineIndex).find(l => l.trim() !== '' && !l.trim().startsWith('#'));
        const isNextArray = nextLine && nextLine.trim().startsWith('- ');

        if (isNextArray) {
          parent.container[key] = [];
          stack.push({ indent, key, isArray: true, container: parent.container[key] });
        } else {
          parent.container[key] = {};
          stack.push({ indent, key, isArray: false, container: parent.container[key] });
        }
      } else if (value === '[]') {
        // 空陣列
        parent.container[key] = [];
      } else {
        // 普通鍵值對
        parent.container[key] = parseYamlValue(value);
      }
    }
  }

  return result;
}

/**
 * 將對象轉換為 YAML 字串（簡單版，不支援陣列）
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

/**
 * 將 JSON 物件轉換為 YAML 字串（完整版，支援陣列）
 * @param {object} obj - 要轉換的對象
 * @param {number} indent - 當前縮進級別
 * @returns {string} YAML 字串
 */
function jsonToYaml(obj, indent = 0) {
  const spaces = '  '.repeat(indent);
  let yaml = '';

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          if (Array.isArray(item)) {
            // 巢狀陣列（如 parallel_groups）
            yaml += `${spaces}  - [${item.map(i => JSON.stringify(i)).join(', ')}]\n`;
          } else {
            // 物件陣列
            const entries = Object.entries(item);
            yaml += `${spaces}  - ${entries[0][0]}: ${JSON.stringify(entries[0][1])}\n`;
            for (let i = 1; i < entries.length; i++) {
              const [k, v] = entries[i];
              if (Array.isArray(v)) {
                if (v.length === 0) {
                  yaml += `${spaces}    ${k}: []\n`;
                } else {
                  yaml += `${spaces}    ${k}:\n`;
                  for (const vi of v) {
                    yaml += `${spaces}      - ${JSON.stringify(vi)}\n`;
                  }
                }
              } else {
                yaml += `${spaces}    ${k}: ${JSON.stringify(v)}\n`;
              }
            }
          }
        } else {
          yaml += `${spaces}  - ${JSON.stringify(item)}\n`;
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      yaml += `${spaces}${key}:\n`;
      yaml += jsonToYaml(value, indent + 1);
    } else {
      yaml += `${spaces}${key}: ${JSON.stringify(value)}\n`;
    }
  }

  return yaml;
}

module.exports = {
  parseSimpleYaml,
  parseYamlValue,
  stringifyYaml,
  jsonToYaml
};
