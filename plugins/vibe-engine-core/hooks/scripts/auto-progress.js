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
    hooks: ['session-init', 'prompt-classifier', 'permission-guard', 'result-logger', 'completion-check', 'state-saver', 'task-decomposition-engine', 'budget-tracker-engine', 'verification-engine', 'agent-router']
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
 * 生成進度摘要報告
 */
function generateProgressReport(verification, components) {
  // 計算統計
  const stats = {
    agents: { total: components.agents.length, done: components.agents.filter(a => a.hasContent).length, scaffold: components.agents.filter(a => a.exists && !a.hasContent).length },
    skills: { total: components.skills.length, done: components.skills.filter(s => s.hasContent).length, scaffold: components.skills.filter(s => s.exists && !s.hasContent).length },
    commands: { total: components.commands.length, done: components.commands.filter(c => c.hasContent).length, scaffold: components.commands.filter(c => c.exists && !c.hasContent).length },
    hooks: { total: components.hooks.length, done: components.hooks.filter(h => h.hasContent).length, scaffold: components.hooks.filter(h => h.exists && !h.hasContent).length }
  };

  const totalDone = stats.agents.done + stats.skills.done + stats.commands.done + stats.hooks.done;
  const totalScaffold = stats.agents.scaffold + stats.skills.scaffold + stats.commands.scaffold + stats.hooks.scaffold;
  const totalComponents = stats.agents.total + stats.skills.total + stats.commands.total + stats.hooks.total;

  // 計算兩種完成度
  // 結構完成度 = 所有檔案都有內容
  const structurePercent = Math.round(totalDone / totalComponents * 100);
  // 功能完成度 = 只計算可執行組件 (hooks)，其他為文檔指南
  const functionalComponents = stats.hooks.done; // 只有 hooks 是真正可執行的
  const functionalTotal = stats.hooks.total;
  const functionalPercent = Math.round(functionalComponents / functionalTotal * 100);

  // 找出需要補充的組件
  const needsWork = [];
  components.agents.filter(a => a.exists && !a.hasContent).forEach(a => needsWork.push(`agents/${a.name}.md`));
  components.skills.filter(s => s.exists && !s.hasContent).forEach(s => needsWork.push(`skills/${s.name}`));
  components.commands.filter(c => c.exists && !c.hasContent).forEach(c => needsWork.push(`commands/${c.name}.md`));
  components.hooks.filter(h => h.exists && !h.hasContent).forEach(h => needsWork.push(`hooks/${h.name}.js`));

  // 生成報告
  const lines = [
    '',
    '╔══════════════════════════════════════════════════╗',
    '║          Vibe Engine Session Summary             ║',
    '╠══════════════════════════════════════════════════╣',
    `║ 驗證結果: ${verification.success ? '✅ PASS' : '❌ FAIL'} (${verification.passed}/${verification.passed + verification.failed})`,
    '╠══════════════════════════════════════════════════╣',
    '║ 完成度                                           ║',
    `║ ├─ 結構: ${structurePercent}% (${totalDone}/${totalComponents} 檔案有內容)`,
    `║ └─ 功能: ${functionalPercent}% (${functionalComponents}/${functionalTotal} hooks 可執行)`,
    '╠══════════════════════════════════════════════════╣',
    '║ 組件狀態                                         ║',
    `║ ├─ Agents:   ${stats.agents.done}/${stats.agents.total} 文檔${stats.agents.scaffold > 0 ? ` (${stats.agents.scaffold} 待補)` : ''}`,
    `║ ├─ Skills:   ${stats.skills.done}/${stats.skills.total} 指南${stats.skills.scaffold > 0 ? ` (${stats.skills.scaffold} 待補)` : ''}`,
    `║ ├─ Commands: ${stats.commands.done}/${stats.commands.total} 文檔${stats.commands.scaffold > 0 ? ` (${stats.commands.scaffold} 待補)` : ''}`,
    `║ └─ Hooks:    ${stats.hooks.done}/${stats.hooks.total} 可執行${stats.hooks.scaffold > 0 ? ` (${stats.hooks.scaffold} 待補)` : ''}`,
  ];

  if (needsWork.length > 0 && needsWork.length <= 5) {
    lines.push('╠══════════════════════════════════════════════════╣');
    lines.push('║ 待補充                                           ║');
    needsWork.forEach(item => lines.push(`║ └─ ${item}`));
  }

  // 核心引擎狀態
  const engines = [
    { name: 'Task Decomposition Engine', file: 'task-decomposition-engine.js', desc: '自動分解任務' },
    { name: 'Budget Tracker Engine', file: 'budget-tracker-engine.js', desc: 'Token 追蹤' },
    { name: 'Verification Engine', file: 'verification-engine.js', desc: '自動化驗證' },
    { name: 'Agent Router', file: 'agent-router.js', desc: '根據分類派發 Task' }
  ];

  const engineStatus = engines.map(e => {
    const filePath = path.join(PLUGIN_ROOT, 'hooks/scripts', e.file);
    const exists = fs.existsSync(filePath);
    let hasContent = false;
    if (exists) {
      const content = fs.readFileSync(filePath, 'utf8');
      hasContent = content.length > 500 && (content.match(/TODO/g) || []).length < 3;
    }
    return { ...e, exists, hasContent, status: hasContent ? '✅' : '⬜' };
  });

  const pendingEngines = engineStatus.filter(e => !e.hasContent);
  const completedEngines = engineStatus.filter(e => e.hasContent);

  lines.push('╠══════════════════════════════════════════════════╣');
  lines.push('║ 核心引擎                                         ║');

  for (let i = 0; i < engineStatus.length; i++) {
    const e = engineStatus[i];
    const prefix = i === engineStatus.length - 1 ? '└─' : '├─';
    const statusIcon = e.hasContent ? '✅' : '⬜';
    lines.push(`║ ${prefix} ${statusIcon} ${e.name.padEnd(25)} (${e.desc})`.slice(0, 54) + '║');
  }

  lines.push('╠══════════════════════════════════════════════════╣');
  lines.push('║ 可用命令                                         ║');
  lines.push('║ ├─ /status  查看系統狀態                         ║');
  lines.push('║ ├─ /verify  執行驗證協議                         ║');
  lines.push('║ ├─ /budget  查看預算使用                         ║');
  lines.push('║ └─ /spec    生成規格檔案                         ║');
  lines.push('╠══════════════════════════════════════════════════╣');
  lines.push('║ 下一步建議                                       ║');

  if (!verification.success) {
    lines.push('║ └─ 修復驗證失敗的項目                            ║');
  } else if (totalScaffold > 0) {
    lines.push('║ ├─ 補充 skill 實際邏輯                           ║');
    lines.push('║ └─ 在其他專案測試載入                            ║');
  } else if (pendingEngines.length > 0) {
    const nextEngine = pendingEngines[0];
    lines.push(`║ ├─ 實作 ${nextEngine.name}`.padEnd(53) + '║');
    lines.push('║ ├─ 建立 P1 plugins (guarantee, memory)           ║');
    lines.push('║ └─ 在其他專案測試載入                            ║');
  } else {
    lines.push('║ ├─ 建立 P1 plugins (guarantee, memory)           ║');
    lines.push('║ ├─ 在其他專案測試載入                            ║');
    lines.push(`║ └─ 🎉 Core engines complete (${completedEngines.length}/4)`.padEnd(53) + '║');
  }

  lines.push('╚══════════════════════════════════════════════════╝');
  lines.push('');
  lines.push('📄 進度已更新: docs/PROGRESS.md');
  lines.push('');

  return lines.join('\n');
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

  // 生成進度報告
  const progressReport = generateProgressReport(verification, components);

  // 如果是 hook 呼叫，輸出 hook response
  if (hookInput) {
    const output = {
      continue: true,
      suppressOutput: false,
      systemMessage: progressReport
    };
    console.log(JSON.stringify(output));
  } else {
    // 直接呼叫，輸出報告
    console.log(progressReport);
  }
}

main().catch(console.error);
