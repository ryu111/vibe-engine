#!/usr/bin/env node
/**
 * Auto Progress - 自動更新進度文檔
 *
 * 功能：
 * 1. 執行 verify-plugin.sh 驗證
 * 2. 自動更新 docs/PROGRESS.md
 * 3. 記錄驗證歷史
 *
 * 可在 Stop hook 或手動呼叫
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../..');
const PROJECT_ROOT = path.join(PLUGIN_ROOT, '../..');
const PROGRESS_FILE = path.join(PROJECT_ROOT, 'docs/PROGRESS.md');
const VERIFY_SCRIPT = path.join(PROJECT_ROOT, 'scripts/verify-plugin.sh');

/**
 * 執行驗證腳本
 */
function runVerification() {
  try {
    const result = execSync(`bash "${VERIFY_SCRIPT}" 2>&1`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 30000
    });

    // 移除 ANSI 顏色碼
    const cleanResult = result.replace(/\x1b\[[0-9;]*m/g, '');

    // 解析結果
    const passMatch = cleanResult.match(/通過:\s*(\d+)/);
    const failMatch = cleanResult.match(/失敗:\s*(\d+)/);

    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;

    return {
      success: failed === 0 && passed > 0,
      passed: passed,
      failed: failed,
      output: cleanResult
    };
  } catch (error) {
    return {
      success: false,
      passed: 0,
      failed: -1,
      error: error.message
    };
  }
}

/**
 * 檢查組件狀態
 */
function checkComponents() {
  const components = {
    agents: ['architect', 'developer', 'reviewer', 'tester', 'explorer'],
    skills: ['task-decomposition', 'spec-generator', 'verification-protocol', 'budget-tracker', 'iterative-retrieval'],
    commands: ['status', 'spec', 'verify', 'budget'],
    hooks: ['session-init', 'prompt-classifier', 'permission-guard', 'result-logger', 'completion-check', 'state-saver']
  };

  const status = {};

  // 檢查 Agents
  status.agents = components.agents.map(name => {
    const file = path.join(PLUGIN_ROOT, `agents/${name}.md`);
    const exists = fs.existsSync(file);
    let hasContent = false;
    if (exists) {
      const content = fs.readFileSync(file, 'utf8');
      // 檢查是否只是 scaffold（TODO 標記多於 3 個表示未完成）
      const todoCount = (content.match(/TODO/g) || []).length;
      hasContent = todoCount < 3 && content.length > 500;
    }
    return { name, exists, hasContent };
  });

  // 檢查 Skills
  status.skills = components.skills.map(name => {
    const file = path.join(PLUGIN_ROOT, `skills/${name}/SKILL.md`);
    const exists = fs.existsSync(file);
    let hasContent = false;
    if (exists) {
      const content = fs.readFileSync(file, 'utf8');
      const todoCount = (content.match(/TODO/g) || []).length;
      hasContent = todoCount < 3 && content.length > 500;
    }
    return { name, exists, hasContent };
  });

  // 檢查 Commands
  status.commands = components.commands.map(name => {
    const file = path.join(PLUGIN_ROOT, `commands/${name}.md`);
    const exists = fs.existsSync(file);
    let hasContent = false;
    if (exists) {
      const content = fs.readFileSync(file, 'utf8');
      const todoCount = (content.match(/TODO/g) || []).length;
      hasContent = todoCount < 2 && content.length > 300;
    }
    return { name, exists, hasContent };
  });

  // 檢查 Hooks
  status.hooks = components.hooks.map(name => {
    const file = path.join(PLUGIN_ROOT, `hooks/scripts/${name}.js`);
    const exists = fs.existsSync(file);
    let hasContent = false;
    if (exists) {
      const content = fs.readFileSync(file, 'utf8');
      const todoCount = (content.match(/TODO/g) || []).length;
      hasContent = todoCount < 3 && content.length > 300;
    }
    return { name, exists, hasContent };
  });

  return status;
}

/**
 * 生成 PROGRESS.md 內容
 */
function generateProgressMd(verification, components) {
  const now = new Date().toISOString().split('T')[0];

  const getIcon = (item) => {
    if (!item.exists) return '⬜';
    if (item.hasContent) return '✅';
    return '🔲';
  };

  const getStatus = (item) => {
    if (!item.exists) return '未開始';
    if (item.hasContent) return '完成';
    return '已建殼';
  };

  return `# Vibe Engine 實作進度

> 最後更新: ${now}
> 驗證結果: ${verification.success ? '✅ 通過' : '❌ 失敗'} (${verification.passed}/${verification.passed + verification.failed})

## 狀態說明
- ⬜ 未開始
- 🔲 已建殼（有結構，內容待補）
- 🔳 部分完成
- ✅ 完成並驗證

---

## vibe-engine-core (P0)

### 基礎結構
- [x] plugin.json
- [x] marketplace.json
- [x] README.md
- [x] CLAUDE.md

### Agents
${components.agents.map(a => `- [${a.exists ? 'x' : ' '}] ${a.name}.md - ${getIcon(a)} ${getStatus(a)}`).join('\n')}

### Skills
${components.skills.map(s => `- [${s.exists ? 'x' : ' '}] ${s.name} - ${getIcon(s)} ${getStatus(s)}`).join('\n')}

### Commands
${components.commands.map(c => `- [${c.exists ? 'x' : ' '}] /${c.name} - ${getIcon(c)} ${getStatus(c)}`).join('\n')}

### Hooks
- [x] hooks.json
${components.hooks.map(h => `- [${h.exists ? 'x' : ' '}] ${h.name}.js - ${getIcon(h)} ${getStatus(h)}`).join('\n')}

---

## 驗證歷史

| 日期 | 通過 | 失敗 | 狀態 |
|------|------|------|------|
| ${now} | ${verification.passed} | ${verification.failed} | ${verification.success ? '✅' : '❌'} |

---

## 章節對應追蹤

| 章節 | 組件實作 | 進度 |
|------|----------|------|
| Ch1 協調引擎 | architect, developer, explorer, task-decomposition | 🔲 |
| Ch2 閉環驗證 | reviewer, tester, verification-protocol | 🔲 |
| Ch3 狀態管理 | (P1: checkpoint-manager) | - |
| Ch4 錯誤恢復 | (P1: error-recovery) | - |
| Ch5 記憶系統 | (P1: memory-manager) | - |
| Ch6 資源管理 | budget-tracker, PreToolUse hook | 🔲 |
| Ch7 可觀測性 | /status, PostToolUse hook | 🔲 |
| Ch8 自主等級 | CLAUDE.md 規則 | 🔲 |
| Ch9 安全權限 | permission-guard.js, reviewer | 🔲 |
| Ch10 方法論 | spec-generator, /spec, /verify | 🔲 |

---

## 下一步

${verification.success
  ? '- [ ] 補充 skill 實際邏輯\n- [ ] 強化 hook 功能\n- [ ] 建立 P1 plugins'
  : '- [ ] 修復驗證失敗的項目'}

---

## vibe-engine-guarantee (P1)
（待 core 完成後規劃）

## vibe-engine-memory (P1)
（待 core 完成後規劃）

## vibe-engine-learning (P2)
（待 P1 完成後規劃）
`;
}

/**
 * 主函數
 */
async function main() {
  // 檢查是否從 stdin 接收 hook input
  let hookInput = null;

  if (!process.stdin.isTTY) {
    let input = '';
    process.stdin.setEncoding('utf8');

    await new Promise((resolve) => {
      process.stdin.on('data', (chunk) => { input += chunk; });
      process.stdin.on('end', () => {
        try {
          hookInput = JSON.parse(input);
        } catch (e) {
          // 不是 JSON，可能是直接呼叫
        }
        resolve();
      });
    });
  }

  // 執行驗證
  console.error('[Auto Progress] Running verification...');
  const verification = runVerification();

  // 檢查組件狀態
  console.error('[Auto Progress] Checking components...');
  const components = checkComponents();

  // 生成並寫入 PROGRESS.md
  const progressContent = generateProgressMd(verification, components);

  try {
    fs.writeFileSync(PROGRESS_FILE, progressContent, 'utf8');
    console.error(`[Auto Progress] Updated ${PROGRESS_FILE}`);
  } catch (error) {
    console.error(`[Auto Progress] Failed to update: ${error.message}`);
  }

  // 如果是 hook 呼叫，輸出 hook response
  if (hookInput) {
    const output = {
      continue: true,
      suppressOutput: false,
      systemMessage: `[Auto Progress] Verification: ${verification.passed} passed, ${verification.failed} failed. PROGRESS.md updated.`
    };
    console.log(JSON.stringify(output));
  } else {
    // 直接呼叫，輸出摘要
    console.log('\n=== Auto Progress Summary ===');
    console.log(`Verification: ${verification.success ? 'PASS' : 'FAIL'}`);
    console.log(`Passed: ${verification.passed}, Failed: ${verification.failed}`);
    console.log(`Progress file: ${PROGRESS_FILE}`);
  }
}

main().catch(console.error);
