# Routing Progress Tracker

## 概述

PostToolUse hook，自動追蹤 Task tool 執行進度並更新 routing-state.json。

## 功能

1. 監聽 Task tool 執行結果
2. 根據 agent 類型匹配對應的 routing 任務
3. 成功 → 標記任務為 `completed`
4. 失敗 → 標記任務為 `failed` 並記錄錯誤訊息
5. 所有任務完成 → 標記整體計劃為 `completed`

## 工作流程

```
PostToolUse (Task) → 解析 agent 名稱 → 匹配任務 → 更新狀態 → 檢查完成度
```

## 觸發條件

- Hook 類型：PostToolUse
- Tool 名稱：Task
- 需要：活躍的 routing-state（由 agent-router 建立）

## 輸出格式

### 任務完成

```json
{
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "[Routing Progress] Task task-001 marked as completed.",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "[Routing Progress] Task task-001 marked as completed."
  }
}
```

### 所有任務完成

```json
{
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "[Routing Progress] Task task-003 marked as completed. All tasks completed. Routing plan finished.",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "[Routing Progress] Task task-003 marked as completed. All tasks completed. Routing plan finished."
  }
}
```

### 任務失敗

```json
{
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "[Routing Progress] Task task-002 marked as failed.",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "[Routing Progress] Task task-002 marked as failed."
  }
}
```

## Agent 匹配規則

1. 從 `hookInput.tool_input.subagent_type` 提取 agent 名稱
2. 支援格式：
   - `vibe-engine-core:developer` → `developer`
   - `developer` → `developer`
3. 不區分大小寫
4. 匹配第一個 `pending` 或 `executing` 狀態的同名 agent 任務

## 狀態更新

使用 `RoutingStateManager` API：

- `markTaskCompleted(taskId)` - 標記任務完成
- `markTaskFailed(taskId, error)` - 標記任務失敗
- `markPlanCompleted()` - 標記整體計劃完成

## 錯誤處理

- Fail-safe 設計：錯誤時不阻擋執行
- 無活躍計劃 → 靜默放行
- 無匹配任務 → 靜默放行
- 非 Task tool → 靜默放行

## 測試

- 單元測試：`__tests__/routing-progress-tracker.test.js` (20 個測試)
- 整合測試：`__tests__/routing-progress-integration.test.js` (5 個場景)

## 對應章節

- Ch1 協調引擎 - 自動路由
- Ch7 可觀測性 - 進度追蹤

## 配合使用

- 前置：`agent-router.js` (建立 routing-state)
- 後續：`routing-completion-validator.js` (Stop hook 驗證完成度)
- 依賴：`lib/routing-state-manager.js`
