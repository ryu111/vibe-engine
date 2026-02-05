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

/**
 * 檢測開發工具配置，返回建議訊息（如缺少配置）
 */
function checkDevToolsConfig(cwd) {
  // 檢測是否是 TypeScript 專案
  const hasTsConfig = fs.existsSync(path.join(cwd, 'tsconfig.json'));
  if (!hasTsConfig) {
    return null; // 非 TypeScript 專案，不建議
  }

  // 檢測 ESLint 配置
  let hasEslint = fs.existsSync(path.join(cwd, '.eslintrc.js')) ||
                  fs.existsSync(path.join(cwd, '.eslintrc.json')) ||
                  fs.existsSync(path.join(cwd, '.eslintrc.yaml')) ||
                  fs.existsSync(path.join(cwd, '.eslintrc.yml')) ||
                  fs.existsSync(path.join(cwd, 'eslint.config.js'));

  // 檢測 Jest 配置
  let hasJest = fs.existsSync(path.join(cwd, 'jest.config.js')) ||
                fs.existsSync(path.join(cwd, 'jest.config.ts')) ||
                fs.existsSync(path.join(cwd, 'jest.config.json'));

  // 檢查 package.json 中的配置
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.eslintConfig) hasEslint = true;
      if (pkg.jest) hasJest = true;
    } catch (e) {
      // 忽略 JSON 解析錯誤
    }
  }

  // 如果都有配置，不需要建議
  if (hasEslint && hasJest) {
    return null;
  }

  // 生成建議訊息
  const missing = [];
  if (!hasEslint) missing.push('ESLint');
  if (!hasJest) missing.push('Jest');

  return `💡 偵測到 TypeScript 專案缺少 ${missing.join(' 和 ')} 配置。執行 /vibe-setup 可一鍵設置開發工具，啟用完整 /verify 驗證。`;
}

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

    // 檢測開發工具配置
    const devToolsSuggestions = checkDevToolsConfig(cwd);

    // 輸出初始化訊息
    let systemMessage = `Vibe Engine Core initialized. Runtime directory: ${vibeEngineDir}`;
    if (devToolsSuggestions) {
      systemMessage += `\n\n${devToolsSuggestions}`;
    }

    const output = {
      systemMessage,
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
