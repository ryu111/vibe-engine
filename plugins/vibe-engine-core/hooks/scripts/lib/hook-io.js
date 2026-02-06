/**
 * Hook I/O - 統一 Hook 輸入/輸出處理
 *
 * 提供所有 hook 腳本共用的 stdin 讀取和輸出格式化：
 * - readStdin() - 讀取原始 stdin
 * - readStdinAsJson() - 讀取並解析 JSON
 * - readHookInput() - 完整 hook 輸入處理
 * - writeHookOutput() - 統一輸出格式
 *
 * 對應章節：Ch1 協調引擎、Ch6 資源管理
 */

/**
 * 讀取 stdin 原始內容
 * @param {number} timeout - 超時毫秒數（預設 100ms）
 * @returns {Promise<string>} stdin 內容
 */
async function readStdin(timeout = 100) {
  if (process.stdin.isTTY) {
    return '';
  }

  let input = '';
  process.stdin.setEncoding('utf8');

  await new Promise((resolve) => {
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', resolve);
    setTimeout(resolve, timeout);
  });

  return input.trim();
}

/**
 * 讀取 stdin 並解析為 JSON
 * @param {number} timeout - 超時毫秒數
 * @returns {Promise<object|null>} 解析的 JSON 或 null
 */
async function readStdinAsJson(timeout = 100) {
  const input = await readStdin(timeout);

  if (!input) {
    return null;
  }

  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

/**
 * 判斷 Hook 類型
 * @param {object} hookInput - Hook 輸入對象
 * @returns {string|null} 'PreToolUse' | 'PostToolUse' | 'Stop' | 'UserPromptSubmit' | null
 */
function parseHookType(hookInput) {
  if (!hookInput) return null;

  // PreToolUse/PostToolUse
  if (hookInput.tool_name) {
    return hookInput.tool_result ? 'PostToolUse' : 'PreToolUse';
  }

  // Stop hook
  if (hookInput.transcript_summary !== undefined) {
    return 'Stop';
  }

  // UserPromptSubmit
  if (hookInput.user_prompt !== undefined) {
    return 'UserPromptSubmit';
  }

  // SessionStart
  if (hookInput.session_id && !hookInput.tool_name && !hookInput.user_prompt) {
    return 'SessionStart';
  }

  return null;
}

/**
 * 完整的 Hook 輸入讀取和解析
 * @param {number} timeout - 超時毫秒數
 * @returns {Promise<object>} { hookInput, hookType, rawInput }
 */
async function readHookInput(timeout = 100) {
  const rawInput = await readStdin(timeout);
  let hookInput = null;
  let hookType = null;

  if (rawInput) {
    try {
      hookInput = JSON.parse(rawInput);
      hookType = parseHookType(hookInput);
    } catch {
      // 非 JSON 輸入，可能是命令列直接呼叫
    }
  }

  return {
    hookInput,
    hookType,
    rawInput,
    isHook: hookType !== null
  };
}

/**
 * 寫入 Hook 輸出（JSON 格式）
 * @param {object} output - 輸出對象
 */
function writeHookOutput(output) {
  console.log(JSON.stringify(output));
}

/**
 * 建構標準 Hook 成功輸出
 * @param {object} options - 輸出選項
 * @returns {object} Hook 輸出對象
 */
function buildSuccessOutput(options = {}) {
  const {
    continue: shouldContinue = true,
    suppressOutput = false,
    systemMessage = null,
    hookSpecificOutput = null
  } = options;

  const output = {
    continue: shouldContinue,
    suppressOutput
  };

  if (systemMessage) {
    output.systemMessage = systemMessage;
  }

  if (hookSpecificOutput && Object.keys(hookSpecificOutput).length > 0) {
    output.hookSpecificOutput = hookSpecificOutput;
  }

  return output;
}

/**
 * 建構標準 Hook 錯誤輸出
 * @param {string} message - 錯誤訊息
 * @param {boolean} shouldContinue - 是否允許繼續
 * @returns {object} Hook 輸出對象
 */
function buildErrorOutput(message, shouldContinue = true) {
  return {
    continue: shouldContinue,
    suppressOutput: true
  };
}

/**
 * 建構阻止操作的輸出
 * @param {string} reason - 阻止原因
 * @param {string} decision - 決策類型（'block' | 'warn'）
 * @returns {object} Hook 輸出對象
 */
function buildBlockOutput(reason, decision = 'block') {
  return {
    continue: false,
    decision,
    reason
  };
}

module.exports = {
  readStdin,
  readStdinAsJson,
  readHookInput,
  parseHookType,
  writeHookOutput,
  buildSuccessOutput,
  buildErrorOutput,
  buildBlockOutput
};
