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
const { readHookInput, writeHookOutput } = require('./lib/hook-io');
const { createBoxedReport, formatKeyValue, formatTree, formatStatusIcon } = require('./lib/report-formatter');

// 配置
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../..');
const PROJECT_ROOT = path.join(PLUGIN_ROOT, '../..');
const PROGRESS_FILE = path.join(PROJECT_ROOT, 'docs/PROGRESS.md');
const VERIFY_SCRIPT = path.join(PROJECT_ROOT, 'scripts/verify-plugin.sh');

/**
 * 檢測是否在 plugin 開發專案中
 */
function isPluginDevProject() {
  // 檢查是否存在 vibe-engine 專案標記
  const markers = [
    path.join(PROJECT_ROOT, 'plugins/vibe-engine-core'),
    path.join(PROJECT_ROOT, '.claude-plugin/marketplace.json'),
    path.join(PROJECT_ROOT, 'docs/SPEC.md')
  ];

  return markers.some(marker => fs.existsSync(marker));
}

/**
 * 執行驗證腳本
 */
function runVerification() {
  // 如果不在 plugin 開發專案中，跳過驗證
  if (!isPluginDevProject()) {
    return {
      success: true,
      passed: 0,
      failed: 0,
      skipped: true,
      reason: 'Not in plugin development project'
    };
  }

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
 * 生成進度摘要報告（使用 lib/report-formatter）
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

  const structurePercent = Math.round(totalDone / totalComponents * 100);
  const functionalPercent = Math.round(stats.hooks.done / stats.hooks.total * 100);

  // 核心引擎狀態
  const engines = [
    { name: 'Task Decomposition', file: 'task-decomposition-engine.js' },
    { name: 'Budget Tracker', file: 'budget-tracker-engine.js' },
    { name: 'Verification Engine', file: 'verification-engine.js' },
    { name: 'Agent Router', file: 'agent-router.js' }
  ].map(e => {
    const filePath = path.join(PLUGIN_ROOT, 'hooks/scripts', e.file);
    const exists = fs.existsSync(filePath);
    const hasContent = exists && fs.readFileSync(filePath, 'utf8').length > 500;
    return { ...e, hasContent };
  });

  const completedEngines = engines.filter(e => e.hasContent).length;

  // 建立區段
  const sections = [];

  // 驗證結果區段
  const verifyStatus = verification.skipped
    ? '⏭️ SKIPPED (非 plugin 開發專案)'
    : `${formatStatusIcon(verification.success ? 'pass' : 'fail')} ${verification.success ? 'PASS' : 'FAIL'} (${verification.passed}/${verification.passed + verification.failed})`;
  sections.push({ title: null, lines: [formatKeyValue('驗證結果', verifyStatus)] });

  // 完成度區段
  sections.push({
    title: '完成度',
    lines: formatTree([
      { label: '結構', value: `${structurePercent}% (${totalDone}/${totalComponents})` },
      { label: '功能', value: `${functionalPercent}% (${stats.hooks.done}/${stats.hooks.total} hooks)`, isLast: true }
    ])
  });

  // 組件狀態區段
  const formatStat = (s, suffix) => `${s.done}/${s.total} ${suffix}${s.scaffold > 0 ? ` (${s.scaffold} 待補)` : ''}`;
  sections.push({
    title: '組件狀態',
    lines: formatTree([
      { label: 'Agents', value: formatStat(stats.agents, '文檔') },
      { label: 'Skills', value: formatStat(stats.skills, '指南') },
      { label: 'Commands', value: formatStat(stats.commands, '文檔') },
      { label: 'Hooks', value: formatStat(stats.hooks, '可執行'), isLast: true }
    ])
  });

  // 核心引擎區段
  sections.push({
    title: '核心引擎',
    lines: formatTree(engines.map((e, i) => ({
      label: e.name,
      value: e.hasContent ? '✅' : '⬜',
      isLast: i === engines.length - 1
    })))
  });

  // 可用命令區段
  sections.push({
    title: '可用命令',
    lines: formatTree([
      { label: '/status', value: '查看系統狀態' },
      { label: '/verify', value: '執行驗證協議' },
      { label: '/budget', value: '查看預算使用' },
      { label: '/spec', value: '生成規格檔案', isLast: true }
    ])
  });

  // 下一步建議區段
  let nextSteps;
  if (!verification.success) {
    nextSteps = ['修復驗證失敗的項目'];
  } else if (completedEngines === 4) {
    nextSteps = ['建立 P1 plugins', '在其他專案測試', `🎉 Core complete (${completedEngines}/4)`];
  } else {
    nextSteps = ['補充 skill 邏輯', '建立 P1 plugins', '在其他專案測試'];
  }
  sections.push({
    title: '下一步建議',
    lines: formatTree(nextSteps.map((s, i) => ({ label: s, value: '', isLast: i === nextSteps.length - 1 })))
  });

  return '\n' + createBoxedReport('Vibe Engine Session Summary', sections) + '\n📄 進度已更新: docs/PROGRESS.md\n';
}

/**
 * 主函數
 */
async function main() {
  // 使用 lib/hook-io 讀取輸入
  const { isHook } = await readHookInput();

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
  if (isHook) {
    writeHookOutput({
      continue: true,
      suppressOutput: false,
      systemMessage: progressReport
    });
  } else {
    console.log(progressReport);
  }
}

main().catch(console.error);
