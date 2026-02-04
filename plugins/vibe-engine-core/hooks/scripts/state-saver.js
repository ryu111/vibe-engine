#!/usr/bin/env node
/**
 * PreCompact Hook - 狀態保存器
 *
 * 功能：
 * 1. 在 context compaction 前保存關鍵狀態
 * 2. 創建 checkpoint
 * 3. 記錄重要決策和進度
 *
 * 對應章節：Ch3 狀態管理
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
    const cwd = hookInput.cwd || process.cwd();
    const sessionId = hookInput.session_id || 'unknown';

    // 準備 checkpoint
    const vibeEngineDir = path.join(cwd, '.vibe-engine');
    const checkpointsDir = path.join(vibeEngineDir, 'checkpoints');

    if (!fs.existsSync(checkpointsDir)) {
      fs.mkdirSync(checkpointsDir, { recursive: true });
    }

    // 創建 checkpoint
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const checkpointId = `precompact-${timestamp}`;
    const checkpointDir = path.join(checkpointsDir, checkpointId);
    fs.mkdirSync(checkpointDir, { recursive: true });

    // 保存狀態摘要
    const stateSummary = {
      checkpoint_id: checkpointId,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      trigger: 'PreCompact',
      cwd: cwd,
      // TODO: 從 context 提取更多資訊
      notes: 'Auto-checkpoint before context compaction'
    };

    fs.writeFileSync(
      path.join(checkpointDir, 'state.json'),
      JSON.stringify(stateSummary, null, 2)
    );

    // 輸出提示
    const output = {
      systemMessage: `[State Saver] Checkpoint created: ${checkpointId}. Key state preserved for recovery.`,
      continue: true,
      suppressOutput: false
    };

    console.log(JSON.stringify(output));

  } catch (error) {
    console.log(JSON.stringify({
      systemMessage: `State save warning: ${error.message}`,
      continue: true,
      suppressOutput: false
    }));
  }
});

// TODO: 實作完整狀態保存
// - 提取並保存當前任務狀態
// - 保存重要決策歷史
// - 保存未完成的工作項目
// - 整合記憶系統
