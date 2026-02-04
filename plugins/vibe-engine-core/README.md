# Vibe Engine Core

> Vibe Engineering 工作流的核心協調引擎

## 概述

vibe-engine-core 是 Vibe Engine 的核心模組，提供多代理協調、任務分解、驗證協議等基礎能力。

## 功能

### Agents（5 個）

| Agent | 用途 | Model |
|-------|------|-------|
| architect | 架構設計、技術決策 | opus |
| developer | 代碼實現 | sonnet |
| reviewer | 代碼審查、安全檢查 | sonnet |
| tester | 測試撰寫、執行驗證 | sonnet |
| explorer | 代碼搜尋、快速分析 | haiku |

### Skills（5 個）

| Skill | 對應章節 | 用途 |
|-------|----------|------|
| task-decomposition | Ch1 協調引擎 | 將複雜任務分解為可並行的子任務 |
| spec-generator | Ch10 方法論 | 從自然語言生成結構化規格 |
| verification-protocol | Ch2 驗證機制 | 執行多層驗證協議 |
| budget-tracker | Ch6 資源管理 | 追蹤 token/成本預算 |
| iterative-retrieval | Ch17 進階模式 | 漸進式 context 收集 |

### Hooks（7 個事件）

| Event | 用途 |
|-------|------|
| SessionStart | 載入專案上下文、初始化運行時 |
| UserPromptSubmit | 分類請求、決定路由 |
| PreToolUse | 權限檢查、預算檢查 |
| PostToolUse | 結果記錄、驗證 |
| Stop | 完成檢查、記憶固化 |
| PreCompact | 保存關鍵狀態 |

### Commands（4 個）

| Command | 用途 |
|---------|------|
| /status | 顯示系統狀態 |
| /spec | 生成規格檔案 |
| /verify | 執行驗證協議 |
| /budget | 查詢預算使用情況 |

## 安裝

```bash
# 從其他專案載入
claude --plugin-dir /path/to/vibe-engine/plugins/vibe-engine-core

# 或複製到全域 plugins
cp -r . ~/.claude/plugins/vibe-engine-core
```

## 依賴

此 plugin 是 Vibe Engine 的核心，其他擴展 plugins 都依賴它：

- vibe-engine-guarantee（驗證擴展）
- vibe-engine-memory（記憶擴展）
- vibe-engine-learning（學習擴展）

## 研究章節對應

| 章節 | 實作組件 |
|------|----------|
| Ch1 協調引擎 | architect, developer, explorer, task-decomposition |
| Ch2 閉環驗證 | reviewer, tester, verification-protocol |
| Ch6 資源管理 | budget-tracker, PreToolUse hook |
| Ch7 可觀測性 | /status, PostToolUse hook |
| Ch9 安全權限 | PreToolUse hook, reviewer |
| Ch10 方法論 | spec-generator, /spec, /verify |
| Ch17 進階模式 | iterative-retrieval |
