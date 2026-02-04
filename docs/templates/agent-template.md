# Agent 模板

複製此模板到 `agents/{agent-name}.md`。

## 兩種 Description 格式

### 格式 A：簡化版（推薦用於大多數場景）

來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code) 最佳實踐

```markdown
---
name: agent-name
description: [Role description]. Use PROACTIVELY when [triggering conditions]. Specializes in [specialties].
model: inherit
color: blue
tools: ["Read", "Grep", "Glob"]
---

[System Prompt]
```

**範例**：
```markdown
---
name: architect
description: Software architecture specialist for system design and API design. Use PROACTIVELY when planning new features, defining interfaces, or making architectural decisions.
model: opus
color: magenta
tools: ["Read", "Grep", "Glob"]
---
```

**優點**：
- 更簡潔，易於維護
- 專注於「何時使用」
- 適合觸發條件明確的 Agent

---

### 格式 B：完整版（用於需要詳細範例的場景）

```markdown
---
name: agent-name
description: |
  Use this agent when [primary condition]. Examples:

  <example>
  Context: [Describe the situation]
  user: "[What the user might say]"
  assistant: "[How assistant should respond and use this agent]"
  <commentary>
  [Explain why this agent is the right choice for this situation]
  </commentary>
  </example>

  <example>
  Context: [Another situation]
  user: "[Another user request]"
  assistant: "[Response]"
  <commentary>
  [Explanation]
  </commentary>
  </example>

  <example>
  Context: [Edge case or alternative scenario]
  user: "[User request]"
  assistant: "[Response]"
  <commentary>
  [Explanation]
  </commentary>
  </example>

model: inherit
color: blue
tools: ["Read", "Write", "Edit", "Grep", "Glob"]
---

You are the [Agent Role], specializing in [domain/specialty].

**Your Core Responsibilities:**
1. [Primary responsibility]
2. [Secondary responsibility]
3. [Tertiary responsibility]

**You Must NOT:**
1. [Prohibited action 1]
2. [Prohibited action 2]
3. [Prohibited action 3]

**Working Process:**
1. PERCEIVE: [How to understand the task]
2. REASON: [How to plan the approach]
3. ACT: [How to execute]
4. EVALUATE: [How to verify results]

**Quality Standards:**
- [Standard 1]
- [Standard 2]
- [Standard 3]

**Output Format:**
After completing your task, provide:
\`\`\`json
{
  "status": "success | partial | failed",
  "summary": "[Brief summary of what was done]",
  "files_modified": ["file1.ts", "file2.ts"],
  "key_decisions": ["Decision 1", "Decision 2"],
  "warnings": ["Warning if any"],
  "needs_followup": false
}
\`\`\`
```

---

## 必填欄位說明

| 欄位 | 要求 | 範例 |
|------|------|------|
| `name` | 3-50 字元，小寫，連字號 | `code-reviewer`, `test-generator` |
| `description` | 包含觸發條件和 2-4 個 `<example>` blocks | 見上方模板 |
| `model` | `inherit`, `sonnet`, `opus`, `haiku` | `inherit` |
| `color` | `blue`, `cyan`, `green`, `yellow`, `magenta`, `red` | `cyan` |

## 可選欄位

| 欄位 | 用途 | 範例 |
|------|------|------|
| `tools` | 限制可用工具（最小權限原則） | `["Read", "Grep"]` |

## Tools 最佳實踐（最小權限原則）

根據 Agent 職責限制可用工具，減少意外修改風險：

| Agent 類型 | 建議 Tools | 原因 |
|------------|------------|------|
| 協調者/Orchestrator | `["Read", "Grep", "Glob", "Task", "TodoWrite"]` | 只需讀取和調度 |
| 架構師/Architect | `["Read", "Grep", "Glob"]` | 只做設計，不實作 |
| 開發者/Developer | `["Read", "Write", "Edit", "Grep", "Glob", "Bash"]` | 需要完整實作能力 |
| 測試者/Tester | `["Read", "Write", "Edit", "Grep", "Glob", "Bash"]` | 需要撰寫測試和執行 |
| 審查者/Reviewer | `["Read", "Grep", "Glob", "Bash"]` | 只審查，不修改；Bash 用於安全掃描 |

**關鍵原則**：
- Architect 和 Reviewer **不應該**有 `Write`/`Edit` 權限
- 每個 Agent 只給必要的工具
- 如果不確定，先給最少權限，後續再按需增加

## 顏色建議

| 顏色 | 建議用途 |
|------|----------|
| `blue` | 協調、管理 |
| `cyan` | 開發、實作 |
| `green` | 測試、驗證 |
| `yellow` | 審查、警告 |
| `magenta` | 設計、架構 |
| `red` | 安全、緊急 |

## 檢查清單

- [ ] `name` 是 3-50 字元，小寫加連字號
- [ ] `name` 不以連字號開頭或結尾
- [ ] `description` 有 2-4 個 `<example>` blocks
- [ ] 每個 example 有 Context, user, assistant, commentary
- [ ] `model` 是有效值
- [ ] `color` 是有效值
- [ ] `tools` 只包含必要的工具（如有指定）
- [ ] System prompt 使用第二人稱 "You are..."
- [ ] 有清楚的職責描述
- [ ] 有明確的「不應該做」清單
- [ ] 有輸出格式定義
