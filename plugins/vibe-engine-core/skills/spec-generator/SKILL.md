---
name: spec-generator
description: ⛔ MANDATORY when implementing new features OR when requirements are unclear. MUST generate spec.yaml BEFORE writing any implementation code. CRITICAL - 未生成規格禁止開始編碼。
version: 0.1.0
---

# Spec Generator

## 用途

從自然語言需求生成結構化規格（spec.yaml），作為 SDD+TDD+BDD 開發流程的起點。規格檔案定義了功能的輸入、輸出、完成標準和測試場景。

## ⛔ MANDATORY: 觸發條件

以下情況 **MUST** 使用此 skill：
- 實作新功能
- 需求不明確需要澄清
- 用戶說「create spec」、「定義規格」

⛔ BLOCK: 需求不明確時直接開始編碼，禁止跳過規格生成階段。

### Specification Checkpoint

規格生成完成後 **MUST** 輸出：
```
[CHECKPOINT] Specification Complete
├─ 規格檔案：.vibe-engine/specs/{name}.yaml
├─ 層級：Level 1 | Level 2 | Level 3
├─ 完成標準數量：X
├─ 測試場景數量：X
└─ 下一步：proceed to implementation
```

⛔ BLOCK: 未輸出規格 checkpoint 禁止開始實作

## 核心流程

1. **收集需求** - 詢問用戶需求描述
2. **識別元素** - 提取 inputs、outputs、constraints
3. **生成場景** - 創建 given-when-then 測試場景
4. **驗證完整性** - 確保有明確的完成標準
5. **輸出規格** - 生成 spec.yaml 檔案

## 漸進式揭露

### Level 1: 快速規格（最小可用）

```yaml
spec:
  name: feature-name
  description: "[1-2句描述]"
  done_criteria:
    - "[可驗證的完成標準]"
```

### Level 2: 標準規格

```yaml
spec:
  name: feature-name
  description: "[描述]"
  inputs:
    - name: param1
      type: string
      constraints: "[驗證規則]"
  outputs:
    - name: result
      type: object
  done_criteria:
    - "[標準 1]"
  scenarios:
    - name: happy-path
      given: "[前置條件]"
      when: "[操作]"
      then: "[預期結果]"
```

### Level 3: 完整規格

加入 edge_cases、non_functional、dependencies。

## 重要規則

- 每個 spec 必須有至少一個可驗證的 done_criteria
- inputs 和 outputs 必須有明確的類型
- scenarios 應覆蓋 happy path 和主要 edge cases
- 規格應該是可測試的，不要有模糊描述

## 快速參考

| 需求類型 | 建議的 spec 層級 |
|----------|-----------------|
| 簡單功能 | Level 1 |
| 一般功能 | Level 2 |
| 核心/複雜功能 | Level 3 |

## 輸出位置

規格檔案存放於：`.vibe-engine/specs/{feature-name}.yaml`

## 引導流程

<!-- TODO: 細化引導問題 -->

1. 「請描述您想要實作的功能」
2. 「這個功能需要什麼輸入？」
3. 「預期的輸出是什麼？」
4. 「如何判斷功能完成？」
5. 「有什麼邊界情況需要處理？」

## 更多資訊

- SDD+TDD+BDD 流程見 [10-methodology.md](../../../../docs/research/10-methodology.md)
