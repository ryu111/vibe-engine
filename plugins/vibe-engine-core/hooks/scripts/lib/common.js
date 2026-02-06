/**
 * Common Utilities - 共用函數模組
 *
 * 提供所有 core plugin hooks/scripts 共用的基礎函數：
 * - 專案根目錄定位
 * - .vibe-engine 目錄管理
 * - JSON 讀寫
 * - ID 生成
 *
 * 對應章節：Ch6 資源管理、Ch1 協調引擎
 */

const fs = require('fs');
const path = require('path');

/**
 * 獲取專案根目錄
 *
 * 優先級：
 * 1. CLAUDE_PROJECT_ROOT 環境變數
 * 2. 在 .claude/plugins/cache 內時使用全局目錄
 * 3. 向上遞迴查找 .git/package.json
 */
function getProjectRoot() {
  if (process.env.CLAUDE_PROJECT_ROOT) {
    return process.env.CLAUDE_PROJECT_ROOT;
  }

  const cwd = process.cwd();

  if (cwd.includes('.claude/plugins/cache')) {
    return path.join(process.env.HOME || '/tmp', '.vibe-engine-global');
  }

  let current = cwd;
  while (current !== '/') {
    const markers = [
      path.join(current, '.git'),
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
 * 獲取 .vibe-engine 相關路徑
 */
function getVibeEnginePaths(projectRoot = null) {
  const root = projectRoot || getProjectRoot();
  const vibeEngineDir = path.join(root, '.vibe-engine');

  return {
    root: vibeEngineDir,
    config: path.join(vibeEngineDir, 'config.yaml'),
    budget: path.join(vibeEngineDir, 'budget.json'),
    usage: path.join(vibeEngineDir, 'usage'),
    logs: path.join(vibeEngineDir, 'logs'),
    tasks: path.join(vibeEngineDir, 'tasks'),
    verification: path.join(vibeEngineDir, 'verification'),
    specs: path.join(vibeEngineDir, 'specs')
  };
}

/**
 * 確保 .vibe-engine 目錄結構存在
 */
function ensureVibeEngineDirs(projectRoot = null) {
  const paths = getVibeEnginePaths(projectRoot);

  const dirsToCreate = [
    paths.root,
    paths.usage,
    paths.logs,
    paths.tasks,
    paths.verification,
    paths.specs
  ];

  for (const dir of dirsToCreate) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return paths;
}

/**
 * 安全讀取 JSON 檔案
 */
function safeReadJSON(filePath, defaultValue = null) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    // 忽略解析錯誤
  }
  return defaultValue;
}

/**
 * 安全寫入 JSON 檔案
 */
function safeWriteJSON(filePath, data, pretty = true) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    fs.writeFileSync(filePath, content);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 生成唯一 ID
 */
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * 獲取當前 ISO 時間戳
 */
function now() {
  return new Date().toISOString();
}

/**
 * 格式化時間戳為簡短格式 (HH:MM:SS)
 */
function formatTime(date = null) {
  const d = date ? new Date(date) : new Date();
  return d.toTimeString().split(' ')[0];
}

module.exports = {
  getProjectRoot,
  getVibeEnginePaths,
  ensureVibeEngineDirs,
  safeReadJSON,
  safeWriteJSON,
  generateId,
  now,
  formatTime
};
