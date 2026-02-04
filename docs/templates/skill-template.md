# Skill 模板

複製此模板到 `skills/{skill-name}/SKILL.md`。

> **來源**：[Claude Code 官方文檔 - Extend Claude with skills](https://code.claude.com/docs/en/skills)
> **重要**：請先閱讀 [Ch20: Forced Eval Pattern](../research/20-forced-eval-pattern.md) 了解如何寫出高觸發率的 skill

---

## Frontmatter 完整欄位

| 欄位 | 必填 | 說明 |
|------|------|------|
| `name` | ❌ | 顯示名稱，省略則用目錄名。小寫字母、數字、連字號（最多 64 字元） |
| `description` | ⭐ 推薦 | 何時使用此 skill，Claude 用來決定是否自動載入 |
| `argument-hint` | ❌ | 自動完成提示，如 `[issue-number]` 或 `[filename] [format]` |
| `disable-model-invocation` | ❌ | `true` = 只能手動觸發，Claude 不會自動使用 |
| `user-invocable` | ❌ | `false` = 從 `/` 選單隱藏，只有 Claude 可以呼叫 |
| `allowed-tools` | ❌ | 此 skill 啟用時允許的工具 |
| `model` | ❌ | 指定使用的模型 |
| **`context`** | ❌ | **`fork` = 在獨立 subagent 中執行** |
| **`agent`** | ❌ | **配合 `context: fork` 使用，指定 agent 類型** |
| `hooks` | ❌ | Skill 專屬的 lifecycle hooks |

---

## 基本模板（弱語言版，20% 成功率）

```markdown
---
name: skill-name-here
description: This skill should be used when the user asks to "trigger phrase 1", "trigger phrase 2", "trigger phrase 3", or when [specific condition]. Provides [capability description].
---

# [Skill Name]

## 用途

[2-3 句話說明此 skill 的核心目的。清楚說明什麼情況下應該使用這個 skill。]

## 核心流程

1. [Step 1: 動作描述]
2. [Step 2: 動作描述]
3. [Step 3: 動作描述]
4. [Step 4: 動作描述]

## 重要規則

- [Rule 1: 必須遵守的規則]
- [Rule 2: 必須遵守的規則]
- [Rule 3: 限制或約束]
```

---

## ⭐ Forced Eval 模板（強制語言版，84% 成功率）

> 詳見 [Ch20: Forced Eval Pattern](../research/20-forced-eval-pattern.md)

```markdown
---
name: skill-name-here
description: ⛔ MANDATORY when [condition 1] OR [condition 2]. MUST be activated BEFORE [action]. CRITICAL - 未執行此 skill 禁止 [blocked action]。
---

# [Skill Name]

## ⛔ MANDATORY: 觸發條件

以下情況 **MUST** 使用此 skill：
- [Condition 1]
- [Condition 2]
- [Condition 3]

⛔ BLOCK: 符合以上條件但未執行此 skill，禁止 [blocked action]。

## 強制流程

### Phase 1: [Phase Name]

執行完成後 **MUST** 輸出：
```
[CHECKPOINT] Phase 1: [Phase Name]
├─ 已完成：[specific items]
├─ 結果：[metrics/values]
└─ 下一步：[next action]
```

⛔ BLOCK: 未輸出 Phase 1 checkpoint 禁止進入 Phase 2

### Phase 2: [Phase Name]

執行完成後 **MUST** 輸出：
```
[CHECKPOINT] Phase 2: [Phase Name]
├─ 已完成：[specific items]
├─ 進度：X/N (Y%)
└─ 下一步：[next action]
```

⛔ BLOCK: [blocking condition] 禁止進入 Phase 3

### Phase N: [Final Phase]

執行完成後 **MUST** 輸出：
```
[CHECKPOINT] [Skill Name] Complete
├─ 總結：[summary]
├─ 驗證：[pass/fail]
└─ 下一步：[next action or "proceed to implementation"]
```

## 阻斷條件摘要

| 條件 | 阻斷動作 |
|------|----------|
| 未輸出 Phase 1 checkpoint | ⛔ 禁止進入 Phase 2 |
| 未輸出 Phase 2 checkpoint | ⛔ 禁止進入 Phase 3 |
| [Custom condition] | ⛔ 禁止 [action] |

## 快速參考

| 場景 | 行為 |
|------|------|
| [Scenario 1] | MUST [Action] |
| [Scenario 2] | MUST [Action] |
| [Scenario 3] | ⛔ BLOCK [Action] |
```

### Forced Eval 關鍵要素

| 要素 | 弱語言 ❌ | 強制語言 ✅ |
|------|----------|------------|
| 觸發條件 | "should be used when" | "⛔ MANDATORY when" |
| 輸出要求 | "輸出結果" | "MUST 輸出 [CHECKPOINT]" |
| 阻斷條件 | "應該先完成" | "⛔ BLOCK: 未完成禁止" |
| 數值門檻 | "盡量達到 80%" | "⛔ BLOCK: < 80% 禁止" |

---

## Skill 指定 Agent 執行（重要！）

使用 `context: fork` + `agent` 可以讓 Skill 在指定的 Agent 中執行：

```yaml
---
name: deep-research
description: Research a topic thoroughly
context: fork
agent: Explore
allowed-tools: Read, Grep, Glob
---

Research $ARGUMENTS thoroughly:

1. Find relevant files using Glob and Grep
2. Read and analyze the code
3. Summarize findings with specific file references
```

### 支援的 Agent 類型

| Agent | 用途 |
|-------|------|
| `Explore` | 快速唯讀搜尋（haiku 模型） |
| `Plan` | 規劃模式研究 |
| `general-purpose` | 完整功能（預設） |
| 自定義 Agent | `.claude/agents/` 或 plugin `agents/` 中的任何 agent |

### Skill ↔ Agent 整合決策指南

#### 三種模式

| 模式 | 立場 | 思考方式 | 使用時機 |
|------|------|----------|----------|
| **Skill → Agent** | Skill 的需求 | 「我這個任務需要借用某個執行能力」 | 任務需要隔離執行、複用 agent 能力 |
| **Agent → Skill** | Agent 的需求 | 「我這個角色需要某些知識才能好好工作」 | Agent 需要領域知識 |
| **互指** | 建立專精角色 | 「這是一個有專門知識 + 專門任務入口的專家」 | 需要極度專精的能力 |

#### 決策流程

```
你要達成什麼？
│
├─ 任務需要「隔離執行」
│   └─ Skill → Agent（context: fork）
│
├─ Agent 需要「領域知識」
│   └─ Agent → Skill（skills: [...]）
│
└─ 建立「專精角色」（知識 + 任務入口）
    └─ 互指
```

#### 互指範例：API 安全審查專家

```yaml
# 1. Plugin Agent（有知識的專家）
# plugins/security/agents/api-auditor.md
---
name: api-auditor
skills: ["owasp-top-10", "api-security-patterns"]  # 預載入安全知識
tools: ["Read", "Grep", "Glob", "Bash"]
---
You are an API security auditor...
```

```yaml
# 2. 專案 Skill（任務入口）
# .claude/skills/audit-our-api/SKILL.md
---
name: audit-our-api
context: fork
agent: api-auditor  # 用有知識的專家執行
---
審查 src/api/ 的安全性...
```

#### 不要這樣做 ❌

| 錯誤做法 | 為什麼錯 |
|----------|----------|
| Skill 只有「指南」沒有「任務」時用 `context: fork` | Subagent 沒有可執行的內容 |
| Agent 預載入太多 skills | Context 爆炸，效能下降 |
| 用互指只是因為「可以」 | 過度工程，單向就夠的情況不需要互指 |

---

## 檢查清單

在提交 skill 前確認：

### 基本項目
- [ ] `name` 使用 kebab-case
- [ ] `description` 使用第三人稱 "This skill should be used when..."
- [ ] `description` 包含 3+ 具體觸發詞
- [ ] SKILL.md body 保持精簡（< 500 行），詳細內容放到支援檔案

### 呼叫控制
- [ ] 有副作用的 skill 設定 `disable-model-invocation: true`
- [ ] 背景知識型 skill 設定 `user-invocable: false`

### Agent 整合（如需要）
- [ ] `context: fork` 搭配明確的任務指令（不只是指南）
- [ ] `agent` 指定的 agent 存在

### 支援檔案
- [ ] 有 `references/` 目錄存放詳細內容（如需要）
- [ ] 有 `examples/` 目錄存放可複製的範例（如需要）
- [ ] 有 `scripts/` 目錄存放可執行腳本（如需要）
- [ ] 所有引用的檔案都存在

## 目錄結構

### 基本結構

```
skills/skill-name/
├── SKILL.md              # 必須，名稱大小寫敏感
├── references/           # 可選，詳細文件
│   └── detailed-guide.md
├── examples/             # 可選，可複製的範例
│   └── sample-output.md
└── scripts/              # 可選，可執行腳本
    └── helper.js         # 使用 Node.js 確保跨平台
```

### 進階結構（包含子組件）

來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code) 的 Skill 設計模式

Skill 可以包含自己的 **agents** 和 **hooks**，形成自成一體的子系統：

```
skills/verification-protocol/
├── SKILL.md              # 主要說明
├── config.json           # Skill 配置（可選）
│
├── agents/               # 專屬 agents（Skill 專用）
│   └── verification-checker.md
│
├── hooks/                # 專屬 hooks（Skill 專用）
│   └── hooks.json
│
├── references/
│   └── verification-layers.md
│
├── examples/
│   └── verification-output.md
│
└── scripts/
    ├── run-verification.js
    └── lib/
        └── utils.js
```

**子組件使用場景**：

| Skill | 專屬 Agent | 專屬 Hooks |
|-------|------------|------------|
| verification-protocol | verification-checker | PostToolUse: 自動驗證 |
| memory-manager | memory-retrieval | SessionStart: 注入記憶 |
| continuous-learning | pattern-detector | PostToolUse: 收集觀察 |

**專屬 Agent 範例**：
```markdown
# skills/verification-protocol/agents/verification-checker.md
---
name: verification-checker
description: Use PROACTIVELY after implementation to verify code changes meet specifications.
model: haiku
color: green
tools: ["Read", "Grep", "Glob", "Bash"]
---

You are the Verification Checker, part of the verification-protocol skill.

**Your Role:**
- Run automated verification after code changes
- Check against specification in .vibe-engine/specs/
- Report pass/fail with evidence
```

**專屬 Hooks 範例**：
```json
// skills/verification-protocol/hooks/hooks.json
{
  "description": "Verification protocol hooks",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "檢查修改是否需要驗證。如果是代碼變更，回覆 JSON: {\"needs_verification\": true, \"reason\": \"...\"}",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```
