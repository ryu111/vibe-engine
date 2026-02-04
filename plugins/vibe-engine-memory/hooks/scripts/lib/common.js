/**
 * Common Utilities - 共用函數模組
 *
 * 提供所有 memory plugin hooks/scripts 共用的基礎函數：
 * - 專案根目錄定位
 * - .vibe-engine 目錄管理
 * - 路徑常數
 *
 * 對應章節：Ch5 記憶系統
 */

const fs = require('fs');
const path = require('path');

/**
 * 獲取專案根目錄
 *
 * 優先級：
 * 1. CLAUDE_PROJECT_ROOT 環境變數
 * 2. 在 .claude/plugins/cache 內時使用全局目錄
 * 3. 向上遞迴查找 .git/.vibe-engine/package.json
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
 * 獲取 .vibe-engine 相關路徑
 */
function getVibeEnginePaths(projectRoot = null) {
  const root = projectRoot || getProjectRoot();
  const vibeEngineDir = path.join(root, '.vibe-engine');
  const memoryDir = path.join(vibeEngineDir, 'memory');

  return {
    root: vibeEngineDir,
    memory: {
      dir: memoryDir,
      semantic: path.join(memoryDir, 'semantic.jsonl'),
      episodic: path.join(memoryDir, 'episodic.jsonl'),
      procedural: path.join(memoryDir, 'procedural.jsonl'),
      archive: path.join(memoryDir, 'archive')
    },
    instincts: path.join(vibeEngineDir, 'instincts'),
    observations: path.join(vibeEngineDir, 'observations.jsonl'),
    checkpoints: {
      dir: path.join(vibeEngineDir, 'checkpoints'),
      log: path.join(vibeEngineDir, 'checkpoints.log')
    },
    config: path.join(vibeEngineDir, 'config.yaml')
  };
}

/**
 * 確保 .vibe-engine 目錄結構存在
 */
function ensureVibeEngineDirs(projectRoot = null) {
  const paths = getVibeEnginePaths(projectRoot);

  const dirsToCreate = [
    paths.root,
    paths.memory.dir,
    paths.memory.archive,
    paths.instincts,
    paths.checkpoints.dir
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
 * 計算兩個日期之間的天數
 */
function daysBetween(dateStr1, dateStr2 = null) {
  const d1 = new Date(dateStr1);
  const d2 = dateStr2 ? new Date(dateStr2) : new Date();
  const diffTime = Math.abs(d2 - d1);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

module.exports = {
  getProjectRoot,
  getVibeEnginePaths,
  ensureVibeEngineDirs,
  safeReadJSON,
  safeWriteJSON,
  generateId,
  now,
  daysBetween
};
