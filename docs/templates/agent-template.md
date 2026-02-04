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

> **來源**：[Claude Code 官方文檔 - Create custom subagents](https://code.claude.com/docs/en/sub-agents)

| 欄位 | 用途 | 範例 |
|------|------|------|
| `tools` | 允許的工具列表（allowlist） | `["Read", "Grep", "Glob"]` |
| `disallowedTools` | 禁止的工具列表（denylist） | `["Write", "Edit"]` |
| `skills` | **預載入 Skills 到 Agent context** | `["api-conventions", "error-handling"]` |
| `hooks` | **Agent 專屬的 lifecycle hooks** | 見下方範例 |
| `permissionMode` | 權限模式 | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan` |

### Skills 欄位（重要！）

Skills 欄位會在 Agent 啟動時**注入 skill 內容**到 context，讓 Agent 擁有領域知識而不需執行時才載入：

```yaml
---
name: api-developer
description: Implement API endpoints following team conventions
skills:
  - api-conventions
  - error-handling-patterns
---

Implement API endpoints. Follow the conventions and patterns from the preloaded skills.
```

**注意**：
- Subagents **不會**從 parent conversation 繼承 skills，必須明確列出
- Skills 內容會被完整注入，不只是讓 agent 可以呼叫

### Skill ↔ Agent 整合決策

| 模式 | 立場 | 使用時機 |
|------|------|----------|
| **Agent → Skill** | Agent 的需求 | 「我這個角色需要某些知識才能好好工作」 |
| **Skill → Agent** | Skill 的需求 | 「我這個任務需要借用某個執行能力」 |
| **互指** | 建立專精角色 | 「這是一個有專門知識 + 專門任務入口的專家」 |

詳細決策指南見 [skill-template.md](skill-template.md#skill--agent-整合決策指南)。

### Hooks 欄位

Agent 可以定義專屬的 lifecycle hooks，只在該 Agent 執行時生效：

```yaml
---
name: db-reader
description: Execute read-only database queries
tools: ["Bash"]
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-readonly-query.sh"
---
```

支援的 Hook Events：
- `PreToolUse` - Agent 使用工具前
- `PostToolUse` - Agent 使用工具後
- `Stop` - Agent 結束時（會轉換為 `SubagentStop`）

### MCP 工具繼承

> 預設情況下，Subagents 會繼承 main conversation 的所有工具，**包括 MCP tools**。

若要限制 MCP 工具，使用 `tools` 或 `disallowedTools` 欄位。

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

### 必填項目
- [ ] `name` 是 3-50 字元，小寫加連字號
- [ ] `name` 不以連字號開頭或結尾
- [ ] `description` 清楚說明何時使用（可含 `<example>` blocks）
- [ ] `model` 是有效值：`inherit`, `sonnet`, `opus`, `haiku`
- [ ] `color` 是有效值

### 工具權限
- [ ] `tools` 只包含必要的工具（最小權限原則）
- [ ] 唯讀 Agent（Architect/Reviewer）沒有 `Write`/`Edit`

### Skills 整合（如需要）
- [ ] `skills` 列出的 skill 都存在於 `skills/` 目錄
- [ ] Skills 內容與 Agent 職責相關

### Hooks 定義（如需要）
- [ ] `hooks` 使用正確的 event name（`PreToolUse`、`PostToolUse`、`Stop`）
- [ ] Hook scripts 使用 Node.js 確保跨平台

### System Prompt
- [ ] 使用第二人稱 "You are..."
- [ ] 有清楚的職責描述
- [ ] 有明確的「不應該做」清單
- [ ] 有輸出格式定義
