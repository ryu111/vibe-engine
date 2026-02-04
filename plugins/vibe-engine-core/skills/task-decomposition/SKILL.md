---
name: task-decomposition
description: ⛔ MANDATORY when task involves multiple files OR multiple agents OR user says "implement", "develop", "build" features. MUST decompose BEFORE any implementation. CRITICAL - 未執行任務分解禁止開始編碼。
version: 0.1.0
---

# Task Decomposition

## 用途

將複雜任務分解為可並行執行的子任務，確保每個子任務有明確的職責邊界和可驗證的完成標準。這是 Main Agent 協調工作的核心能力。

## ⛔ MANDATORY: 觸發條件

以下情況 **MUST** 使用此 skill：
- 涉及 2+ 個檔案
- 需要 2+ 個 agents
- 用戶說「實作」、「開發」、「建立」功能
- 任務複雜度評估為 moderate 或 complex

⛔ BLOCK: 符合以上條件但未執行 task-decomposition，禁止開始實作。

## ⛔ MANDATORY: 分解完成 Checkpoint

完成任務分解後 **MUST** 輸出：
```
[CHECKPOINT] Task Decomposition
├─ 原始請求：[user request summary]
├─ 複雜度：simple | moderate | complex
├─ 子任務數量：N
├─ 涉及 Agents：[agent list]
├─ 並行群組：N groups
└─ 下一步：[first subtask]
```

⛔ BLOCK: 未輸出 decomposition checkpoint 禁止開始實作

## 核心流程

1. **分析請求** - 識別任務涉及的職責、檔案、依賴
2. **選擇分解策略** - 按職責、按檔案邊界、或按依賴鏈
3. **生成子任務** - 為每個子任務指定 agent、輸入、預期輸出
4. **識別依賴** - 標記哪些任務可並行、哪些需串行
5. **輸出任務圖** - 生成可執行的任務分配計劃

## 分解規則（優先級由高到低）

### 規則 1：按職責分解

```yaml
input: "實作登入功能並加上測試"
output:
  - { agent: architect, task: "設計登入 API 介面" }
  - { agent: developer, task: "實作登入邏輯" }
  - { agent: tester, task: "撰寫登入測試" }
  - { agent: reviewer, task: "審查代碼" }
```

### 規則 2：按檔案邊界分解

同一檔案只能由一個 Agent 修改，避免衝突。

### 規則 3：按依賴鏈分解

有依賴的任務串成 pipeline，無依賴的可並行。

## 重要規則

- 最小粒度：單一職責 + 可獨立驗證
- 最大粒度：每個子任務 3-5 個 tool calls
- 目標完成時間：每個子任務 30 分鐘內可完成
- 遵循 Star Topology：SubAgents 不能直接通訊

## 快速參考

| 場景 | 分解策略 |
|------|----------|
| 新功能開發 | 按職責（設計→實作→測試→審查） |
| Bug 修復 | 按依賴（定位→修復→驗證） |
| 大型重構 | 按檔案邊界（每個模組獨立） |
| 文檔更新 | 按內容類型（API docs、README、comments） |

## 輸出格式

<!-- TODO: 細化輸出格式 -->

```yaml
task_decomposition:
  original_request: "[用戶原始請求]"
  complexity: "simple | moderate | complex"
  subtasks:
    - id: "task-1"
      agent: "architect"
      description: "[任務描述]"
      inputs: ["[需要的資訊]"]
      outputs: ["[預期產出]"]
      depends_on: []
    - id: "task-2"
      agent: "developer"
      description: "[任務描述]"
      depends_on: ["task-1"]
  execution_order:
    parallel_groups:
      - ["task-1"]
      - ["task-2", "task-3"]
```

## 更多資訊

- 詳細分解算法見 `references/decomposition-algorithms.md`
- 依賴分析見 [01-orchestration.md](../../../../docs/research/01-orchestration.md)
