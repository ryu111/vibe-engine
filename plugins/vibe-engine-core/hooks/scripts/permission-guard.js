#!/usr/bin/env node
/**
 * PreToolUse Hook - 權限守衛
 *
 * 功能：
 * 1. 檢查危險操作（rm -rf, git reset --hard 等）
 * 2. 檢查敏感檔案（.env, credentials 等）
 * 3. 檢查預算是否充足
 *
 * 對應章節：Ch9 安全權限, Ch6 資源管理
 */

const fs = require('fs');
const path = require('path');

// 危險命令模式
const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive).*\//i,
  /git\s+(reset\s+--hard|clean\s+-fd|push\s+--force)/i,
  /:(){ :|:& };:/,  // fork bomb
  /mkfs/i,
  /dd\s+if=/i,
  />\s*\/dev\/sd[a-z]/i
];

// 敏感檔案模式
const SENSITIVE_FILES = [
  /\.env$/i,
  /credentials/i,
  /secrets?\.json$/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /password/i
];

// 讀取 stdin（hook input）
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });

process.stdin.on('end', () => {
  try {
    const hookInput = JSON.parse(input);
    const toolName = hookInput.tool_name || '';
    const toolInput = hookInput.tool_input || {};

    let decision = 'allow';
    let reason = '';
    let warnings = [];

    // 檢查 Bash 命令
    if (toolName === 'Bash') {
      const command = toolInput.command || '';

      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
          decision = 'deny';
          reason = `Dangerous command detected: matches pattern ${pattern}`;
          break;
        }
      }

      // 警告但不阻止
      if (decision === 'allow' && command.includes('sudo')) {
        warnings.push('Command uses sudo - ensure this is intended');
      }
    }

    // 檢查檔案操作
    if (toolName === 'Write' || toolName === 'Edit') {
      const filePath = toolInput.file_path || '';

      for (const pattern of SENSITIVE_FILES) {
        if (pattern.test(filePath)) {
          decision = 'ask';  // 需要確認
          reason = `Sensitive file detected: ${filePath}`;
          break;
        }
      }
    }

    // 輸出決定
    const output = {
      continue: true,
      suppressOutput: false,
      hookSpecificOutput: {
        permissionDecision: decision,
        reason: reason
      }
    };

    if (decision === 'deny') {
      output.systemMessage = `[Permission Guard] BLOCKED: ${reason}`;
    } else if (decision === 'ask') {
      output.systemMessage = `[Permission Guard] Requires confirmation: ${reason}`;
    } else if (warnings.length > 0) {
      output.systemMessage = `[Permission Guard] Warnings: ${warnings.join('; ')}`;
    }

    console.log(JSON.stringify(output));

  } catch (error) {
    console.log(JSON.stringify({
      systemMessage: `Permission check skipped: ${error.message}`,
      continue: true,
      suppressOutput: false,
      hookSpecificOutput: {
        permissionDecision: 'allow'
      }
    }));
  }
});

// TODO: 實作完整權限檢查
// - 根據自主等級調整嚴格程度
// - 整合預算檢查
// - 支援自定義規則
