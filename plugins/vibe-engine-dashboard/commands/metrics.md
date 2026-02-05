---
name: metrics
description: 顯示 session 指標摘要（工具調用、成功率、耗時）
arguments:
  - name: detail
    description: 顯示詳細分析 (--detail)
    required: false
---

# /metrics

## 概述

顯示當前 session 的指標摘要，包含工具調用統計、成功率、平均耗時。

## 使用方式

```bash
/metrics           # 基本摘要
/metrics --detail  # 詳細分析
```

## 輸出格式

### 基本摘要

```
╔══════════════════════════════════════════╗
║           Session Metrics                ║
╠══════════════════════════════════════════╣
║ Duration: 15m 32s                        ║
║ Tool Calls: 42                           ║
║   - Read: 18 (avg 45ms)                  ║
║   - Edit: 8 (avg 120ms)                  ║
║   - Bash: 6 (avg 1.8s)                   ║
║   - Task: 4 (avg 12s)                    ║
║   - Other: 6                             ║
║                                          ║
║ Success Rate: 95% (40/42)                ║
║ Errors: 2 (recovered: 2)                 ║
║                                          ║
║ Token Usage: 45,200 / 100,000 (45%)      ║
║ Cost: $0.58 / $1.00 (58%)                ║
╚══════════════════════════════════════════╝
```

### 詳細分析（--detail）

```
╔══════════════════════════════════════════╗
║        Session Metrics (Detail)          ║
╠══════════════════════════════════════════╣
║ Duration: 15m 32s                        ║
╠══════════════════════════════════════════╣
║ Tool Breakdown                           ║
║ ──────────────                           ║
║ Read     │ 18 calls │ avg 45ms  │ ✓ 100% ║
║ Edit     │  8 calls │ avg 120ms │ ✓ 100% ║
║ Bash     │  6 calls │ avg 1.8s  │ ✓ 83%  ║
║ Task     │  4 calls │ avg 12s   │ ✓ 100% ║
║ Write    │  3 calls │ avg 80ms  │ ✓ 100% ║
║ Grep     │  2 calls │ avg 30ms  │ ✓ 100% ║
║ Glob     │  1 call  │ avg 25ms  │ ✓ 100% ║
╠══════════════════════════════════════════╣
║ Error Analysis                           ║
║ ──────────────                           ║
║ Bash: 1 error (timeout)                  ║
║   → Recovered via retry                  ║
╠══════════════════════════════════════════╣
║ Resource Usage                           ║
║ ──────────────                           ║
║ Tokens: 45,200 / 100,000 (45%)           ║
║ ▓▓▓▓▓░░░░░░░░░░░░░░░                     ║
║ Cost: $0.58 / $1.00 (58%)                ║
║ ▓▓▓▓▓▓░░░░░░░░░░░░░░                     ║
╚══════════════════════════════════════════╝
```

## 執行邏輯

當用戶執行 `/metrics` 時：

### 步驟 1: 讀取指標數據

```javascript
const { MetricsStore } = require('./hooks/scripts/lib/metrics-store');
const store = new MetricsStore();
const metrics = store.getSessionMetrics();
```

### 步驟 2: 計算統計

```javascript
const stats = {
  duration: calculateDuration(metrics.startTime),
  totalCalls: metrics.length,
  byTool: groupByTool(metrics),
  successRate: calculateSuccessRate(metrics),
  errors: getErrors(metrics),
  budget: readBudget()
};
```

### 步驟 3: 渲染輸出

```javascript
const { renderMetrics } = require('./hooks/scripts/lib/renderer');
const output = args.detail
  ? renderMetrics(stats, { detail: true })
  : renderMetrics(stats);
console.log(output);
```

## 指標計算

| 指標 | 計算方式 |
|------|----------|
| Duration | 當前時間 - session 開始時間 |
| Success Rate | 成功數 / 總調用數 × 100% |
| Avg Duration | 各工具總耗時 / 調用次數 |
| Errors | tool_response.is_error === true |

## 相關命令

- `/dashboard` - 即時狀態面板
- `/budget` - 預算詳情
- `/status` - 系統狀態

## 對應 Lib

- `hooks/scripts/lib/metrics-store.js` - MetricsStore
- `hooks/scripts/lib/renderer.js` - renderMetrics()
