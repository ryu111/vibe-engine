---
name: dashboard-renderer
description: TUI 面板渲染技能，用於生成美觀的終端輸出
version: 0.1.0
triggers:
  - "render dashboard"
  - "display metrics"
  - "show status panel"
---

# Dashboard Renderer

## 用途

渲染 TUI 面板，生成美觀的終端輸出。使用 Box Drawing 字符和 ANSI 顏色碼。

## 渲染元素

### Box Drawing 字符

```
╔═══╗  ┌───┐  ╭───╮
║   ║  │   │  │   │
╠═══╣  ├───┤  ├───┤
║   ║  │   │  │   │
╚═══╝  └───┘  ╰───╯
```

### 進度條

```
▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  50%
━━━━━━━━━━╋─────────   50%
████████████░░░░░░░░  60%
```

### 狀態圖示

| 圖示 | 用途 |
|------|------|
| 🟢 | 成功/完成 |
| 🟡 | 進行中/警告 |
| 🔴 | 錯誤/失敗 |
| ⚪ | 等待/未開始 |
| ⚫ | 停用/待定 |
| ✓ | 成功 |
| ✗ | 失敗 |

## 核心函數

### renderDashboard(data)

渲染完整 dashboard 面板。

```javascript
function renderDashboard(data) {
  return [
    drawHeader(data.version, data.autonomyLevel),
    drawTaskProgress(data.currentTask, data.progress),
    drawThreeColumns(data.agents, data.resources, data.logs),
    drawFooter(data.status)
  ].join('\n');
}
```

### renderMetrics(stats, options)

渲染指標摘要。

```javascript
function renderMetrics(stats, options = {}) {
  const lines = [];
  lines.push(drawBox('Session Metrics', [
    `Duration: ${stats.duration}`,
    `Tool Calls: ${stats.totalCalls}`,
    ...formatToolBreakdown(stats.byTool),
    '',
    `Success Rate: ${stats.successRate}`,
    ...formatErrors(stats.errors),
    '',
    formatBudget(stats.budget)
  ]));
  return lines.join('\n');
}
```

### drawProgressBar(current, total, width)

繪製進度條。

```javascript
function drawProgressBar(current, total, width = 20) {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty) + ` ${percent}%`;
}
```

## 輸出規範

- 寬度：60-80 字符（標準）
- 對齊：左對齊，數字右對齊
- 顏色：僅用於強調，不依賴顏色傳達資訊
- 無障礙：確保純文字模式可讀

## 對應 Lib

- `hooks/scripts/lib/renderer.js` - 完整實作
