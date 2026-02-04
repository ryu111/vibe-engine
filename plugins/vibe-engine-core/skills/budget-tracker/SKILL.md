---
name: budget-tracker
description: This skill should be used when the user asks to "check budget", "track tokens", "monitor cost", "view usage", or when making decisions about model selection and resource allocation. Provides token and cost budget tracking with automatic model routing.
version: 0.1.0
---

# Budget Tracker

## 用途

追蹤和管理 token/成本預算，在資源緊張時自動調整策略。支援預算警報、模型路由、和優雅降級。

## 核心流程

1. **初始化預算** - 從配置載入預算限制
2. **追蹤使用** - 記錄每次 API 調用的 token 消耗
3. **計算剩餘** - 更新剩餘預算和使用率
4. **觸發警報** - 在閾值時發出警告
5. **調整策略** - 根據預算自動選擇模型

## 預算類型

| 類型 | 說明 | 追蹤方式 |
|------|------|----------|
| tokens | 按模型分別追蹤 | 每次 API 調用 |
| cost | 美元計價 | 根據模型價格計算 |
| time | 任務執行時間 | 計時器 |
| operations | 檔案編輯/命令執行次數 | 計數器 |

## 預算配置

```yaml
# .vibe-engine/config.yaml
budget:
  tokens:
    per_task:
      simple: 20000
      moderate: 50000
      complex: 150000
  cost:
    per_task: $1.00
    per_day: $20.00
  reserves:
    memory_injection: 0.15  # 15%
    verification: 0.20       # 20%
```

## 警報等級

| 使用率 | 等級 | 行為 |
|--------|------|------|
| 70% | 警告 | 考慮降級模型 |
| 90% | 緊急 | 創建 checkpoint，準備暫停 |
| 100% | 暫停 | 停止任務，詢問用戶 |

## 模型路由

根據預算和任務複雜度自動選擇模型：

| 條件 | 選擇模型 |
|------|----------|
| 預算充足 + 複雜任務 | Opus |
| 預算緊張 OR 中等任務 | Sonnet |
| 預算不足 OR 簡單任務 | Haiku |

## 重要規則

- 預算追蹤是強制性的，不能關閉
- 安全相關操作不受預算限制
- 驗證預留 20% 預算，不可佔用
- 預算用盡時必須暫停，不能繼續

## 快速參考

| 場景 | 行為 |
|------|------|
| 預算充足 | 正常執行 |
| 預算 70% | 降級到 Sonnet |
| 預算 90% | 創建 checkpoint |
| 預算 100% | 暫停並詢問 |

## 輸出格式

<!-- TODO: 細化輸出格式 -->

```yaml
budget_report:
  task_id: "[task-id]"
  usage:
    tokens:
      used: 45000
      limit: 50000
      percentage: "90%"
    cost:
      used: "$0.85"
      limit: "$1.00"
  model_routing:
    current: "sonnet"
    reason: "Budget at 90%, downgraded from opus"
  alerts:
    - level: "warning"
      message: "Budget at 90%, consider completing soon"
  recommendations:
    - "[建議的下一步]"
```

## 更多資訊

- 資源管理策略見 [06-resources.md](../../../../docs/research/06-resources.md)
