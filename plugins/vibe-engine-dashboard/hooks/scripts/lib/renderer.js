/**
 * TUI Renderer - 終端 UI 渲染器
 *
 * 功能：
 * 1. 渲染 Dashboard 面板
 * 2. 渲染 Metrics 摘要
 * 3. 繪製進度條和狀態圖示
 *
 * 對應章節：Ch7 可觀測性 - TUI Dashboard
 */

// Box Drawing 字符
const BOX = {
  TL: '╔', TR: '╗', BL: '╚', BR: '╝',
  H: '═', V: '║',
  LT: '╠', RT: '╣', TT: '╦', BT: '╩',
  CROSS: '╬',
  // 細線
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│',
  lt: '├', rt: '┤', tt: '┬', bt: '┴'
};

// 狀態圖示
const STATUS = {
  DONE: '🟢',
  WORK: '🟡',
  WAIT: '⚪',
  PEND: '⚫',
  OK: '✓',
  FAIL: '✗',
  WARN: '⚠️'
};

// 預設寬度
const DEFAULT_WIDTH = 65;

/**
 * 填充字串到指定長度
 * @param {string} str - 字串
 * @param {number} width - 寬度
 * @param {string} align - 對齊方式 (left/right/center)
 * @returns {string}
 */
function pad(str, width, align = 'left') {
  // 計算顯示寬度（考慮 emoji）
  const displayWidth = getDisplayWidth(str);
  const padWidth = Math.max(0, width - displayWidth);

  if (align === 'right') {
    return ' '.repeat(padWidth) + str;
  } else if (align === 'center') {
    const left = Math.floor(padWidth / 2);
    const right = padWidth - left;
    return ' '.repeat(left) + str + ' '.repeat(right);
  }
  return str + ' '.repeat(padWidth);
}

/**
 * 計算字串顯示寬度（emoji 佔 2 格）
 * @param {string} str - 字串
 * @returns {number}
 */
function getDisplayWidth(str) {
  let width = 0;
  for (const char of str) {
    const code = char.codePointAt(0);
    // Emoji 和中文字符佔 2 格
    if (code > 0x1F300 || (code >= 0x4E00 && code <= 0x9FFF)) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * 繪製水平線
 * @param {number} width - 寬度
 * @param {string} left - 左端字符
 * @param {string} right - 右端字符
 * @param {string} fill - 填充字符
 * @returns {string}
 */
function drawLine(width, left, right, fill = BOX.H) {
  return left + fill.repeat(width - 2) + right;
}

/**
 * 繪製文字行
 * @param {string} text - 文字
 * @param {number} width - 寬度
 * @returns {string}
 */
function drawTextLine(text, width) {
  const innerWidth = width - 4; // 扣掉兩邊的 ║ 和空格
  return BOX.V + ' ' + pad(text, innerWidth) + ' ' + BOX.V;
}

/**
 * 繪製進度條
 * @param {number} current - 當前值
 * @param {number} total - 總值
 * @param {number} width - 進度條寬度
 * @returns {string}
 */
function drawProgressBar(current, total, width = 20) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty) + ` ${percent}%`;
}

/**
 * 格式化時間
 * @param {number} ms - 毫秒
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * 格式化時間戳為 HH:MM
 * @param {string} timestamp - ISO 時間戳
 * @returns {string}
 */
function formatTime(timestamp) {
  if (!timestamp) return '--:--';
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${mins}`;
}

/**
 * 渲染 Dashboard 面板
 * @param {object} data - Dashboard 數據
 * @returns {string}
 */
function renderDashboard(data) {
  const width = DEFAULT_WIDTH;
  const lines = [];

  // === Header ===
  lines.push(drawLine(width, BOX.TL, BOX.TR));
  const title = `VIBE ENGINE DASHBOARD`;
  const version = `v${data.version || '0.6.4'}  ${data.autonomyLevel || 'L2'}`;
  const headerText = pad(title, width - 4 - version.length - 2) + version;
  lines.push(drawTextLine(headerText, width));

  // === Task Progress ===
  lines.push(drawLine(width, BOX.LT, BOX.RT));
  const task = data.currentTask || 'No active task';
  lines.push(drawTextLine(`📋 Task: ${task.slice(0, 45)}`, width));

  const progress = data.progress || 0;
  const progressBar = '━'.repeat(Math.round(progress / 5)) +
                      '─'.repeat(20 - Math.round(progress / 5)) +
                      ` ${progress}%`;
  lines.push(drawTextLine(progressBar, width));

  // === Three Columns (簡化為列表) ===
  lines.push(drawLine(width, BOX.LT, BOX.RT));

  // Agent Status
  lines.push(drawTextLine('Agent Status', width));
  lines.push(drawTextLine('───────────', width));

  const agents = data.agents || [
    { name: 'Architect', status: 'Done' },
    { name: 'Developer', status: 'Work' },
    { name: 'Tester', status: 'Wait' },
    { name: 'Reviewer', status: 'Pend' }
  ];

  for (const agent of agents.slice(0, 4)) {
    const icon = STATUS[agent.status.toUpperCase()] || STATUS.PEND;
    const line = `${icon} ${pad(agent.name, 10)} ${agent.status}`;
    lines.push(drawTextLine(line, width));
  }

  // Resources
  lines.push(drawTextLine('', width));
  lines.push(drawTextLine('Resources', width));
  lines.push(drawTextLine('─────────', width));

  const resources = data.resources || { tokens: { used: 0, limit: 100000 }, cost: { used: 0, limit: 1 } };
  const tokenBar = drawProgressBar(resources.tokens.used, resources.tokens.limit, 15);
  const costBar = drawProgressBar(resources.cost.used * 100, resources.cost.limit * 100, 15);

  lines.push(drawTextLine(`Tokens: ${Math.round(resources.tokens.used / 1000)}K/${Math.round(resources.tokens.limit / 1000)}K`, width));
  lines.push(drawTextLine(tokenBar, width));
  lines.push(drawTextLine(`Cost: $${resources.cost.used.toFixed(2)}/$${resources.cost.limit.toFixed(2)}`, width));
  lines.push(drawTextLine(costBar, width));

  // Recent Activity
  lines.push(drawTextLine('', width));
  lines.push(drawTextLine('Recent Activity', width));
  lines.push(drawTextLine('───────────────', width));

  const logs = data.recentLogs || [];
  for (const log of logs.slice(0, 4)) {
    const time = formatTime(log.timestamp);
    const status = log.success ? STATUS.OK : STATUS.FAIL;
    const duration = formatDuration(log.duration_ms || 0);
    const line = `[${time}] ${log.tool || 'unknown'} ${status} ${duration}`;
    lines.push(drawTextLine(line, width));
  }

  if (logs.length === 0) {
    lines.push(drawTextLine('(no recent activity)', width));
  }

  // === Footer ===
  lines.push(drawLine(width, BOX.LT, BOX.RT));
  const memoryCount = data.memoryCount || 0;
  const toolCount = data.toolCount || 0;
  const contextPercent = data.contextPercent || 0;
  const systemStatus = data.systemOk ? `${STATUS.DONE} System OK` : `${STATUS.FAIL} System Error`;
  const footer = `${systemStatus} │ Context: ${contextPercent}% │ Memory: ${memoryCount} │ Tools: ${toolCount}`;
  lines.push(drawTextLine(footer, width));
  lines.push(drawLine(width, BOX.BL, BOX.BR));

  return lines.join('\n');
}

/**
 * 渲染 Metrics 摘要
 * @param {object} stats - 統計數據
 * @param {object} options - 選項
 * @returns {string}
 */
function renderMetrics(stats, options = {}) {
  const width = 44;
  const lines = [];

  // Header
  lines.push(drawLine(width, BOX.TL, BOX.TR));
  const title = options.detail ? 'Session Metrics (Detail)' : 'Session Metrics';
  lines.push(drawTextLine(pad(title, width - 4, 'center'), width));
  lines.push(drawLine(width, BOX.LT, BOX.RT));

  // Duration
  const duration = stats.startTime && stats.endTime
    ? formatDuration(new Date(stats.endTime) - new Date(stats.startTime))
    : 'N/A';
  lines.push(drawTextLine(`Duration: ${duration}`, width));
  lines.push(drawTextLine(`Tool Calls: ${stats.totalCalls}`, width));

  // Tool breakdown
  const sortedTools = Object.entries(stats.byTool || {})
    .sort((a, b) => b[1].count - a[1].count);

  for (const [tool, data] of sortedTools.slice(0, 6)) {
    const avg = formatDuration(data.avgDuration);
    lines.push(drawTextLine(`  - ${tool}: ${data.count} (avg ${avg})`, width));
  }

  lines.push(drawTextLine('', width));

  // Success rate
  const successRate = `${stats.successRate}% (${stats.successCount}/${stats.totalCalls})`;
  lines.push(drawTextLine(`Success Rate: ${successRate}`, width));

  const errorCount = stats.failureCount || 0;
  lines.push(drawTextLine(`Errors: ${errorCount}`, width));

  lines.push(drawTextLine('', width));

  // Budget (if provided)
  if (stats.budget) {
    const tokenUsage = `${Math.round(stats.budget.tokens_used / 1000).toLocaleString()} / ${Math.round(stats.budget.tokens_limit / 1000).toLocaleString()}`;
    const tokenPercent = Math.round((stats.budget.tokens_used / stats.budget.tokens_limit) * 100);
    lines.push(drawTextLine(`Token Usage: ${tokenUsage} (${tokenPercent}%)`, width));

    const costUsage = `$${stats.budget.cost_used?.toFixed(2) || '0.00'} / $${stats.budget.cost_limit?.toFixed(2) || '1.00'}`;
    const costPercent = Math.round(((stats.budget.cost_used || 0) / (stats.budget.cost_limit || 1)) * 100);
    lines.push(drawTextLine(`Cost: ${costUsage} (${costPercent}%)`, width));
  }

  // Footer
  lines.push(drawLine(width, BOX.BL, BOX.BR));

  return lines.join('\n');
}

module.exports = {
  renderDashboard,
  renderMetrics,
  drawProgressBar,
  formatDuration,
  formatTime,
  pad,
  BOX,
  STATUS
};
