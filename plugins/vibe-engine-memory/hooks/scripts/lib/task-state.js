/**
 * Task State Manager - 任務狀態管理
 *
 * 功能：
 * 1. 保存當前任務狀態到 task-state.yaml
 * 2. 載入任務狀態供新 session 使用
 * 3. 提供接續提示
 *
 * 對應章節：Ch5 記憶系統 - Working Memory 擴展
 */

const fs = require('fs');
const path = require('path');
const { getVibeEngineDir, formatTimestamp } = require('./common');

const TASK_STATE_FILE = 'task-state.yaml';

/**
 * 簡易 YAML 解析（僅支援基本格式）
 * @param {string} content - YAML 內容
 * @returns {object}
 */
function parseSimpleYaml(content) {
  const result = {
    last_updated: null,
    current_task: null,
    pending: [],
    completed_recently: [],
    blockers: [],
    resume_hint: null,
    last_commit: null
  };

  const lines = content.split('\n');
  let currentArray = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳過空行和註解
    if (!trimmed || trimmed.startsWith('#')) continue;

    // 陣列項目
    if (trimmed.startsWith('- ')) {
      if (currentArray && result[currentArray]) {
        result[currentArray].push(trimmed.slice(2).replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    // 鍵值對
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, '');

      if (key in result) {
        if (Array.isArray(result[key])) {
          currentArray = key;
          // 如果同一行有值（如 pending: []）
          if (value && value !== '[]') {
            result[key] = [value];
          }
        } else {
          result[key] = value || null;
          currentArray = null;
        }
      }
    }
  }

  return result;
}

/**
 * 生成 YAML 字串
 * @param {object} state - 任務狀態
 * @returns {string}
 */
function toYaml(state) {
  const lines = [
    '# Task State - 任務狀態（自動生成）',
    '# 用於跨 session 任務接續',
    '',
    `last_updated: "${state.last_updated || formatTimestamp()}"`,
    `current_task: "${state.current_task || ''}"`,
    '',
    'pending:'
  ];

  if (state.pending && state.pending.length > 0) {
    for (const item of state.pending) {
      lines.push(`  - "${item}"`);
    }
  } else {
    lines.push('  # (無待辦)');
  }

  lines.push('');
  lines.push('completed_recently:');

  if (state.completed_recently && state.completed_recently.length > 0) {
    for (const item of state.completed_recently.slice(0, 5)) { // 最多 5 項
      lines.push(`  - "${item}"`);
    }
  } else {
    lines.push('  # (無)');
  }

  lines.push('');
  lines.push('blockers:');

  if (state.blockers && state.blockers.length > 0) {
    for (const item of state.blockers) {
      lines.push(`  - "${item}"`);
    }
  } else {
    lines.push('  # (無阻塞)');
  }

  lines.push('');
  lines.push(`resume_hint: "${state.resume_hint || ''}"`);
  lines.push(`last_commit: "${state.last_commit || ''}"`);
  lines.push('');

  return lines.join('\n');
}

/**
 * TaskState 類別
 */
class TaskState {
  constructor(projectRoot = null) {
    this.projectRoot = projectRoot || process.cwd();
    this.vibeDir = getVibeEngineDir(this.projectRoot);
    this.filePath = path.join(this.vibeDir, TASK_STATE_FILE);
  }

  /**
   * 載入任務狀態
   * @returns {object|null}
   */
  load() {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      return parseSimpleYaml(content);
    } catch (e) {
      return null;
    }
  }

  /**
   * 保存任務狀態
   * @param {object} state - 任務狀態
   */
  save(state) {
    const fullState = {
      last_updated: formatTimestamp(),
      current_task: state.current_task || '',
      pending: state.pending || [],
      completed_recently: state.completed_recently || [],
      blockers: state.blockers || [],
      resume_hint: state.resume_hint || '',
      last_commit: state.last_commit || this._getLastCommit()
    };

    // 確保目錄存在
    if (!fs.existsSync(this.vibeDir)) {
      fs.mkdirSync(this.vibeDir, { recursive: true });
    }

    fs.writeFileSync(this.filePath, toYaml(fullState), 'utf8');
    return fullState;
  }

  /**
   * 更新部分狀態
   * @param {object} updates - 要更新的欄位
   */
  update(updates) {
    const current = this.load() || {};
    const merged = { ...current, ...updates };
    return this.save(merged);
  }

  /**
   * 添加完成項目
   * @param {string} task - 完成的任務
   */
  markCompleted(task) {
    const current = this.load() || { completed_recently: [], pending: [] };

    // 從 pending 移除（如果存在）
    current.pending = (current.pending || []).filter(p => p !== task);

    // 添加到 completed_recently
    current.completed_recently = [task, ...(current.completed_recently || [])].slice(0, 5);

    return this.save(current);
  }

  /**
   * 添加待辦項目
   * @param {string} task - 待辦任務
   */
  addPending(task) {
    const current = this.load() || { pending: [] };
    if (!current.pending.includes(task)) {
      current.pending = [...(current.pending || []), task];
    }
    return this.save(current);
  }

  /**
   * 格式化為提示訊息
   * @returns {string|null}
   */
  formatForPrompt() {
    const state = this.load();
    if (!state) return null;

    const lines = [];

    // 檢查是否有內容
    const hasContent = state.current_task ||
                       (state.pending && state.pending.length > 0) ||
                       (state.completed_recently && state.completed_recently.length > 0);

    if (!hasContent) return null;

    lines.push('## 📋 Session Handoff');
    lines.push('');

    if (state.current_task) {
      lines.push(`**當前任務**: ${state.current_task}`);
    }

    if (state.completed_recently && state.completed_recently.length > 0) {
      lines.push('');
      lines.push('**最近完成**:');
      for (const item of state.completed_recently.slice(0, 3)) {
        lines.push(`- ✅ ${item}`);
      }
    }

    if (state.pending && state.pending.length > 0) {
      lines.push('');
      lines.push('**待辦**:');
      for (const item of state.pending) {
        lines.push(`- ⏳ ${item}`);
      }
    }

    if (state.blockers && state.blockers.length > 0) {
      lines.push('');
      lines.push('**阻塞**:');
      for (const item of state.blockers) {
        lines.push(`- 🚫 ${item}`);
      }
    }

    if (state.resume_hint) {
      lines.push('');
      lines.push(`💡 **建議**: ${state.resume_hint}`);
    }

    if (state.last_commit) {
      lines.push('');
      lines.push(`📌 Last commit: \`${state.last_commit}\``);
    }

    lines.push('');
    lines.push('---');

    return lines.join('\n');
  }

  /**
   * 獲取最後一次 commit hash
   * @private
   */
  _getLastCommit() {
    try {
      const { execSync } = require('child_process');
      const hash = execSync('git rev-parse --short HEAD 2>/dev/null', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      }).trim();
      return hash;
    } catch (e) {
      return '';
    }
  }

  /**
   * 從對話推斷任務狀態（簡化版）
   * @param {object} context - 對話上下文
   * @returns {object}
   */
  static inferFromContext(context) {
    // 這是一個簡化版，實際可以更智慧
    return {
      current_task: context.lastUserMessage || '',
      pending: [],
      completed_recently: [],
      blockers: [],
      resume_hint: ''
    };
  }
}

module.exports = {
  TaskState,
  parseSimpleYaml,
  toYaml,
  TASK_STATE_FILE
};
