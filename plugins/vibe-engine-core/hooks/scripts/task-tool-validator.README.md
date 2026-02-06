# Task Tool Validator

## 概述

`task-tool-validator.js` 是一個 PreToolUse hook，用於驗證 Task tool 呼叫的 `subagent_type` 參數是否符合當前的路由計劃。

## 功能

1. **攔截 Task tool 呼叫** - 只處理 `tool_name === 'Task'` 的情況
2. **讀取路由計劃** - 從 `.vibe-engine/routing-state.json` 取得當前活躍的任務分配
3. **驗證 agent 類型** - 比對 `subagent_type` 是否在預期的 agent 列表中
4. **阻止不匹配** - 當 agent 不匹配時，拒絕執行並提供正確的使用方式

## 使用場景

### 允許執行 (allow)

- 非 Task tool 的呼叫
- 沒有活躍的路由計劃
- 路由計劃已完成 (`status: 'completed'`)
- `subagent_type` 匹配路由計劃中的 agent
- Task tool 未指定 `subagent_type`

### 拒絕執行 (deny)

- 有活躍路由計劃 (`status: 'pending' | 'in_progress'`)
- `subagent_type` 不在預期的 agent 列表中

## 範例

### 情境 1：無路由計劃

```bash
# Input
{"tool_name":"Task","tool_input":{"subagent_type":"developer","prompt":"implement feature"}}

# Output
{"continue":true,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}
```

### 情境 2：匹配路由計劃

```json
// routing-state.json
{
  "planId": "route-123",
  "status": "in_progress",
  "phases": [{
    "tasks": [
      {"agent": "developer", "status": "pending"}
    ]
  }]
}
```

```bash
# Input
{"tool_name":"Task","tool_input":{"subagent_type":"vibe-engine-core:developer","prompt":"implement"}}

# Output
{"continue":true,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}
```

### 情境 3：不匹配路由計劃

```bash
# Input (architect 不在計劃中)
{"tool_name":"Task","tool_input":{"subagent_type":"architect","prompt":"design"}}

# Output
{
  "continue": false,
  "suppressOutput": false,
  "systemMessage": "╔═══...Agent Type Mismatch...╗\n預期使用: [developer]\n實際使用: architect",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Agent mismatch: architect not in expected [developer]"
  }
}
```

## agent type 格式支援

Hook 支援多種 `subagent_type` 格式：

- `"developer"` → 解析為 `developer`
- `"vibe-engine-core:developer"` → 解析為 `developer`
- `"  Architect  "` → 解析為 `architect` (trim + lowercase)

## 路由狀態結構

Hook 讀取 `.vibe-engine/routing-state.json`：

```json
{
  "planId": "route-xxx",
  "status": "pending" | "in_progress" | "completed" | "failed" | "cancelled",
  "phases": [
    {
      "phase": 1,
      "tasks": [
        {
          "id": "task-1",
          "agent": "developer",
          "description": "實作功能",
          "status": "pending" | "executing" | "completed" | "failed" | "skipped"
        }
      ]
    }
  ]
}
```

只有 `status === 'pending' || status === 'executing'` 的任務會被納入預期 agent 列表。

## 錯誤處理

- **fail-safe 設計** - 任何錯誤情況下預設 `allow`
- **錯誤訊息** - 包含在 `systemMessage` 中，並註明原因

## 測試

```bash
# 單元測試
node plugins/vibe-engine-core/hooks/scripts/__tests__/task-tool-validator.test.js

# E2E 測試（場景 V）
node plugins/vibe-engine-core/hooks/scripts/__tests__/e2e-collaboration.test.js
```

## 對應章節

- **Ch1 協調引擎** - Star Topology, Router Not Executor
- **SPEC.md** - 路由機制設計

## 相關 Hook

- `routing-enforcer.js` - 阻止 main agent 直接使用 Write/Edit/Bash
- `routing-completion-validator.js` - Stop hook 檢查路由計劃完成度
- `agent-router.js` - UserPromptSubmit hook 建立路由計劃
