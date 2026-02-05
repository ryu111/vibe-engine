#!/usr/bin/env node
/**
 * Metrics Collector Hook - 指標收集器
 *
 * 功能：
 * 1. 收集每次工具執行的指標
 * 2. 記錄執行時間、成功/失敗狀態
 * 3. 存儲到 .vibe-engine/metrics/session.jsonl
 *
 * 觸發時機：PostToolUse
 * 對應章節：Ch7 可觀測性
 */

const { MetricsStore } = require('./lib/metrics-store');

/**
 * 從 hook input 解析工具執行結果
 * @param {object} input - Hook input
 * @returns {object|null}
 */
function parseToolResult(input) {
  if (!input) return null;

  const toolName = input.tool_name;
  const toolInput = input.tool_input;
  const toolResponse = input.tool_response;

  if (!toolName) return null;

  // 判斷是否成功
  const isError = toolResponse?.is_error === true;
  const success = !isError;

  // 嘗試解析執行時間（如果有）
  let durationMs = null;
  if (toolResponse?.duration_ms) {
    durationMs = toolResponse.duration_ms;
  }

  // 估算 tokens（簡化版）
  let tokensEstimate = 0;
  if (toolResponse?.content) {
    // 粗略估算：每 4 字符約 1 token
    const content = typeof toolResponse.content === 'string'
      ? toolResponse.content
      : JSON.stringify(toolResponse.content);
    tokensEstimate = Math.ceil(content.length / 4);
  }

  return {
    tool: toolName,
    success,
    duration_ms: durationMs,
    tokens_estimate: tokensEstimate,
    input_summary: summarizeInput(toolInput),
    error_type: isError ? (toolResponse?.error_type || 'unknown') : null
  };
}

/**
 * 摘要化輸入參數
 * @param {object} input - 工具輸入
 * @returns {string}
 */
function summarizeInput(input) {
  if (!input) return '';

  // 常見的輸入類型
  if (input.file_path) {
    return `file: ${input.file_path.split('/').pop()}`;
  }
  if (input.command) {
    const cmd = input.command.slice(0, 30);
    return `cmd: ${cmd}${input.command.length > 30 ? '...' : ''}`;
  }
  if (input.pattern) {
    return `pattern: ${input.pattern}`;
  }
  if (input.query) {
    return `query: ${input.query.slice(0, 20)}`;
  }

  return '';
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
    // 解析輸入
    const hookInput = input ? JSON.parse(input) : {};

    // 解析工具結果
    const metric = parseToolResult(hookInput);

    if (metric) {
      // 記錄指標
      const store = new MetricsStore();
      store.record(metric);
    }

    // 輸出結果（不阻斷執行）
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));

  } catch (error) {
    // 錯誤時也不阻斷
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));
  }
}

main().catch(() => {
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
});
