/**
 * Checkpoint Manager - 狀態快照管理模組
 *
 * 提供 Checkpoint 的創建、驗證、列出、清理功能：
 * - 創建快照（記錄 Git SHA、檔案數、時間戳）
 * - 驗證快照（比較當前與快照的差異）
 * - 列出快照
 * - 清理舊快照
 *
 * 對應章節：Ch3 狀態管理
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { now, generateId } = require('./common');
const { appendJSONL, readJSONL } = require('./jsonl');

/**
 * CheckpointManager 類別
 */
class CheckpointManager {
  constructor(checkpointsDir, logFile = null) {
    this.checkpointsDir = checkpointsDir;
    this.logFile = logFile || path.join(path.dirname(checkpointsDir), 'checkpoints.log');

    if (!fs.existsSync(checkpointsDir)) {
      fs.mkdirSync(checkpointsDir, { recursive: true });
    }
  }

  /**
   * 創建新的 Checkpoint
   *
   * @param {string} name - Checkpoint 名稱
   * @param {object} options - { description, includeDiff }
   * @returns {object} - { success, checkpoint, error }
   */
  create(name, options = {}) {
    const { description = '', includeDiff = false } = options;

    // 驗證名稱
    if (!name || !/^[\w-]+$/.test(name)) {
      return { success: false, error: 'Invalid checkpoint name (use alphanumeric and hyphens only)' };
    }

    const checkpointDir = path.join(this.checkpointsDir, name);

    // 檢查是否已存在
    if (fs.existsSync(checkpointDir)) {
      return { success: false, error: `Checkpoint '${name}' already exists` };
    }

    try {
      // 創建目錄
      fs.mkdirSync(checkpointDir, { recursive: true });

      // 收集指標
      const metrics = this._collectMetrics();

      // 構建 Checkpoint 資料
      const checkpoint = {
        name,
        description,
        created_at: now(),
        metrics
      };

      // 保存狀態
      fs.writeFileSync(
        path.join(checkpointDir, 'state.json'),
        JSON.stringify(checkpoint, null, 2)
      );

      // 保存檔案清單
      const files = this._getTrackedFiles();
      fs.writeFileSync(
        path.join(checkpointDir, 'files.txt'),
        files.join('\n')
      );

      // 保存 diff（可選）
      if (includeDiff) {
        const diff = this._getGitDiff();
        if (diff) {
          fs.writeFileSync(
            path.join(checkpointDir, 'diff.patch'),
            diff
          );
        }
      }

      // 記錄到日誌
      appendJSONL(this.logFile, {
        action: 'create',
        name,
        timestamp: checkpoint.created_at,
        metrics: checkpoint.metrics
      });

      return { success: true, checkpoint };

    } catch (e) {
      // 清理失敗的目錄
      if (fs.existsSync(checkpointDir)) {
        fs.rmSync(checkpointDir, { recursive: true, force: true });
      }
      return { success: false, error: e.message };
    }
  }

  /**
   * 驗證 Checkpoint（比較當前與快照）
   *
   * @param {string} name - Checkpoint 名稱
   * @returns {object} - { success, checkpoint, current, diff, status }
   */
  verify(name) {
    const checkpoint = this.get(name);

    if (!checkpoint) {
      return { success: false, error: `Checkpoint '${name}' not found` };
    }

    try {
      // 收集當前指標
      const current = this._collectMetrics();

      // 計算差異
      const diff = {
        sha_changed: checkpoint.metrics.git_sha !== current.git_sha,
        files_added: current.files_count - checkpoint.metrics.files_count,
        git_status_changed: checkpoint.metrics.git_status !== current.git_status
      };

      // 判斷狀態
      let status = 'unchanged';
      if (diff.sha_changed || diff.files_added !== 0) {
        status = diff.sha_changed ? 'modified' : 'files_changed';
      }

      // 記錄到日誌
      appendJSONL(this.logFile, {
        action: 'verify',
        name,
        timestamp: now(),
        status,
        diff
      });

      return {
        success: true,
        checkpoint,
        current,
        diff,
        status
      };

    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 獲取單個 Checkpoint
   */
  get(name) {
    const stateFile = path.join(this.checkpointsDir, name, 'state.json');

    if (!fs.existsSync(stateFile)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  /**
   * 列出所有 Checkpoints
   *
   * @param {object} options - { limit, sortBy }
   * @returns {Array}
   */
  list(options = {}) {
    const { limit = 20, sortBy = 'created_at' } = options;
    const checkpoints = [];

    try {
      const dirs = fs.readdirSync(this.checkpointsDir)
        .filter(d => {
          const stat = fs.statSync(path.join(this.checkpointsDir, d));
          return stat.isDirectory();
        });

      for (const dir of dirs) {
        const checkpoint = this.get(dir);
        if (checkpoint) {
          checkpoints.push(checkpoint);
        }
      }
    } catch (e) {
      // 目錄不存在或讀取錯誤
    }

    // 排序
    checkpoints.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      return bVal.localeCompare(aVal); // 降序
    });

    return limit > 0 ? checkpoints.slice(0, limit) : checkpoints;
  }

  /**
   * 清理舊 Checkpoints
   *
   * @param {number} keep - 保留的數量
   * @returns {object} - { deleted, kept }
   */
  clear(keep = 5) {
    const checkpoints = this.list({ limit: 0 });

    if (checkpoints.length <= keep) {
      return { deleted: 0, kept: checkpoints.length };
    }

    const toDelete = checkpoints.slice(keep);
    let deleted = 0;

    for (const cp of toDelete) {
      const cpDir = path.join(this.checkpointsDir, cp.name);
      try {
        fs.rmSync(cpDir, { recursive: true, force: true });
        deleted++;

        // 記錄到日誌
        appendJSONL(this.logFile, {
          action: 'delete',
          name: cp.name,
          timestamp: now()
        });
      } catch (e) {
        // 忽略刪除錯誤
      }
    }

    return { deleted, kept: checkpoints.length - deleted };
  }

  /**
   * 刪除單個 Checkpoint
   */
  delete(name) {
    const cpDir = path.join(this.checkpointsDir, name);

    if (!fs.existsSync(cpDir)) {
      return { success: false, error: `Checkpoint '${name}' not found` };
    }

    try {
      fs.rmSync(cpDir, { recursive: true, force: true });

      appendJSONL(this.logFile, {
        action: 'delete',
        name,
        timestamp: now()
      });

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 獲取日誌
   */
  getLog(limit = 20) {
    const logs = readJSONL(this.logFile);
    return logs.slice(-limit);
  }

  /**
   * 格式化為顯示字串
   */
  formatForDisplay(checkpoints) {
    if (!checkpoints || checkpoints.length === 0) {
      return 'No checkpoints found.';
    }

    const lines = [];

    for (const cp of checkpoints) {
      const date = cp.created_at?.split('T')[0] || 'unknown';
      const sha = cp.metrics?.git_sha?.substring(0, 7) || 'N/A';
      const files = cp.metrics?.files_count || 0;
      const status = cp.metrics?.git_status === 'clean' ? '\u{2705}' : '\u{1F7E1}';

      lines.push(`${status} ${cp.name}`);
      lines.push(`   Created: ${date} | SHA: ${sha} | Files: ${files}`);

      if (cp.description) {
        lines.push(`   ${cp.description}`);
      }
    }

    return lines.join('\n');
  }

  // === 私有方法 ===

  /**
   * 收集當前指標
   */
  _collectMetrics() {
    return {
      git_sha: this._getGitSHA(),
      git_status: this._getGitStatus(),
      files_count: this._getTrackedFiles().length,
      timestamp: now()
    };
  }

  /**
   * 獲取 Git SHA
   */
  _getGitSHA() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch (e) {
      return null;
    }
  }

  /**
   * 獲取 Git 狀態
   */
  _getGitStatus() {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
      return status === '' ? 'clean' : 'dirty';
    } catch (e) {
      return 'unknown';
    }
  }

  /**
   * 獲取追蹤的檔案列表
   */
  _getTrackedFiles() {
    try {
      const output = execSync('git ls-files', { encoding: 'utf8' });
      return output.trim().split('\n').filter(f => f);
    } catch (e) {
      return [];
    }
  }

  /**
   * 獲取 Git diff
   */
  _getGitDiff() {
    try {
      return execSync('git diff', { encoding: 'utf8' });
    } catch (e) {
      return null;
    }
  }
}

module.exports = { CheckpointManager };
