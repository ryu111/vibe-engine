/**
 * Report Formatter - 統一報告格式化模組
 *
 * 提供所有 hook 腳本共用的邊框報告格式化：
 * - createBoxedReport() - 建立邊框報告
 * - formatKeyValue() - 格式化鍵值對
 * - formatTable() - 格式化表格
 * - formatProgressBar() - 格式化進度條
 *
 * 對應章節：Ch7 可觀測性
 */

const DEFAULT_BOX_WIDTH = 52;

/**
 * 建立邊框報告
 * @param {string} title - 報告標題
 * @param {Array<object>} sections - 區塊配置 [{ title, lines }]
 * @param {number} width - 邊框寬度
 * @returns {string} 格式化的報告
 */
function createBoxedReport(title, sections, width = DEFAULT_BOX_WIDTH) {
  const lines = [];
  const innerWidth = width - 2;

  // 頂部邊框
  lines.push('╔' + '═'.repeat(innerWidth) + '╗');

  // 標題
  lines.push(boxLine(centerText(title, innerWidth), width));
  lines.push('╠' + '═'.repeat(innerWidth) + '╣');

  // 區塊
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    // 區塊標題
    if (section.title) {
      lines.push(boxLine(section.title, width));
    }

    // 區塊內容
    for (const line of section.lines || []) {
      lines.push(boxLine(line, width));
    }

    // 區塊分隔（最後一個不加）
    if (i < sections.length - 1) {
      lines.push('╠' + '═'.repeat(innerWidth) + '╣');
    }
  }

  // 底部邊框
  lines.push('╚' + '═'.repeat(innerWidth) + '╝');

  return lines.join('\n');
}

/**
 * 建立單行邊框內容
 * @param {string} content - 內容
 * @param {number} width - 總寬度
 * @returns {string} 格式化的行
 */
function boxLine(content, width = DEFAULT_BOX_WIDTH) {
  const innerWidth = width - 4;
  const truncated = content.slice(0, innerWidth);
  return '║ ' + truncated.padEnd(innerWidth) + ' ║';
}

/**
 * 置中文字
 * @param {string} text - 文字
 * @param {number} width - 寬度
 * @returns {string} 置中後的文字
 */
function centerText(text, width) {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
}

/**
 * 格式化鍵值對
 * @param {string} key - 鍵
 * @param {string} value - 值
 * @param {number} keyWidth - 鍵的寬度
 * @returns {string} 格式化的鍵值對
 */
function formatKeyValue(key, value, keyWidth = 12) {
  return `${key.padEnd(keyWidth)}: ${value}`;
}

/**
 * 格式化樹狀列表
 * @param {Array<{label: string, value: string, isLast?: boolean}>} items - 項目
 * @returns {Array<string>} 格式化的行
 */
function formatTree(items) {
  return items.map((item, i) => {
    const isLast = item.isLast ?? (i === items.length - 1);
    const prefix = isLast ? '└─' : '├─';
    return `${prefix} ${item.label}: ${item.value}`;
  });
}

/**
 * 格式化進度條
 * @param {number} percentage - 百分比 (0-100)
 * @param {number} width - 進度條寬度
 * @returns {string} 格式化的進度條
 */
function formatProgressBar(percentage, width = 20) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percentage}%`;
}

/**
 * 格式化狀態圖示
 * @param {string} status - 狀態 ('pass' | 'fail' | 'warning' | 'info')
 * @returns {string} 狀態圖示
 */
function formatStatusIcon(status) {
  const icons = {
    pass: '✅',
    fail: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    normal: '✅',
    critical: '🛑',
    exceeded: '🛑'
  };
  return icons[status] || '•';
}

/**
 * 格式化表格
 * @param {Array<string>} headers - 表頭
 * @param {Array<Array<string>>} rows - 資料行
 * @param {Array<number>} colWidths - 欄位寬度
 * @returns {Array<string>} 格式化的表格行
 */
function formatTable(headers, rows, colWidths = null) {
  // 自動計算欄位寬度
  if (!colWidths) {
    colWidths = headers.map((h, i) => {
      const maxRowWidth = Math.max(...rows.map(r => (r[i] || '').toString().length));
      return Math.max(h.length, maxRowWidth);
    });
  }

  const lines = [];

  // 表頭
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
  lines.push(headerLine);

  // 分隔線
  const separator = colWidths.map(w => '-'.repeat(w)).join('-+-');
  lines.push(separator);

  // 資料行
  for (const row of rows) {
    const rowLine = row.map((cell, i) => (cell || '').toString().padEnd(colWidths[i])).join(' | ');
    lines.push(rowLine);
  }

  return lines;
}

/**
 * 建立簡單的狀態報告
 * @param {string} title - 標題
 * @param {string} status - 狀態
 * @param {object} metrics - 指標對象
 * @returns {string} 格式化的報告
 */
function createStatusReport(title, status, metrics) {
  const sections = [
    {
      title: null,
      lines: [
        `${formatStatusIcon(status)} Status: ${status.toUpperCase()}`,
        ''
      ]
    },
    {
      title: 'Metrics',
      lines: Object.entries(metrics).map(([k, v]) =>
        formatKeyValue(k, String(v))
      )
    }
  ];

  return createBoxedReport(title, sections);
}

module.exports = {
  createBoxedReport,
  boxLine,
  centerText,
  formatKeyValue,
  formatTree,
  formatProgressBar,
  formatStatusIcon,
  formatTable,
  createStatusReport,
  DEFAULT_BOX_WIDTH
};
