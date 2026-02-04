# Command 模板

複製此模板到 `commands/{command-name}.md`。

---

```markdown
---
name: command-name
description: Brief description of what this command does (shown in /help)
---

# [Command Name]

## 概述

[1-2 句話說明命令用途]

## 使用方式

- `/command-name` - [基本用法]
- `/command-name [arg]` - [帶參數用法]
- `/command-name --flag` - [帶選項用法]

## 參數

| 參數 | 必要 | 描述 |
|------|------|------|
| `[arg1]` | 否 | [描述] |
| `[arg2]` | 否 | [描述] |

## 選項

| 選項 | 簡寫 | 描述 |
|------|------|------|
| `--verbose` | `-v` | [描述] |
| `--format` | `-f` | [描述] |

## 執行步驟

1. [Step 1]
2. [Step 2]
3. [Step 3]

## 輸出範例

\`\`\`
[Expected output format]
\`\`\`

## 相關命令

- `/related-command-1` - [描述]
- `/related-command-2` - [描述]

## 錯誤處理

| 錯誤 | 原因 | 解決方式 |
|------|------|----------|
| [Error message] | [Why it happens] | [How to fix] |

## 腳本位置

如果命令調用腳本，指定位置：
`${CLAUDE_PLUGIN_ROOT}/scripts/[script-name].sh`
```

---

## 檢查清單

- [ ] `name` 使用 kebab-case
- [ ] `name` 有意義且簡短
- [ ] `description` 簡潔（< 100 字元）
- [ ] 有使用方式範例
- [ ] 有輸出範例
- [ ] 如有參數，有參數說明
- [ ] 如調用腳本，使用 `${CLAUDE_PLUGIN_ROOT}`

## 命名建議

| 類型 | 範例 |
|------|------|
| 狀態查詢 | `show-status`, `list-tasks` |
| 配置管理 | `config`, `set-option` |
| 操作執行 | `run-tests`, `deploy` |
| 資料管理 | `backup`, `restore` |

## 進階：互動式命令

如果命令需要用戶輸入，使用 AskUserQuestion：

```markdown
## 互動流程

1. 詢問用戶選擇模式
2. 根據選擇執行對應邏輯
3. 顯示結果

使用 AskUserQuestion tool 收集輸入。
```
