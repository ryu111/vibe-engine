#!/usr/bin/env node
/**
 * SessionStart Hook - 初始化 Vibe Engine 運行時環境
 *
 * 功能：
 * 1. 確保 .vibe-engine/ 目錄存在
 * 2. 載入專案配置
 * 3. 輸出初始化訊息
 *
 * 對應章節：Ch3 狀態管理, Ch5 記憶系統
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

    // 確保 .vibe-engine 目錄存在
    const vibeEngineDir = path.join(cwd, '.vibe-engine');
    const dirsToCreate = [
      vibeEngineDir,
      path.join(vibeEngineDir, 'tasks'),
      path.join(vibeEngineDir, 'checkpoints'),
      path.join(vibeEngineDir, 'memory'),
      path.join(vibeEngineDir, 'logs'),
      path.join(vibeEngineDir, 'specs'),
      path.join(vibeEngineDir, 'instincts')
    ];

    for (const dir of dirsToCreate) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // 載入或創建配置
    const configPath = path.join(vibeEngineDir, 'config.yaml');
    let configExists = fs.existsSync(configPath);

    // 輸出初始化訊息
    const output = {
      systemMessage: `Vibe Engine Core initialized. Runtime directory: ${vibeEngineDir}`,
      continue: true,
      suppressOutput: false
    };

    console.log(JSON.stringify(output));

  } catch (error) {
    // 錯誤時仍然允許繼續，但輸出警告
    console.log(JSON.stringify({
      systemMessage: `Vibe Engine init warning: ${error.message}`,
      continue: true,
      suppressOutput: false
    }));
  }
});

// TODO: 實作完整初始化邏輯
// - 載入長期記憶
// - 恢復 checkpoint
// - 初始化預算追蹤
