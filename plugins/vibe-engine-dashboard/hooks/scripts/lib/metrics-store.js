/**
 * Metrics Store - 指標存儲管理
 *
 * 功能：
 * 1. 存儲工具執行指標
 * 2. 計算 session 統計
 * 3. 提供查詢接口
 *
 * 對應章節：Ch7 可觀測性
 */

const fs = require('fs');
const path = require('path');

const VIBE_ENGINE_DIR = '.vibe-engine';
const METRICS_DIR = 'metrics';
const SESSION_FILE = 'session.jsonl';

/**
 * 獲取 .vibe-engine 目錄路徑
 * @param {string} projectRoot - 專案根目錄
 * @returns {string}
 */
function getVibeEngineDir(projectRoot) {
  return path.join(projectRoot, VIBE_ENGINE_DIR);
}

/**
 * 確保 metrics 目錄存在
 * @param {string} projectRoot - 專案根目錄
 * @returns {string} - metrics 目錄路徑
 */
function ensureMetricsDir(projectRoot) {
  const vibeDir = getVibeEngineDir(projectRoot);
  const metricsDir = path.join(vibeDir, METRICS_DIR);

  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }

  return metricsDir;
}

/**
 * 讀取 JSONL 檔案
 * @param {string} filePath - 檔案路徑
 * @returns {Array}
 */
function readJSONL(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

/**
 * 追加到 JSONL 檔案
 * @param {string} filePath - 檔案路徑
 * @param {object} data - 數據
 */
function appendJSONL(filePath, data) {
  const line = JSON.stringify(data) + '\n';
  fs.appendFileSync(filePath, line, 'utf8');
}

/**
 * MetricsStore 類別
 */
class MetricsStore {
  constructor(projectRoot = null) {
    this.projectRoot = projectRoot || process.cwd();
    this.metricsDir = ensureMetricsDir(this.projectRoot);
    this.sessionFile = path.join(this.metricsDir, SESSION_FILE);
  }

  /**
   * 記錄指標
   * @param {object} metric - 指標數據
   */
  record(metric) {
    const entry = {
      timestamp: new Date().toISOString(),
      ...metric
    };
    appendJSONL(this.sessionFile, entry);
    return entry;
  }

  /**
   * 獲取 session 所有指標
   * @returns {Array}
   */
  getSessionMetrics() {
    return readJSONL(this.sessionFile);
  }

  /**
   * 獲取統計摘要
   * @returns {object}
   */
  getStats() {
    const metrics = this.getSessionMetrics();

    if (metrics.length === 0) {
      return {
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        byTool: {},
        avgDuration: 0,
        totalDuration: 0,
        startTime: null,
        endTime: null
      };
    }

    // 按工具分組
    const byTool = {};
    let successCount = 0;
    let failureCount = 0;
    let totalDuration = 0;

    for (const m of metrics) {
      const tool = m.tool || 'unknown';

      if (!byTool[tool]) {
        byTool[tool] = {
          count: 0,
          success: 0,
          failure: 0,
          totalDuration: 0,
          avgDuration: 0
        };
      }

      byTool[tool].count++;

      if (m.success) {
        byTool[tool].success++;
        successCount++;
      } else {
        byTool[tool].failure++;
        failureCount++;
      }

      if (m.duration_ms) {
        byTool[tool].totalDuration += m.duration_ms;
        totalDuration += m.duration_ms;
      }
    }

    // 計算平均值
    for (const tool in byTool) {
      byTool[tool].avgDuration = byTool[tool].count > 0
        ? Math.round(byTool[tool].totalDuration / byTool[tool].count)
        : 0;
    }

    const startTime = metrics[0]?.timestamp;
    const endTime = metrics[metrics.length - 1]?.timestamp;

    return {
      totalCalls: metrics.length,
      successCount,
      failureCount,
      successRate: metrics.length > 0
        ? Math.round((successCount / metrics.length) * 100)
        : 0,
      byTool,
      avgDuration: metrics.length > 0
        ? Math.round(totalDuration / metrics.length)
        : 0,
      totalDuration,
      startTime,
      endTime
    };
  }

  /**
   * 獲取最近的指標
   * @param {number} count - 數量
   * @returns {Array}
   */
  getRecent(count = 5) {
    const metrics = this.getSessionMetrics();
    return metrics.slice(-count);
  }

  /**
   * 清除 session 指標
   */
  clearSession() {
    if (fs.existsSync(this.sessionFile)) {
      fs.unlinkSync(this.sessionFile);
    }
  }

  /**
   * 獲取錯誤列表
   * @returns {Array}
   */
  getErrors() {
    const metrics = this.getSessionMetrics();
    return metrics.filter(m => !m.success);
  }
}

module.exports = {
  MetricsStore,
  getVibeEngineDir,
  ensureMetricsDir,
  readJSONL,
  appendJSONL
};
