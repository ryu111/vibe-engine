#!/usr/bin/env node
/**
 * Notify On Complete - Stop Hook
 *
 * 功能：
 * 1. 在 Stop hook 中檢測任務完成狀態
 * 2. 發送 Telegram 通知
 * 3. 支援完成/失敗兩種通知類型
 *
 * 觸發點：
 * - Stop hook（在 vibe-engine-core 之後執行）
 *
 * 依賴：
 * - vibe-engine-core 的 .vibe-engine/routing-state.json
 */

const fs = require('fs');
const path = require('path');
const {
  getTelegramConfig,
  sendMessage,
  formatCompletionMessage,
  formatFailureMessage
} = require('./lib/telegram');

// ============================================================
// 配置
// ============================================================

const ROUTING_STATE_FILE = 'routing-state.json';

/**
 * 獲取專案根目錄
 */
function getProjectRoot() {
  if (process.env.CLAUDE_PROJECT_ROOT) {
    return process.env.CLAUDE_PROJECT_ROOT;
  }

  const cwd = process.cwd();
  let current = cwd;

  while (current !== '/') {
    const markers = [
      path.join(current, '.git'),
      path.join(current, '.vibe-engine'),
      path.join(current, 'package.json')
    ];

    if (markers.some(m => fs.existsSync(m))) {
      return current;
    }
    current = path.dirname(current);
  }

  return cwd;
}

/**
 * 讀取路由狀態
 */
function loadRoutingState(projectRoot) {
  const statePath = path.join(projectRoot, '.vibe-engine', ROUTING_STATE_FILE);

  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(statePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

/**
 * 獲取專案名稱
 */
function getProjectName(projectRoot) {
  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.name || path.basename(projectRoot);
    }
  } catch (e) {
    // 忽略
  }
  return path.basename(projectRoot);
}

/**
 * 檢查是否已經通知過此計劃
 * 避免重複通知
 */
function hasNotified(projectRoot, planId) {
  const notifiedPath = path.join(projectRoot, '.vibe-engine', 'notified-plans.json');

  try {
    if (fs.existsSync(notifiedPath)) {
      const notified = JSON.parse(fs.readFileSync(notifiedPath, 'utf8'));
      return notified.includes(planId);
    }
  } catch (e) {
    // 忽略
  }

  return false;
}

/**
 * 標記計劃已通知
 */
function markNotified(projectRoot, planId) {
  const notifiedPath = path.join(projectRoot, '.vibe-engine', 'notified-plans.json');

  try {
    let notified = [];
    if (fs.existsSync(notifiedPath)) {
      notified = JSON.parse(fs.readFileSync(notifiedPath, 'utf8'));
    }

    if (!notified.includes(planId)) {
      notified.push(planId);
      // 只保留最近 50 個
      if (notified.length > 50) {
        notified = notified.slice(-50);
      }
      fs.writeFileSync(notifiedPath, JSON.stringify(notified, null, 2));
    }
  } catch (e) {
    // 忽略寫入錯誤
  }
}

/**
 * 讀取 stdin（hook input）
 */
async function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }

    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(input));
      } catch (e) {
        resolve(null);
      }
    });

    // 超時
    setTimeout(() => resolve(null), 1000);
  });
}

/**
 * 主流程
 */
async function main() {
  // 檢查是否配置了 Telegram
  const config = getTelegramConfig();
  if (!config.enabled) {
    // 未配置，靜默退出
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));
    return;
  }

  // 讀取 hook input
  const hookInput = await readStdin();
  const projectRoot = hookInput?.cwd || getProjectRoot();

  // 讀取路由狀態
  const state = loadRoutingState(projectRoot);

  if (!state) {
    // 沒有路由狀態，可能不是 vibe-engine 任務
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));
    return;
  }

  // 檢查是否需要通知
  const shouldNotify = state.status === 'completed' || state.status === 'failed';

  if (!shouldNotify) {
    // 任務還在進行中，不通知
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));
    return;
  }

  // 檢查是否已經通知過
  if (hasNotified(projectRoot, state.planId)) {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));
    return;
  }

  // 發送通知
  const projectName = getProjectName(projectRoot);
  let message;
  let success;

  if (state.status === 'completed') {
    message = formatCompletionMessage(state, projectName);
    success = await sendMessage(message);
  } else {
    // 失敗
    const retryInfo = state.currentRetry !== undefined ? {
      current: state.currentRetry,
      max: state.maxRetries || 3
    } : null;
    message = formatFailureMessage(state, retryInfo);
    success = await sendMessage(message);
  }

  // 標記已通知
  if (success) {
    markNotified(projectRoot, state.planId);
  }

  // 輸出 hook 結果
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      notificationSent: success,
      planId: state.planId,
      status: state.status
    }
  }));
}

// 執行
main().catch(err => {
  console.error('[Notify] Error:', err.message);
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    error: err.message
  }));
});
