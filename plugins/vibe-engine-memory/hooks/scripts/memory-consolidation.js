#!/usr/bin/env node
/**
 * Memory Consolidation Hook - 記憶固化
 *
 * 功能：
 * 1. 會話結束時整合短期記憶到長期記憶
 * 2. 提取值得記住的資訊
 * 3. 去重和更新現有記憶
 *
 * 對應章節：Ch5 記憶系統
 */

const fs = require('fs');
const path = require('path');

/**
 * 獲取專案根目錄
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
    if (fs.existsSync(path.join(current, '.git')) ||
        fs.existsSync(path.join(current, '.vibe-engine')) ||
        fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    current = path.dirname(current);
  }

  return cwd;
}

const PROJECT_ROOT = getProjectRoot();
const VIBE_ENGINE_DIR = path.join(PROJECT_ROOT, '.vibe-engine');
const MEMORY_DIR = path.join(VIBE_ENGINE_DIR, 'memory');

/**
 * 獲取觀察統計
 */
function getObservationStats() {
  const observationsFile = path.join(VIBE_ENGINE_DIR, 'observations.jsonl');
  if (!fs.existsSync(observationsFile)) {
    return { count: 0, corrections: 0 };
  }

  try {
    const content = fs.readFileSync(observationsFile, 'utf8');
    const lines = content.trim().split('\n').filter(l => l);
    const observations = lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);

    return {
      count: observations.length,
      corrections: observations.filter(o => o.user_correction).length
    };
  } catch {
    return { count: 0, corrections: 0 };
  }
}

/**
 * 主函數
 */
async function main() {
  let input = '';

  // 讀取 stdin
  if (!process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    await new Promise((resolve) => {
      process.stdin.on('data', (chunk) => { input += chunk; });
      process.stdin.on('end', resolve);
    });
  }

  try {
    // 獲取觀察統計
    const stats = getObservationStats();

    // TODO: 實作完整記憶固化邏輯
    // 1. 分析會話中的重要資訊
    // 2. 分類為 semantic/episodic/procedural
    // 3. 去重檢查
    // 4. 儲存到對應的 JSONL 檔案

    // 輸出結果
    const output = {
      continue: true,
      suppressOutput: false,
      decision: 'approve',
      reason: 'Memory consolidation checked'
    };

    if (stats.count > 0) {
      output.systemMessage = `[Memory Consolidation] Session had ${stats.count} observations, ${stats.corrections} corrections.`;
    } else {
      output.systemMessage = '[Memory Consolidation] No observations to consolidate.';
    }

    console.log(JSON.stringify(output));

  } catch (error) {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: false,
      decision: 'approve',
      reason: `Consolidation skipped: ${error.message}`
    }));
  }
}

main().catch(console.error);

// TODO: 實作完整記憶固化邏輯
// - 使用 LLM 提取重要資訊
// - 計算初始 confidence 分數
// - 更新 access_count 和 last_accessed
// - 觸發 pattern detection（如果觀察數量足夠）
