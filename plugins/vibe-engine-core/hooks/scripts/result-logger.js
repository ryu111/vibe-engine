#!/usr/bin/env node
/**
 * PostToolUse Hook - 結果記錄器
 *
 * 功能：
 * 1. 記錄工具執行結果
 * 2. 追蹤檔案修改歷史
 * 3. 收集觀察（用於 Instinct Learning）
 *
 * 對應章節：Ch7 可觀測性, Ch5 記憶系統
 */

const fs = require('fs');
const path = require('path');

// 讀取 stdin（hook input）
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });

process.stdin.on('end', () => {
  try {
    const hookInput = JSON.parse(input);
    const toolName = hookInput.tool_name || '';
    const toolInput = hookInput.tool_input || {};
    const toolResult = hookInput.tool_result || {};
    const cwd = hookInput.cwd || process.cwd();

    // 準備日誌條目
    const logEntry = {
      timestamp: new Date().toISOString(),
      session_id: hookInput.session_id || 'unknown',
      tool_name: toolName,
      tool_input: summarizeInput(toolName, toolInput),
      success: !toolResult.error,
      duration_ms: toolResult.duration_ms || null
    };

    // 記錄到日誌檔案
    const vibeEngineDir = path.join(cwd, '.vibe-engine');
    const logsDir = path.join(vibeEngineDir, 'logs');

    if (fs.existsSync(logsDir)) {
      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(logsDir, `${today}.jsonl`);

      fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    }

    // 收集觀察（用於 Instinct Learning）
    // TODO: 實作觀察收集邏輯

    // 輸出（不顯示在 transcript）
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));

  } catch (error) {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));
  }
});

/**
 * 摘要化輸入（避免記錄大量內容）
 */
function summarizeInput(toolName, toolInput) {
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
        file_path: toolInput.file_path
      };
    default:
      // 對其他工具只記錄 key
      return Object.keys(toolInput);
  }
}

// TODO: 實作完整日誌功能
// - 支援日誌輪替
// - 支援日誌查詢
// - 整合可觀測性系統
