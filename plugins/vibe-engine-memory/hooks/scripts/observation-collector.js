#!/usr/bin/env node
/**
 * Observation Collector Hook - 觀察收集器
 *
 * 功能：
 * 1. 收集工具呼叫和結果作為觀察
 * 2. 記錄用戶糾正
 * 3. 儲存到 observations.jsonl
 *
 * 對應章節：Ch5 記憶系統 - Instinct Learning
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
const OBSERVATIONS_FILE = path.join(VIBE_ENGINE_DIR, 'observations.jsonl');

/**
 * 記錄觀察
 */
function recordObservation(observation) {
  try {
    if (!fs.existsSync(VIBE_ENGINE_DIR)) {
      fs.mkdirSync(VIBE_ENGINE_DIR, { recursive: true });
    }

    const line = JSON.stringify(observation) + '\n';
    fs.appendFileSync(OBSERVATIONS_FILE, line);

    return true;
  } catch (e) {
    return false;
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
    const hookInput = JSON.parse(input);

    // 提取工具資訊
    const observation = {
      timestamp: new Date().toISOString(),
      session_id: hookInput.session_id || 'unknown',
      tool_name: hookInput.tool_name || '',
      tool_input: hookInput.tool_input || {},
      tool_result_summary: summarizeResult(hookInput.tool_result),
      outcome: determineOutcome(hookInput),
      user_correction: false  // TODO: 偵測用戶糾正
    };

    // 記錄觀察（靜默執行，不影響主流程）
    recordObservation(observation);

    // 輸出（不顯示訊息，避免干擾）
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));

  } catch (error) {
    // 靜默失敗
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));
  }
}

/**
 * 摘要結果（避免存儲過大）
 */
function summarizeResult(result) {
  if (!result) return '';
  const str = typeof result === 'string' ? result : JSON.stringify(result);
  return str.length > 200 ? str.substring(0, 200) + '...' : str;
}

/**
 * 判斷結果
 */
function determineOutcome(hookInput) {
  // TODO: 更智慧的結果判斷
  return 'success';
}

main().catch(() => {
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
});

// TODO: 實作完整觀察收集邏輯
// - 偵測用戶糾正（user_correction: true）
// - 智慧判斷 outcome (success/failure/corrected)
// - 定期觸發 pattern detection
