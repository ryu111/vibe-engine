#!/usr/bin/env node
/**
 * Observation Collector Hook - 觀察收集器
 *
 * 功能：
 * 1. 收集工具呼叫和結果作為觀察
 * 2. 智慧判斷執行結果（success/failure/corrected）
 * 3. 偵測用戶糾正模式
 * 4. 儲存到 observations.jsonl
 *
 * 觸發時機：PostToolUse
 * 對應章節：Ch5 記憶系統 - Instinct Learning
 */

const { getProjectRoot, ensureVibeEngineDirs, now } = require('./lib/common');
const { appendJSONL, readJSONL } = require('./lib/jsonl');

/**
 * 不需要記錄的工具（避免噪音）
 */
const EXCLUDED_TOOLS = [
  'TodoWrite',       // 任務管理
  'AskUserQuestion', // 詢問用戶
  'WebSearch',       // 搜尋
  'WebFetch'         // 網頁獲取
];

/**
 * 錯誤指標關鍵字
 */
const ERROR_INDICATORS = [
  'error',
  'failed',
  'failure',
  'exception',
  'not found',
  'permission denied',
  'syntax error',
  'cannot',
  'unable to'
];

/**
 * 判斷執行結果
 *
 * @param {object} hookInput - Hook 輸入
 * @returns {string} - 'success' | 'failure' | 'partial'
 */
function determineOutcome(hookInput) {
  const { tool_name, tool_result } = hookInput;

  // 沒有結果視為成功（靜默操作）
  if (!tool_result) {
    return 'success';
  }

  // 檢查是否有明確的錯誤欄位
  if (tool_result.error || tool_result.isError) {
    return 'failure';
  }

  // 將結果轉為字串檢查錯誤指標
  const resultStr = typeof tool_result === 'string'
    ? tool_result.toLowerCase()
    : JSON.stringify(tool_result).toLowerCase();

  // 檢查錯誤指標
  const hasError = ERROR_INDICATORS.some(indicator =>
    resultStr.includes(indicator)
  );

  if (hasError) {
    // 區分部分錯誤和完全失敗
    if (resultStr.includes('success') || resultStr.includes('completed')) {
      return 'partial';
    }
    return 'failure';
  }

  return 'success';
}

/**
 * 偵測用戶糾正模式
 *
 * 規則：
 * 1. 同一檔案在短時間內被多次編輯
 * 2. Bash 命令被重新執行（可能是修正）
 * 3. 失敗後立即重試
 *
 * @param {object} currentObs - 當前觀察
 * @param {Array} recentObs - 最近的觀察
 * @returns {boolean}
 */
function detectUserCorrection(currentObs, recentObs) {
  if (recentObs.length === 0) {
    return false;
  }

  const lastObs = recentObs[recentObs.length - 1];

  // 檢查是否在 60 秒內
  const currentTime = new Date(currentObs.timestamp).getTime();
  const lastTime = new Date(lastObs.timestamp).getTime();
  const timeDiff = currentTime - lastTime;

  if (timeDiff > 60000) { // 超過 60 秒
    return false;
  }

  // 規則 1: 同一檔案被多次編輯
  if (['Edit', 'Write'].includes(currentObs.tool_name) &&
      lastObs.tool_name === currentObs.tool_name) {
    const currentFile = currentObs.tool_input?.file_path;
    const lastFile = lastObs.tool_input?.file_path;

    if (currentFile && currentFile === lastFile) {
      return true;
    }
  }

  // 規則 2: 上一個操作失敗後立即重試
  if (lastObs.outcome === 'failure' &&
      lastObs.tool_name === currentObs.tool_name) {
    return true;
  }

  // 規則 3: Bash 命令被重新執行
  if (currentObs.tool_name === 'Bash' && lastObs.tool_name === 'Bash') {
    const currentCmd = currentObs.tool_input?.command || '';
    const lastCmd = lastObs.tool_input?.command || '';

    // 類似的命令（前 20 字元相同）
    if (currentCmd.substring(0, 20) === lastCmd.substring(0, 20)) {
      return true;
    }
  }

  return false;
}

/**
 * 摘要結果（避免存儲過大）
 */
function summarizeResult(result) {
  if (!result) return '';

  const str = typeof result === 'string' ? result : JSON.stringify(result);

  // 限制長度
  if (str.length > 300) {
    return str.substring(0, 300) + '...';
  }

  return str;
}

/**
 * 摘要輸入（隱藏敏感資訊）
 */
function summarizeInput(toolName, toolInput) {
  if (!toolInput) return {};

  switch (toolName) {
    case 'Write':
    case 'Edit':
      return {
        file_path: toolInput.file_path,
        content_length: (toolInput.content || toolInput.new_string || '').length
      };

    case 'Bash':
      return {
        command: (toolInput.command || '').substring(0, 100)
      };

    case 'Read':
      return {
        file_path: toolInput.file_path,
        offset: toolInput.offset,
        limit: toolInput.limit
      };

    case 'Grep':
    case 'Glob':
      return {
        pattern: toolInput.pattern,
        path: toolInput.path
      };

    default:
      // 只返回 key 列表，避免存儲敏感資料
      return { keys: Object.keys(toolInput) };
  }
}

/**
 * 獲取最近的觀察
 */
function getRecentObservations(observationsFile, limit = 5) {
  const observations = readJSONL(observationsFile);
  return observations.slice(-limit);
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
    const toolName = hookInput.tool_name || '';

    // 排除不需要記錄的工具
    if (EXCLUDED_TOOLS.includes(toolName)) {
      console.log(JSON.stringify({
        continue: true,
        suppressOutput: true
      }));
      return;
    }

    const projectRoot = getProjectRoot();
    const paths = ensureVibeEngineDirs(projectRoot);

    // 獲取最近的觀察（用於偵測糾正）
    const recentObs = getRecentObservations(paths.observations, 5);

    // 構建觀察記錄
    const observation = {
      timestamp: now(),
      session_id: hookInput.session_id || 'unknown',
      tool_name: toolName,
      tool_input: summarizeInput(toolName, hookInput.tool_input),
      tool_result_summary: summarizeResult(hookInput.tool_result),
      outcome: determineOutcome(hookInput),
      user_correction: false
    };

    // 偵測用戶糾正
    observation.user_correction = detectUserCorrection(observation, recentObs);

    // 如果偵測到糾正，更新前一個觀察
    if (observation.user_correction && recentObs.length > 0) {
      observation.corrects_previous = recentObs[recentObs.length - 1].timestamp;
    }

    // 記錄觀察
    appendJSONL(paths.observations, observation);

    // 輸出（靜默，不干擾主流程）
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

if (require.main === module) {
  main().catch(() => {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));
  });
}

module.exports = {
  determineOutcome, detectUserCorrection,
  summarizeResult, summarizeInput, getRecentObservations,
  EXCLUDED_TOOLS, ERROR_INDICATORS, main
};
