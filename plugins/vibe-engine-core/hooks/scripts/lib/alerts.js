/**
 * Alert Manager - 警報管理模組
 *
 * 統一管理預算警報邏輯：
 * - 警報閾值配置
 * - 警報等級判斷
 * - 警報訊息格式化
 *
 * 對應章節：Ch6 資源管理
 */

/**
 * 警報閾值（使用率百分比）
 */
const ALERT_THRESHOLDS = {
  warning: 0.70,    // 70%
  critical: 0.90,   // 90%
  exceeded: 1.00    // 100%
};

/**
 * 警報配置（配置驅動，減少 if-else）
 */
const ALERT_CONFIG = {
  exceeded: {
    icon: '🛑',
    action: 'block',
    message: '預算已用盡，請增加預算或結束任務',
    forceMessage: '⛔ MANDATORY STOP: Budget exhausted. ⛔ BLOCK all further operations until budget reset or user approval.'
  },
  critical: {
    icon: '⚠️',
    action: 'warn',
    message: '預算即將用盡，建議創建 checkpoint 並完成當前步驟',
    forceMessage: '⛔ CRITICAL: Budget nearly exhausted. MUST create checkpoint immediately. Consider stopping or downgrading model.'
  },
  warning: {
    icon: '⚡',
    action: 'notify',
    message: '預算使用超過 70%，考慮使用更經濟的模型',
    forceMessage: null
  },
  normal: {
    icon: '✅',
    action: 'none',
    message: '預算充足',
    forceMessage: null
  }
};

/**
 * 根據使用率判斷警報等級
 * @param {number} usage - 使用率 (0-1+)
 * @returns {string} 警報等級 ('exceeded' | 'critical' | 'warning' | 'normal')
 */
function getAlertLevelFromUsage(usage) {
  if (usage >= ALERT_THRESHOLDS.exceeded) return 'exceeded';
  if (usage >= ALERT_THRESHOLDS.critical) return 'critical';
  if (usage >= ALERT_THRESHOLDS.warning) return 'warning';
  return 'normal';
}

/**
 * 根據預算使用情況獲取完整警報資訊
 * @param {object} budgetUsage - 預算使用情況 { overall, breakdown }
 * @returns {object} 警報資訊 { level, icon, message, action, forceMessage }
 */
function getAlertLevel(budgetUsage) {
  const usage = budgetUsage.overall;
  const level = getAlertLevelFromUsage(usage);
  const config = ALERT_CONFIG[level];

  return {
    level,
    icon: config.icon,
    message: config.message,
    action: config.action,
    forceMessage: config.forceMessage
  };
}

/**
 * 判斷是否應該阻止操作
 * @param {object} alert - 警報資訊
 * @returns {boolean}
 */
function shouldBlock(alert) {
  return alert.action === 'block';
}

/**
 * 判斷是否應該警告
 * @param {object} alert - 警報資訊
 * @returns {boolean}
 */
function shouldWarn(alert) {
  return alert.action === 'warn';
}

/**
 * 判斷是否超過指定閾值
 * @param {number} usage - 使用率
 * @param {string} threshold - 閾值名稱 ('warning' | 'critical' | 'exceeded')
 * @returns {boolean}
 */
function isAboveThreshold(usage, threshold) {
  return usage >= ALERT_THRESHOLDS[threshold];
}

/**
 * 格式化警報系統訊息
 * @param {object} alert - 警報資訊
 * @param {number} usagePercent - 使用率百分比
 * @returns {string|null} 系統訊息或 null
 */
function formatAlertSystemMessage(alert, usagePercent) {
  if (alert.forceMessage) {
    return alert.forceMessage.replace('exhausted', `exhausted (${usagePercent}%)`);
  }

  if (alert.level !== 'normal') {
    return `[Budget Tracker] ${alert.icon} ${alert.message} (${usagePercent}%)`;
  }

  return null;
}

module.exports = {
  ALERT_THRESHOLDS,
  ALERT_CONFIG,
  getAlertLevel,
  getAlertLevelFromUsage,
  shouldBlock,
  shouldWarn,
  isAboveThreshold,
  formatAlertSystemMessage
};
