/**
 * Telegram API - Telegram Bot 封裝
 *
 * 功能：
 * 1. 發送 Telegram 訊息
 * 2. 格式化通知內容
 * 3. 支援環境變數配置
 *
 * 配置方式：
 * - 環境變數：TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

const https = require('https');

/**
 * 獲取 Telegram 配置
 */
function getTelegramConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (botToken && chatId) {
    return { enabled: true, botToken, chatId };
  }

  return { enabled: false };
}

/**
 * 發送 Telegram 訊息
 * @param {string} message - 訊息內容（支援 Markdown）
 * @param {object} options - 額外選項
 * @returns {Promise<boolean>} 是否成功
 */
async function sendMessage(message, options = {}) {
  const config = getTelegramConfig();

  if (!config.enabled) {
    return false;
  }

  const { botToken, chatId } = config;

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_notification: options.silent || false
    });

    const requestOptions = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          console.error(`[Telegram] Error: ${res.statusCode} - ${data}`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[Telegram] Request error: ${err.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('[Telegram] Request timeout');
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * 生成進度條
 */
function generateProgressBar(percent, length = 10) {
  const filled = Math.round(length * (percent / 100));
  const empty = length - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

/**
 * 格式化任務完成通知
 */
function formatCompletionMessage(state, projectName = '') {
  const isCompleted = state.status === 'completed';
  const emoji = isCompleted ? '\u2705' : '\u274C';
  const statusText = isCompleted ? '\u5b8c\u6210' : '\u5931\u6557';

  const lines = [
    `${emoji} *Vibe Engine \u4efb\u52d9${statusText}*`,
    '',
    `\ud83d\udccb *Plan:* \`${state.planId}\``,
  ];

  if (projectName) {
    lines.push(`\ud83d\udcc1 *\u5c08\u6848:* ${projectName}`);
  }

  const progress = Math.round((state.completedCount / state.totalCount) * 100);
  lines.push(`\ud83d\udcca *\u9032\u5ea6:* ${state.completedCount}/${state.totalCount} (${progress}%)`);
  lines.push('');

  // 任務摘要
  if (state.phases && state.phases.length > 0) {
    lines.push('*\u4efb\u52d9\u6458\u8981:*');
    for (const phase of state.phases) {
      for (const task of phase.tasks) {
        const taskEmoji = task.status === 'completed' ? '\u2713' :
                          task.status === 'failed' ? '\u2717' : '\u25cb';
        const desc = task.description ? task.description.slice(0, 35) : 'No description';
        lines.push(`  ${taskEmoji} [${task.agent}] ${desc}...`);
      }
    }
  }

  // 耗時
  if (state.createdAt) {
    const duration = Date.now() - new Date(state.createdAt).getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    lines.push('');
    lines.push(`\u23f1 *\u8017\u6642:* ${minutes}m ${seconds}s`);
  }

  return lines.join('\n');
}

/**
 * 格式化失敗通知
 */
function formatFailureMessage(state, retryInfo = null) {
  const lines = [
    `\u274c *Vibe Engine \u4efb\u52d9\u5931\u6557*`,
    '',
    `\ud83d\udccb *Plan:* \`${state.planId}\``,
    `\ud83d\udcca *\u9032\u5ea6:* ${state.completedCount}/${state.totalCount}`,
  ];

  if (retryInfo) {
    lines.push(`\ud83d\udd01 *\u91cd\u8a66:* ${retryInfo.current}/${retryInfo.max} (\u5df2\u9054\u4e0a\u9650)`);
  }

  // 未完成任務
  const pendingTasks = [];
  if (state.phases) {
    for (const phase of state.phases) {
      for (const task of phase.tasks) {
        if (task.status !== 'completed') {
          pendingTasks.push(task);
        }
      }
    }
  }

  if (pendingTasks.length > 0) {
    lines.push('');
    lines.push('*\u672a\u5b8c\u6210:*');
    for (const task of pendingTasks.slice(0, 5)) {
      const taskEmoji = task.status === 'failed' ? '\u2717' : '\u25cb';
      const desc = task.description ? task.description.slice(0, 35) : 'No description';
      lines.push(`  ${taskEmoji} [${task.agent}] ${desc}...`);
    }
    if (pendingTasks.length > 5) {
      lines.push(`  ... \u9084\u6709 ${pendingTasks.length - 5} \u500b`);
    }
  }

  lines.push('');
  lines.push('\u26a0\ufe0f *\u9700\u8981\u4eba\u5de5\u4ecb\u5165*');

  return lines.join('\n');
}

/**
 * 格式化進度更新（靜默通知）
 */
function formatProgressMessage(state, currentTask = null) {
  const progress = Math.round((state.completedCount / state.totalCount) * 100);
  const progressBar = generateProgressBar(progress);

  const lines = [
    `\ud83d\udd04 *Vibe Engine \u9032\u5ea6*`,
    '',
    `\`${state.planId}\``,
    `${progressBar} ${progress}%`,
    `${state.completedCount}/${state.totalCount} \u5b8c\u6210`
  ];

  if (currentTask) {
    lines.push('');
    lines.push(`\ud83c\udfaf [${currentTask.agent}] ${currentTask.description?.slice(0, 40)}...`);
  }

  return lines.join('\n');
}

module.exports = {
  getTelegramConfig,
  sendMessage,
  formatCompletionMessage,
  formatFailureMessage,
  formatProgressMessage,
  generateProgressBar
};
