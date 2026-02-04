---
name: iterative-retrieval
description: ⛔ MANDATORY when SubAgent needs to understand unfamiliar code OR context is insufficient for task. MUST complete context gathering BEFORE starting implementation. CRITICAL - context 不足禁止直接實作。
version: 0.1.0
---

# Iterative Retrieval

## 用途

為 SubAgents 提供漸進式 context 收集，解決「不知道需要什麼就無法搜索」的問題。通過多輪迭代逐步精煉 context，直到有足夠資訊完成任務。

## ⛔ MANDATORY: 觸發條件

以下情況 **MUST** 使用此 skill：
- SubAgent 首次接觸某模組
- 任務涉及不熟悉的代碼區域
- 初次搜索結果不足以理解問題
- 用戶說「探索」、「了解」、「收集 context」

⛔ BLOCK: Context 不足就開始實作，禁止。

## ⛔ MANDATORY: 每輪迭代 Checkpoint

每次迭代後 **MUST** 輸出：
```
[CHECKPOINT] Retrieval Iteration N/3
├─ 策略：broad_search | targeted_search | precise_lookup
├─ 搜索詞：[queries]
├─ 發現檔案：N files
├─ Context 評估：sufficient | insufficient
└─ 下一步：continue | ready_to_execute
```

⛔ BLOCK: 未輸出 iteration checkpoint 禁止進入下一輪
⛔ BLOCK: 達到 3 次迭代仍不足，MUST 回報並請求指導

## 核心流程（最多 3 次迭代）

### 每次迭代的 4 階段循環

1. **Context Request** - Agent 描述需要什麼資訊
2. **Retrieval** - 系統搜索並返回相關內容
3. **Assessment** - Agent 評估是否足夠
4. **Decision** - 繼續迭代或開始執行

## 迭代策略

### 第 1 輪：廣度優先

```yaml
strategy: broad_search
actions:
  - 搜索入口檔案（index.ts, main.ts）
  - 查看目錄結構
  - 讀取 package.json / tsconfig.json
goal: 建立整體理解
```

### 第 2 輪：深度搜索

```yaml
strategy: targeted_search
actions:
  - 搜索特定關鍵字
  - 追蹤 import/export 鏈
  - 讀取相關測試檔案
goal: 找到具體實作位置
```

### 第 3 輪：精確定位

```yaml
strategy: precise_lookup
actions:
  - 讀取目標函數/類
  - 查看使用範例
  - 檢查相關類型定義
goal: 收集執行所需的完整 context
```

## 重要規則

- 最多 3 次迭代，避免無限循環
- 每輪迭代應有明確的新資訊需求
- 優先使用 Glob 和 Grep，避免讀取大量檔案
- 記錄搜索路徑，避免重複搜索

## 快速參考

| 任務類型 | 建議迭代數 |
|----------|-----------|
| 簡單查詢 | 1 輪 |
| 功能修改 | 2 輪 |
| 架構理解 | 3 輪 |

## Context 優先級

| 類型 | 優先級 | 說明 |
|------|--------|------|
| 直接相關 | 高 | 要修改的檔案 |
| 介面定義 | 高 | 類型、API contracts |
| 使用範例 | 中 | 測試、其他調用處 |
| 相鄰模組 | 中 | 同目錄的檔案 |
| 全局配置 | 低 | package.json 等 |

## 輸出格式

<!-- TODO: 細化輸出格式 -->

```yaml
retrieval_report:
  task: "[任務描述]"
  iterations: 2
  context_gathered:
    - file: "[file path]"
      relevance: "high | medium | low"
      key_info: "[摘要]"
  search_history:
    - round: 1
      strategy: "broad_search"
      queries: ["[搜索詞]"]
      found: ["[發現的檔案]"]
  assessment:
    sufficient: true
    missing: []
  ready_to_execute: true
```

## 更多資訊

- 進階檢索模式見 [17-advanced-patterns.md](../../../../docs/research/17-advanced-patterns.md)
