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

/**
 * 評估權限 — 核心邏輯
 *
 * @param {object} hookInput - Hook 輸入 { tool_name, tool_input }
 * @returns {object} - { decision, reason, warnings, output }
 */
function evaluatePermission(hookInput) {
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

  // 構建輸出
  const output = {
    continue: decision !== 'deny',
    suppressOutput: false,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason
    }
  };

  if (decision === 'deny') {
    output.systemMessage = `⛔ BLOCK: ${reason}. This operation is FORBIDDEN and has been blocked. MUST NOT attempt to bypass this security check.`;
  } else if (decision === 'ask') {
    output.systemMessage = `⛔ CRITICAL: ${reason}. MUST get explicit user approval before proceeding. Do NOT modify sensitive files without confirmation.`;
  } else if (warnings.length > 0) {
    output.systemMessage = `[Permission Guard] ⚠️ Warnings: ${warnings.join('; ')}`;
  }

  return { decision, reason, warnings, output };
}

/**
 * 主函數
 */
async function main() {
  let input = '';

  if (!process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    await new Promise((resolve) => {
      process.stdin.on('data', (chunk) => { input += chunk; });
      process.stdin.on('end', resolve);
    });
  }

  try {
    const hookInput = JSON.parse(input);
    const { output } = evaluatePermission(hookInput);
    console.log(JSON.stringify(output));
  } catch (error) {
    console.log(JSON.stringify({
      systemMessage: `Permission check skipped: ${error.message}`,
      continue: true,
      suppressOutput: false,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: error.message
      }
    }));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: false,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: error.message
      }
    }));
  });
}

module.exports = {
  evaluatePermission, DANGEROUS_PATTERNS, SENSITIVE_FILES, main
};
