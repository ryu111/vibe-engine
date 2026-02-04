# Skill 模板

複製此模板到 `skills/{skill-name}/SKILL.md`。

---

```markdown
---
name: skill-name-here
description: This skill should be used when the user asks to "trigger phrase 1", "trigger phrase 2", "trigger phrase 3", or when [specific condition]. Provides [capability description].
version: 0.1.0
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

## 快速參考

| 場景 | 行為 |
|------|------|
| [Scenario 1] | [Action] |
| [Scenario 2] | [Action] |
| [Scenario 3] | [Action] |

## 腳本與工具

| 腳本 | 用途 |
|------|------|
| `scripts/[name].sh` | [Description] |
| `scripts/[name].ts` | [Description] |

執行方式：
\`\`\`bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/[skill-name]/scripts/[script].sh [args]
\`\`\`

## 更多資訊

- 詳細說明見 `references/[topic].md`
- 範例見 `examples/`
- 工具腳本見 `scripts/`
```

---

## 檢查清單

在提交 skill 前確認：

- [ ] `name` 使用 kebab-case
- [ ] `description` 使用第三人稱 "This skill should be used when..."
- [ ] `description` 包含 3+ 具體觸發詞
- [ ] SKILL.md body 在 1,500-2,000 words 之間
- [ ] 使用祈使句（imperative form），不用第二人稱
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
