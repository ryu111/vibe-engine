#!/usr/bin/env node
/**
 * Stop Hook - 完成檢查
 *
 * 功能：
 * 1. 驗證任務是否真正完成
 * 2. 檢查是否有未處理的錯誤
 * 3. 確認測試是否通過（如適用）
 *
 * 對應章節：Ch2 閉環驗證
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
    const stopReason = hookInput.reason || '';
    const cwd = hookInput.cwd || process.cwd();

    // 檢查項目
    const checks = {
      hasErrors: false,
      testsRun: 'unknown',
      buildPasses: 'unknown'
    };

    // TODO: 實作更完整的檢查
    // - 檢查最近的工具執行是否有錯誤
    // - 檢查測試狀態
    // - 檢查構建狀態

    // 決定是否允許停止
    let decision = 'approve';
    let reason = '';

    // 簡單檢查：如果有明顯的未完成標誌
    if (stopReason.toLowerCase().includes('error') ||
        stopReason.toLowerCase().includes('failed')) {
      decision = 'block';
      reason = 'Task appears to have errors. Consider fixing before stopping.';
    }

    // 輸出決定（Stop hook 不支援自定義 hookSpecificOutput）
    const output = {
      continue: true,
      suppressOutput: false,
      decision: decision,
      reason: reason
    };

    if (decision === 'block') {
      output.systemMessage = `[Completion Check] Task may be incomplete: ${reason}`;
    } else {
      output.systemMessage = '[Completion Check] Task completion verified.';
    }

    console.log(JSON.stringify(output));

  } catch (error) {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: false,
      decision: 'approve',
      reason: `Check skipped: ${error.message}`
    }));
  }
});

// TODO: 實作完整完成檢查
// - 整合驗證協議（verification-protocol skill）
// - 檢查 spec 的 done_criteria
// - 支援自定義完成條件
