# Ch20: Forced Eval Pattern - 強制遵循模式

> 讓 Claude 從「建議性」變成「強制性」遵循規則的方法論

## 問題背景

### 簡單指令的失敗率

根據 [Scott Spence 的測試研究](https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably)，使用簡單的「建議性」語言（如「建議使用」、「可以先」）只有 **20% 成功率**。

原因：Claude 會「看到、承認、然後完全忽略」，直接開始實作。

### 測試結果對比

| 方法 | 成功率 | 說明 |
|------|--------|------|
| 簡單指令 | 20% | `systemMessage: "建議使用 task-decomposition"` |
| Forced Eval Hook | **84%** | 使用 MANDATORY/CRITICAL 語言 + 三步承諾機制 |
| LLM Eval Hook | 80% | API 預評估，但複雜場景會失敗 |

---

## Forced Eval Pattern 核心原理

### 三層防護機制

```
┌─────────────────────────────────────────────────────────────────┐
│ 第一層：強制語言 (MANDATORY / CRITICAL / ⛔ BLOCK)              │
│                                                                 │
│ 第二層：強制輸出 (MUST 輸出 [CHECKPOINT])                        │
│                                                                 │
│ 第三層：阻斷條件 (⛔ BLOCK: 不滿足條件禁止進入下一階段)           │
└─────────────────────────────────────────────────────────────────┘
```

### 第一層：強制語言

| 弱語言（20% 成功率） | 強制語言（84% 成功率） |
|---------------------|----------------------|
| 建議使用 | **MANDATORY**: 必須使用 |
| 可以先 | **⛔ CRITICAL**: 未完成禁止 |
| 推薦 | **MUST** |
| 應該 | **⛔ BLOCK** |

**關鍵詞優先級**：
1. `⛔ BLOCK` - 最強，表示禁止進入下一步
2. `CRITICAL` - 次強，表示關鍵規則
3. `MANDATORY` - 強制，表示必須執行
4. `MUST` - 必須，用於輸出要求

### 第二層：強制輸出 (Checkpoint)

每個階段完成後，Claude **MUST** 輸出特定格式的 checkpoint：

```
[CHECKPOINT] <階段名稱>
├─ 已完成：<具體內容>
├─ 進度：X/N (Y%)
└─ 下一步：<明確動作>
```

**為什麼有效**：
- 強制 Claude 確認自己完成了什麼
- 提供可追蹤的進度記錄
- 沒有輸出 = 沒有完成 = 不能繼續

### 第三層：阻斷條件

明確的數值門檻和條件：

```markdown
⛔ BLOCK: 測試覆蓋率 < 80% 禁止合併
⛔ BLOCK: 未輸出 checkpoint 禁止進入下一 Phase
⛔ BLOCK: 數值一致率 < 99% 禁止進入 Phase 4
```

---

## 實作指南

### SKILL.md 寫法

#### ❌ 錯誤示範（20% 成功率）

```yaml
---
name: task-decomposition
description: This skill should be used when the user asks to break down a task.
---

# Task Decomposition

## 用途
將複雜任務分解為子任務。

## 流程
1. 分析請求
2. 分解任務
3. 輸出計劃
```

#### ✅ 正確示範（84% 成功率）

```yaml
---
name: task-decomposition
description: ⛔ MANDATORY when task involves multiple files OR multiple agents. MUST be activated BEFORE any implementation. CRITICAL - 未執行此 skill 禁止開始編碼。
---

# Task Decomposition

## ⛔ MANDATORY: 觸發條件

以下情況 **MUST** 使用此 skill：
- 涉及 2+ 個檔案
- 需要 2+ 個 agents
- 用戶說「實作」、「開發」、「建立」功能

⛔ BLOCK: 符合以上條件但未執行 task-decomposition，禁止開始實作。

## 強制流程

### Phase 1: 分析
MUST 輸出：
```
[CHECKPOINT] Task Analysis
├─ 檔案數量：N
├─ 涉及 Agents：[list]
└─ 複雜度：simple/moderate/complex
```

⛔ BLOCK: 未輸出 Phase 1 checkpoint 禁止進入 Phase 2

### Phase 2: 分解
MUST 輸出：
```
[CHECKPOINT] Task Decomposition
├─ 子任務數量：N
├─ 並行群組：[groups]
└─ 預估成本：X units
```

⛔ BLOCK: 未輸出 Phase 2 checkpoint 禁止開始實作
```

---

### Hook 寫法

#### Prompt-based Hook（推薦用於強制評估）

```json
{
  "UserPromptSubmit": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "⛔ MANDATORY SKILL EVALUATION ⛔\n\nBefore ANY implementation, you MUST evaluate each skill:\n\n| Skill | Applicable? | Reason |\n|-------|-------------|--------|\n| task-decomposition | YES/NO | [why] |\n| verification-protocol | YES/NO | [why] |\n\nCRITICAL: If ANY skill is YES:\n→ MUST use Skill() tool BEFORE implementation\n→ MUST output [CHECKPOINT] Skill Evaluation\n\n⛔ BLOCK: 未輸出 checkpoint 禁止開始實作",
          "timeout": 10
        }
      ]
    }
  ]
}
```

#### Command-based Hook（用於驗證和記錄）

```json
{
  "PostToolUse": [
    {
      "matcher": "Edit|Write",
      "hooks": [
        {
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/checkpoint-validator.js\"",
          "timeout": 5
        }
      ]
    }
  ]
}
```

---

### CLAUDE.md 規則寫法

```markdown
## ⛔ CRITICAL WORKFLOW RULES

### 1. MANDATORY Skill Evaluation

每次收到實作請求時，**MUST** 先評估 skills：

| 條件 | 必須使用的 Skill |
|------|-----------------|
| 涉及 2+ 檔案 | task-decomposition |
| 新功能開發 | spec-generator |
| 完成實作後 | verification-protocol |

⛔ BLOCK: 未評估 skills 禁止開始實作

### 2. MANDATORY Phase Checkpoints

每完成一個 Phase **MUST** 輸出 checkpoint：

```
[CHECKPOINT] <Phase Name>
├─ 已完成：<具體內容>
└─ 下一步：<明確動作>
```

⛔ BLOCK: 未輸出前一 checkpoint 禁止進入下一 Phase

### 3. MANDATORY Verification

實作完成後 **MUST** 執行驗證：

1. 運行測試
2. 檢查 lint
3. 輸出驗證 checkpoint

⛔ BLOCK: 驗證未通過禁止標記任務完成
```

---

## Checkpoint 格式規範

### 標準格式

```
[CHECKPOINT] <名稱>
├─ <項目 1>：<值>
├─ <項目 2>：<值>
├─ 進度：X/N (Y%)
└─ 下一步：<動作>
```

### 常用 Checkpoint 類型

| Checkpoint | 用途 | 必要欄位 |
|------------|------|----------|
| `[CHECKPOINT] Skill Evaluation` | 評估完 skills | 每個 skill 的 YES/NO |
| `[CHECKPOINT] Task Decomposition` | 任務分解完成 | 子任務數、agents |
| `[CHECKPOINT] Phase N Complete` | 階段完成 | 已完成內容、進度 |
| `[CHECKPOINT] Verification` | 驗證完成 | 測試結果、lint 結果 |
| `[CHECKPOINT] Task Complete` | 任務結束 | 總結、驗證狀態 |

---

## 常見錯誤與修正

### 錯誤 1：使用弱語言

```markdown
❌ 建議在開始前先分解任務
✅ ⛔ MANDATORY: 開始前 MUST 執行 task-decomposition
```

### 錯誤 2：沒有阻斷條件

```markdown
❌ 完成後應該輸出 checkpoint
✅ ⛔ BLOCK: 未輸出 checkpoint 禁止進入下一步
```

### 錯誤 3：沒有數值門檻

```markdown
❌ 測試應該通過
✅ ⛔ BLOCK: 測試通過率 < 100% 禁止標記完成
```

### 錯誤 4：Checkpoint 格式不明確

```markdown
❌ 輸出進度
✅ MUST 輸出：
   [CHECKPOINT] Phase 2
   ├─ 已完成：X, Y, Z
   └─ 進度：3/5 (60%)
```

---

## 測試你的規則

### 檢查清單

- [ ] 是否使用 MANDATORY/CRITICAL/⛔ BLOCK？
- [ ] 是否有明確的 MUST 輸出要求？
- [ ] 是否有數值門檻？
- [ ] 是否有 checkpoint 格式範例？
- [ ] 是否有「禁止進入下一步」的條件？

### 預期行為

當規則寫正確時，Claude 應該：

1. 在開始實作前主動輸出 `[CHECKPOINT] Skill Evaluation`
2. 每個 Phase 結束後輸出對應 checkpoint
3. 遇到阻斷條件時停止並報告
4. 不會跳過任何強制步驟

---

## 參考來源

- [Scott Spence - How to Make Claude Code Skills Activate Reliably](https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably)
- [alexop.dev - Understanding Claude Code Full Stack](https://alexop.dev/posts/understanding-claude-code-full-stack/)
- [everything-claude-code](https://github.com/affaan-m/everything-claude-code)

---

## ⚠️ 術語澄清：兩種 Checkpoint

本專案中有兩種不同的「Checkpoint」概念，請勿混淆：

### 1. 強制輸出 Checkpoint（本章 Forced Eval Pattern）

- **用途**：強制 Claude 確認完成特定階段
- **格式**：`[CHECKPOINT] Phase X` + 結構化輸出
- **觸發**：在 SKILL.md 或 CLAUDE.md 中定義的規則
- **執行者**：Claude 在對話中輸出
- **目的**：確保流程不被跳過

```
[CHECKPOINT] Task Decomposition
├─ 子任務數量：5
├─ 並行群組：2
└─ 下一步：開始實作
```

### 2. 技術狀態 Checkpoint（Ch3, Ch4, Ch11）

- **用途**：保存任務運行狀態以便恢復
- **格式**：JSON 檔案
- **位置**：`.vibe-engine/checkpoints/`
- **執行者**：Hook 腳本（state-saver.js）
- **目的**：支援長任務中斷恢復

```json
{
  "task_id": "task-20260204-001",
  "status": "in_progress",
  "completed_steps": ["step-1", "step-2"],
  "pending_steps": ["step-3"]
}
```

**區分原則**：
- 看到 `[CHECKPOINT]` 文字輸出 → 本章的強制輸出
- 看到 `.vibe-engine/checkpoints/` 檔案 → 技術狀態保存

---

## 與其他章節的關係

| 章節 | 關係 |
|------|------|
| Ch1 協調引擎 | 強制評估確保正確路由 |
| Ch2 閉環驗證 | Checkpoint 是驗證的一部分 |
| Ch3 狀態管理 | 技術 Checkpoint（不同於本章） |
| Ch10 方法論 | Forced Eval 是 SDD 流程的強制機制 |
