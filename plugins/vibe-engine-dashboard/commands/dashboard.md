---
name: dashboard
description: 顯示 Vibe Engine 即時系統狀態面板
arguments: []
---

# /dashboard

## 概述

顯示 Vibe Engine 即時系統狀態面板，包含 Agent 狀態、資源使用、最近活動。

## 使用方式

```bash
/dashboard
```

## 輸出格式

```
╔═══════════════════════════════════════════════════════════════╗
║  VIBE ENGINE DASHBOARD                           v0.6.4  L2  ║
╠═══════════════════════════════════════════════════════════════╣
║  📋 Task: [當前任務名稱]                                       ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━ XX% ━━━━━                        ║
╠═══════════════════┬═══════════════════┬═══════════════════════╣
║  Agent Status     │  Resources        │  Recent Activity      ║
║  ─────────────    │  ─────────        │  ────────────────     ║
║  🟢 Architect Done│  Tokens: XXK/100K │  [HH:MM] Tool ✓ XXms  ║
║  🟡 Developer Work│  ▓▓▓▓░░░░░░ XX%   │  [HH:MM] Tool ✓ XXs   ║
║  ⚪ Tester   Wait │  Cost: $X.XX/$X   │  [HH:MM] Tool ✓ XXms  ║
║  ⚫ Reviewer Pend │  ▓▓▓▓▓▓░░░░ XX%   │  [HH:MM] Tool ✓ XXs   ║
╠═══════════════════┴═══════════════════┴═══════════════════════╣
║  🟢 System OK │ Context: XX% │ Memory: X items │ Tools: XX    ║
╚═══════════════════════════════════════════════════════════════╝
```

## 執行邏輯

當用戶執行 `/dashboard` 時：

### 步驟 1: 收集數據

```javascript
// 從各來源讀取數據
const taskState = readTaskState();      // .vibe-engine/task-state.yaml
const budget = readBudget();            // .vibe-engine/budget.json
const logs = readRecentLogs(5);         // .vibe-engine/logs/*.jsonl
const metrics = readSessionMetrics();   // .vibe-engine/metrics/session.jsonl
const memory = getMemoryStats();        // .vibe-engine/memory/
```

### 步驟 2: 計算指標

```javascript
const data = {
  version: '0.6.4',
  autonomyLevel: 'L2',
  currentTask: taskState.current_task || 'No active task',
  progress: calculateProgress(taskState),
  agents: getAgentStatuses(),
  resources: {
    tokens: { used: budget.tokens_used, limit: budget.tokens_limit },
    cost: { used: budget.cost_used, limit: budget.cost_limit }
  },
  recentLogs: logs.slice(0, 5),
  status: determineSystemStatus()
};
```

### 步驟 3: 渲染輸出

```javascript
const { renderDashboard } = require('./hooks/scripts/lib/renderer');
const output = renderDashboard(data);
console.log(output);
```

## 數據來源

| 區塊 | 來源 |
|------|------|
| Task | .vibe-engine/task-state.yaml |
| Resources | .vibe-engine/budget.json |
| Logs | .vibe-engine/logs/*.jsonl |
| Memory | .vibe-engine/memory/ |

## Agent 狀態圖示

| 狀態 | 圖示 | 說明 |
|------|------|------|
| Completed | 🟢 | 已完成 |
| Working | 🟡 | 進行中 |
| Waiting | ⚪ | 等待中 |
| Pending | ⚫ | 未開始 |

## 相關命令

- `/metrics` - 詳細指標摘要
- `/status` - 簡化狀態顯示
- `/budget` - 預算詳情

## 對應 Lib

- `hooks/scripts/lib/renderer.js` - renderDashboard()
- `hooks/scripts/lib/metrics-store.js` - MetricsStore
