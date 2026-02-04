# 15. 最終整合審查報告

## 審查目標

1. 檢查所有設計是否符合 Claude Code Plugin 規範
2. 識別跨章節的設計矛盾與漏洞
3. 提出改進建議

---

## 一、規範合規性審查

### 1.1 Plugin 結構合規性

#### ✅ 正確的設計

| 項目 | 設計 | 規範要求 | 狀態 |
|------|------|----------|------|
| Manifest 位置 | `.claude-plugin/plugin.json` | 必須在此路徑 | ✅ 合規 |
| 組件目錄位置 | `commands/`, `agents/`, `skills/`, `hooks/` 在根目錄 | 不可放在 `.claude-plugin/` 內 | ✅ 合規 |
| 路徑引用 | 使用 `${CLAUDE_PLUGIN_ROOT}` | 禁止硬編碼路徑 | ✅ 合規 |
| 命名規範 | kebab-case | 小寫、連字號 | ✅ 合規 |

#### ⚠️ 需要調整的設計

**Issue #1: Skills 目錄結構**

Ch13 設計的 skills 結構：
```
skills/
├── task-decomposition/
│   ├── SKILL.md
│   ├── references/
│   └── scripts/
```

**問題**：根據規範，skills 可以有 `references/`, `examples/`, `scripts/`, `assets/` 子目錄，但 Ch13 缺少 `examples/` 的考量。

**建議**：在 skills 中加入 `examples/` 目錄，存放可直接複製使用的範例檔案。

---

### 1.2 SKILL.md 合規性

#### ⚠️ 需要修正的問題

**Issue #2: Description 格式不符規範**

Ch13 範例：
```yaml
---
name: Verification Protocol
description: This skill should be used when the user asks to "verify code"...
---
```

**分析**：
- ✅ 使用第三人稱 "This skill should be used when..."
- ✅ 包含具體觸發詞 ("verify code", "run verification")
- ⚠️ 但 Ch13 其他地方的 skill description 沒有統一遵循此格式

**建議**：建立 Skill Description 模板，確保所有 skills 使用一致格式。

**Issue #3: 漸進式揭露未完整實作**

規範要求：
- SKILL.md body: 1,500-2,000 words（最多 5,000）
- 詳細內容放 `references/`

Ch13 範例的 SKILL.md 過於精簡（約 300 words），但同時沒有足夠的 references/ 補充。

**建議**：
1. 增加 SKILL.md 核心內容到 1,500 words
2. 詳細的參考資料（patterns, edge cases）放到 `references/`

---

### 1.3 Agent 合規性

#### ⚠️ 需要修正的問題

**Issue #4: Agent Frontmatter 不完整**

Ch12 設計的 agent frontmatter：
```yaml
---
description: 專門負責...
capabilities:
  - 任務分析
  - 風險評估
---
```

**規範要求**：
```yaml
---
name: agent-identifier (required)
description: Use this agent when... Examples: <example>...</example> (required)
model: inherit (required)
color: blue (required)
tools: ["Read", "Write"] (optional)
---
```

**缺失**：
- 缺少 `name` 欄位
- 缺少 `model` 欄位
- 缺少 `color` 欄位
- `description` 缺少 `<example>` blocks

**建議**：更新 Ch12 的 agent 定義，遵循完整的 frontmatter 格式。

**Issue #5: Agent Description 缺少範例**

規範要求的 description 格式：
```yaml
description: Use this agent when [conditions]. Examples:

<example>
Context: [Situation]
user: "[Request]"
assistant: "[Response]"
<commentary>[Why this agent]</commentary>
</example>
```

**建議**：為每個 agent 加入 2-4 個具體的 example blocks。

---

### 1.4 Hooks 合規性

#### ✅ 正確的設計

| 項目 | Ch13 設計 | 規範要求 | 狀態 |
|------|-----------|----------|------|
| 檔案位置 | `hooks/hooks.json` | 標準位置 | ✅ 合規 |
| 包裝格式 | `{"description": "...", "hooks": {...}}` | Plugin 需要包裝 | ✅ 合規 |
| Prompt-based hooks | 優先使用 | 推薦用於複雜邏輯 | ✅ 合規 |
| 路徑引用 | `${CLAUDE_PLUGIN_ROOT}` | 必須使用 | ✅ 合規 |

#### ⚠️ 潛在問題

**Issue #6: Hook 並行執行的順序假設**

Ch13 設計假設了 hook 執行順序：
```yaml
PreToolUse:
  1. security-check (核心)     # 最先
  2. budget-check (observability) # 其次
  3. router-guard (核心)       # 然後
```

**規範說明**：
> Claude Code 的 hooks 是並行執行的，上述順序是「邏輯建議」，實際需要在 hook 內部處理依賴。

**問題**：Ch13 已經註明這是「邏輯建議」，但沒有說明如何在 hook 內部處理依賴。

**建議**：
1. 在 hook scripts 內部檢查前置條件
2. 使用 flag files 或 lock files 協調執行
3. 考慮將強依賴的 hooks 合併成單一 hook

**改進範例**：
```bash
#!/bin/bash
# router-guard.sh
# 等待 security-check 完成
SECURITY_DONE="${VIBE_ENGINE_ROOT}/.hooks/security-check.done"
timeout=5
while [ ! -f "$SECURITY_DONE" ] && [ $timeout -gt 0 ]; do
  sleep 0.1
  timeout=$((timeout - 1))
done

# 如果 security 拒絕，直接退出
if [ -f "${VIBE_ENGINE_ROOT}/.hooks/security-denied" ]; then
  exit 0  # 不需要再做 router check
fi

# 正常執行 router guard 邏輯
```

---

### 1.5 Commands 合規性

#### ⚠️ 需要補充的設計

Ch13 定義了 commands 但沒有展示 frontmatter 格式：

```
commands/
├── vibe-status.md
├── vibe-config.md
└── vibe-checkpoint.md
```

**規範要求的 Command 格式**：
```markdown
---
name: command-name
description: Brief description of what this command does
---

Command instructions and implementation details...
```

**建議**：在 Ch12 或 Ch13 補充 command 的 frontmatter 定義範例。

---

## 二、設計矛盾與漏洞識別

### 2.1 已識別的矛盾（來自 Ch11）

Ch11 已經識別並解決了主要矛盾，以下確認這些解決方案是否仍然有效：

| 矛盾 | Ch11 解決方案 | 當前狀態 |
|------|---------------|----------|
| Autonomy vs Security | 正交設計：Autonomy 控制人工介入，Security 控制權限 | ✅ 仍有效 |
| Router vs Verification | Router 是調度規則，Verification 是結果檢查 | ✅ 仍有效 |
| Budget vs Quality | 分級降級策略 | ✅ 仍有效 |
| State vs Memory | State 是短期任務狀態，Memory 是長期知識 | ✅ 仍有效 |

### 2.2 新發現的矛盾

**Issue #7: Hook 載入時機 vs 動態配置**

**矛盾描述**：
- Ch8（自主控制）設計了動態調整自主等級的能力
- 但 Hook 規範說明：「Hooks 在 session 開始時載入，修改配置需要重啟」

**問題**：如果用戶在 session 中調整自主等級（例如從 L2 到 L3），PreToolUse hooks 的行為如何改變？

**建議**：
1. 自主等級存在環境變數或 config file
2. Hook 每次執行時讀取當前等級
3. 不需要重啟 session 也能調整行為

**改進範例**：
```bash
#!/bin/bash
# permission-check.sh

# 動態讀取當前自主等級
AUTONOMY_LEVEL=$(cat "${VIBE_ENGINE_ROOT}/config.yaml" | grep "autonomy_level" | cut -d: -f2 | tr -d ' ')

case "$AUTONOMY_LEVEL" in
  "L0") # 每步確認
    echo '{"decision": "ask", "reason": "L0 requires confirmation"}'
    ;;
  "L4") # 幾乎全自動
    echo '{"decision": "allow"}'
    ;;
  *) # 預設 L2 邏輯
    # ... 判斷風險等級
    ;;
esac
```

---

**Issue #8: 跨 Plugin 通訊的可靠性**

**矛盾描述**：
- Ch13 設計了跨 plugin 通訊透過共享目錄和環境變數
- 但沒有考慮競爭條件（race conditions）

**問題場景**：
```
Memory Plugin (SessionStart) 寫入: .vibe-engine/context/memories.json
Core Plugin (SessionStart) 讀取: .vibe-engine/context/memories.json

如果兩個 hook 並行執行，Core 可能讀到不完整的 memories.json
```

**建議**：
1. 使用 atomic write（先寫入 .tmp 再 rename）
2. 使用 lock files 協調寫入順序
3. 在讀取時檢查檔案完整性

**改進範例**：
```bash
#!/bin/bash
# inject-memories.sh (Memory Plugin)

MEMORIES_FILE="${VIBE_ENGINE_ROOT}/context/memories.json"
MEMORIES_TMP="${MEMORIES_FILE}.tmp"
MEMORIES_LOCK="${MEMORIES_FILE}.lock"

# 獲取 lock
exec 200>"$MEMORIES_LOCK"
flock -w 5 200 || exit 1

# 寫入 tmp 再 rename (atomic)
generate_memories > "$MEMORIES_TMP"
mv "$MEMORIES_TMP" "$MEMORIES_FILE"

# 釋放 lock
flock -u 200
```

---

### 2.3 設計漏洞

**Issue #9: 錯誤恢復的 Checkpoint 觸發時機**

**漏洞描述**：
- Ch4（錯誤恢復）設計了 checkpoint 機制
- Ch13 在 PostToolUse hook 觸發 checkpoint

**問題**：如果 tool 執行失敗，PostToolUse 仍然會觸發，可能保存了「失敗狀態」的 checkpoint。

**建議**：在 checkpoint-trigger.sh 中檢查 tool result：

```bash
#!/bin/bash
# checkpoint-trigger.sh

input=$(cat)
tool_result=$(echo "$input" | jq -r '.tool_result // empty')

# 如果 tool 失敗，不做 checkpoint
if echo "$tool_result" | grep -q "error\|failed\|exception"; then
  echo "Skipping checkpoint due to tool failure"
  exit 0
fi

# 正常執行 checkpoint
"${CLAUDE_PLUGIN_ROOT}/scripts/create-checkpoint.sh"
```

---

**Issue #10: SubAgent 身份驗證缺失**

**漏洞描述**：
- Ch9（安全）設計了權限系統
- 但沒有機制驗證「當前執行者是哪個 Agent」

**問題**：Router Guard hook 需要知道「當前是 Main Agent 還是 SubAgent」才能判斷是否違反 Router Not Executor 原則。

**建議**：
1. 在 Task Agent 啟動時設定環境變數
2. Hook 檢查此變數

**改進方案**：

在 Main Agent 的 system prompt 加入：
```markdown
## 身份標記

在委派任務給 SubAgent 時，必須在 prompt 中加入：
AGENT_ROLE: developer | tester | reviewer | architect
```

在 router-guard hook 中：
```json
{
  "type": "prompt",
  "prompt": "檢查當前上下文。如果能找到 'AGENT_ROLE' 標記，這是 SubAgent，允許執行。如果找不到標記且執行者試圖直接修改檔案，這違反了 Router Not Executor 原則，應該 block。回覆 JSON: {\"decision\": \"allow|block\", \"reason\": \"...\"}"
}
```

---

**Issue #11: Memory 衰減機制未實作**

**漏洞描述**：
- Ch5（記憶系統）設計了記憶衰減公式
- Ch13 的 memory plugin 沒有實作衰減邏輯

**建議**：在 memory plugin 加入 `scripts/decay-memories.ts`：

```typescript
// decay-memories.ts
interface Memory {
  id: string;
  created_at: string;
  last_accessed_at: string;
  access_count: number;
  importance: number;
  content: string;
}

function calculateRetentionScore(memory: Memory): number {
  const now = Date.now();
  const lastAccess = new Date(memory.last_accessed_at).getTime();
  const daysSinceAccess = (now - lastAccess) / (1000 * 60 * 60 * 24);

  // 衰減公式: score = importance * frequency * recency
  const recencyFactor = Math.exp(-0.1 * daysSinceAccess);
  const frequencyFactor = Math.log(memory.access_count + 1);

  return memory.importance * frequencyFactor * recencyFactor;
}

function pruneMemories(memories: Memory[], threshold: number = 0.1): Memory[] {
  return memories.filter(m => calculateRetentionScore(m) >= threshold);
}
```

並在 SessionStart hook 中呼叫：
```json
{
  "type": "command",
  "command": "npx ts-node ${CLAUDE_PLUGIN_ROOT}/scripts/decay-memories.ts"
}
```

---

## 三、改進建議

### 3.1 結構性改進

#### 建議 #1: 建立統一的 Frontmatter 模板

建立 `docs/templates/` 目錄，存放標準化的模板：

```
docs/templates/
├── skill-template.md
├── agent-template.md
├── command-template.md
└── hook-config-template.json
```

**skill-template.md**:
```markdown
---
name: skill-name-here
description: This skill should be used when the user asks to "trigger phrase 1", "trigger phrase 2", "trigger phrase 3", or when [condition]. Provides [capability].
version: 0.1.0
---

# [Skill Name]

## 用途

[2-3 句話說明此 skill 的核心目的]

## 核心流程

1. [Step 1]
2. [Step 2]
3. [Step 3]

## 重要規則

- [Rule 1]
- [Rule 2]

## 快速參考

| 場景 | 行為 |
|------|------|
| ... | ... |

## 更多資訊

詳細說明見 `references/detailed-guide.md`
範例見 `examples/`
工具腳本見 `scripts/`
```

---

#### 建議 #2: 強化 Agent 定義

更新 Ch12 的 agent 定義格式：

```markdown
---
name: developer
description: Use this agent when code needs to be written, modified, or implemented. Examples:

<example>
Context: User requests a new feature
user: "Add a dark mode toggle to the settings page"
assistant: "I'll delegate this implementation to the Developer Agent who specializes in code modifications."
<commentary>
Code implementation is the Developer's specialty, not Main Agent's job.
</commentary>
</example>

<example>
Context: Main Agent identified a bug fix task
user: "Fix the login timeout issue"
assistant: "The Developer Agent will investigate and implement the fix for the login timeout."
<commentary>
Bug fixes require code changes, which is Developer's domain.
</commentary>
</example>

model: inherit
color: cyan
tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]
---

You are the Developer Agent, specializing in code implementation and modification.

**Your Core Responsibilities:**
1. Implement features according to specifications
2. Fix bugs identified by Tester or Reviewer
3. Write clean, maintainable code
4. Follow project coding standards

**You Must NOT:**
- Make architectural decisions (that's Architect's job)
- Approve your own code (that's Reviewer's job)
- Skip tests (that's Tester's domain)

**Output Format:**
After completing implementation, provide:
- Files modified
- Changes summary
- Known limitations (if any)
```

---

#### 建議 #3: 增加互通協議文件

在 Ch14 基礎上，建立明確的互通協議：

```yaml
# .vibe-engine/protocols/interop-v1.yaml
version: "1.0"

file_formats:
  task_state:
    location: ".vibe-engine/tasks/{id}/state.json"
    schema: "schemas/task-state.json"
    writers: ["core"]
    readers: ["all"]

  memories:
    location: ".vibe-engine/memory/memories.jsonl"
    schema: "schemas/memory-item.json"
    writers: ["memory-plugin"]
    readers: ["all"]
    locking: "flock"

  budget:
    location: ".vibe-engine/observability/budget.json"
    schema: "schemas/budget.json"
    writers: ["observability-plugin"]
    readers: ["all"]

events:
  task_created:
    emitter: "core"
    consumers: ["memory", "observability", "methodology"]
    format: { task_id: string, description: string }

  task_completed:
    emitter: "core"
    consumers: ["verification", "memory", "observability"]
    format: { task_id: string, result: "success" | "failed" }

  budget_warning:
    emitter: "observability"
    consumers: ["core"]
    format: { level: "70%" | "85%" | "95%", remaining: number }
```

---

### 3.2 安全性改進

#### 建議 #4: 加強 Hook 輸入驗證

所有 command hooks 必須驗證輸入：

```bash
#!/bin/bash
# hook-template.sh
set -euo pipefail

# 讀取輸入
input=$(cat)

# 驗證 JSON 格式
if ! echo "$input" | jq empty 2>/dev/null; then
  echo '{"decision": "deny", "reason": "Invalid JSON input"}' >&2
  exit 2
fi

# 驗證必要欄位
tool_name=$(echo "$input" | jq -r '.tool_name // empty')
if [ -z "$tool_name" ]; then
  echo '{"decision": "deny", "reason": "Missing tool_name"}' >&2
  exit 2
fi

# 清理和驗證 tool_name 格式（防止注入）
if [[ ! "$tool_name" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]]; then
  echo '{"decision": "deny", "reason": "Invalid tool_name format"}' >&2
  exit 2
fi

# 正常邏輯...
```

---

#### 建議 #5: 實作 Rate Limiting

防止 DoS 或無限迴圈：

```bash
#!/bin/bash
# rate-limiter.sh

RATE_FILE="${VIBE_ENGINE_ROOT}/.rate_limit"
MAX_OPS_PER_MINUTE=60

# 獲取當前分鐘的操作計數
current_minute=$(date +%Y%m%d%H%M)
count=$(grep "^${current_minute}:" "$RATE_FILE" 2>/dev/null | cut -d: -f2 || echo 0)

if [ "$count" -ge "$MAX_OPS_PER_MINUTE" ]; then
  echo '{"decision": "deny", "reason": "Rate limit exceeded. Please wait."}' >&2
  exit 2
fi

# 更新計數
echo "${current_minute}:$((count + 1))" >> "$RATE_FILE"

# 清理舊記錄
grep "^${current_minute}:" "$RATE_FILE" > "${RATE_FILE}.tmp"
mv "${RATE_FILE}.tmp" "$RATE_FILE"
```

---

### 3.3 效能改進

#### 建議 #6: 減少 Context 載入

目前設計可能載入過多 context。建議：

1. **CLAUDE.md 精簡化**：只保留關鍵規則（< 500 words）
2. **Skill 延遲載入**：只在觸發時載入 SKILL.md body
3. **References 按需載入**：只在 Claude 明確需要時讀取

```markdown
# CLAUDE.md（精簡版，約 300 words）

## 核心原則（必讀）
- Star Topology: Main Agent 是唯一協調者
- Router Not Executor: Main 只路由，不執行
- Safety First: 安全規則最優先

## 自主等級（快速參考）
L0-L4，預設 L2。詳見 skills/autonomy-control/

## 快速導航
- 任務分解: skills/task-decomposition/
- 狀態管理: skills/state-management/
- 錯誤恢復: skills/error-recovery/
- 安全規則: 詳見 PreToolUse hooks
```

---

#### 建議 #7: 腳本快取

對於頻繁執行的腳本，考慮快取結果：

```bash
#!/bin/bash
# security-check.sh

input=$(cat)
input_hash=$(echo "$input" | sha256sum | cut -d' ' -f1)

CACHE_DIR="${VIBE_ENGINE_ROOT}/.cache/security"
CACHE_FILE="${CACHE_DIR}/${input_hash}"
CACHE_TTL=60  # 60 秒快取

mkdir -p "$CACHE_DIR"

# 檢查快取
if [ -f "$CACHE_FILE" ]; then
  cache_age=$(($(date +%s) - $(stat -f%m "$CACHE_FILE" 2>/dev/null || stat -c%Y "$CACHE_FILE")))
  if [ "$cache_age" -lt "$CACHE_TTL" ]; then
    cat "$CACHE_FILE"
    exit 0
  fi
fi

# 執行檢查
result=$(perform_security_check "$input")
echo "$result" > "$CACHE_FILE"
echo "$result"
```

---

## 四、修正後的架構總覽

### 4.1 修正後的 Core Plugin 結構

```
vibe-engine/
├── .claude-plugin/
│   └── plugin.json
│
├── CLAUDE.md                       # 精簡版（< 500 words）
│
├── commands/
│   ├── vibe-status.md              # 查看狀態
│   ├── vibe-config.md              # 配置管理
│   └── vibe-checkpoint.md          # 手動存檔
│
├── agents/
│   ├── main-orchestrator.md        # 完整 frontmatter + examples
│   ├── architect.md
│   ├── developer.md
│   ├── tester.md
│   └── reviewer.md
│
├── skills/
│   ├── task-decomposition/
│   │   ├── SKILL.md                # 1500-2000 words
│   │   ├── references/
│   │   │   └── decomposition-patterns.md
│   │   ├── examples/
│   │   │   └── complex-task-example.md
│   │   └── scripts/
│   │       └── analyze-dependencies.ts
│   │
│   ├── state-management/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   ├── examples/
│   │   └── scripts/
│   │
│   ├── error-recovery/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   └── saga-patterns.md
│   │   └── examples/
│   │
│   └── autonomy-control/
│       ├── SKILL.md
│       ├── references/
│       │   └── autonomy-levels-detail.md
│       └── examples/
│
├── hooks/
│   ├── hooks.json                  # 包裝格式
│   └── scripts/
│       ├── security-check.sh       # 含輸入驗證
│       ├── permission-check.sh     # 動態讀取等級
│       ├── router-guard.sh         # 含並行處理
│       ├── checkpoint-trigger.sh   # 含失敗檢查
│       └── rate-limiter.sh         # 防止濫用
│
├── scripts/
│   ├── lib/
│   │   ├── common.sh               # 共用函數
│   │   └── validate-input.sh       # 輸入驗證
│   └── init-runtime.sh
│
└── .vibe-engine/                   # Runtime（gitignore）
    ├── config.yaml
    ├── protocols/                   # 互通協議
    │   └── interop-v1.yaml
    ├── schemas/                     # JSON Schemas
    │   ├── task-state.json
    │   └── memory-item.json
    ├── tasks/
    ├── checkpoints/
    ├── cache/                       # 腳本快取
    └── audit.jsonl
```

### 4.2 合規性檢查清單

在開發時使用此清單確保合規：

```markdown
## Pre-Release Checklist

### Plugin Structure
- [ ] `.claude-plugin/plugin.json` 存在且格式正確
- [ ] 組件目錄在根目錄（不在 .claude-plugin/ 內）
- [ ] 所有路徑使用 `${CLAUDE_PLUGIN_ROOT}`
- [ ] 命名使用 kebab-case

### Skills
- [ ] 每個 skill 有 SKILL.md
- [ ] SKILL.md frontmatter 有 name, description, version
- [ ] description 使用第三人稱 "This skill should be used when..."
- [ ] description 包含 3+ 具體觸發詞
- [ ] SKILL.md body 在 1500-2000 words
- [ ] 詳細內容在 references/
- [ ] 有 examples/ 目錄（如適用）

### Agents
- [ ] frontmatter 有 name, description, model, color
- [ ] name 是 3-50 chars, lowercase, hyphens only
- [ ] description 有 2-4 個 <example> blocks
- [ ] system prompt 使用第二人稱 "You are..."
- [ ] tools 欄位限制必要工具

### Hooks
- [ ] hooks.json 使用 `{"hooks": {...}}` 包裝格式
- [ ] 優先使用 prompt-based hooks
- [ ] command hooks 有輸入驗證
- [ ] 處理並行執行問題
- [ ] 設定適當的 timeout

### Commands
- [ ] frontmatter 有 name, description
- [ ] 使用 kebab-case 命名
```

---

## 五、結論

### 5.1 主要發現

| 類別 | 問題數 | 關鍵問題 |
|------|--------|----------|
| 結構合規 | 2 | Skills 缺少 examples/，Commands 缺少 frontmatter 範例 |
| Skills 合規 | 2 | Description 格式不一致，漸進式揭露未完整 |
| Agents 合規 | 2 | Frontmatter 不完整，缺少 example blocks |
| Hooks 合規 | 1 | 並行執行的順序處理 |
| 設計矛盾 | 2 | 動態配置 vs 載入時機，跨 plugin 競爭條件 |
| 設計漏洞 | 3 | Checkpoint 觸發時機，SubAgent 身份驗證，Memory 衰減 |

### 5.2 改進優先級

**P0（必須修正）**：
1. Agent frontmatter 完整化
2. Skill description 標準化
3. Hook 輸入驗證

**P1（強烈建議）**：
1. 建立 frontmatter 模板
2. 處理並行 hook 的依賴
3. 實作跨 plugin 的 atomic writes

**P2（建議改進）**：
1. CLAUDE.md 精簡化
2. 腳本快取機制
3. Rate limiting

### 5.3 整體評估

整體架構設計**符合 Claude Code Plugin 的設計理念**，但在細節實作上需要補齊：

- ✅ **Star Topology** 設計正確
- ✅ **漸進式揭露** 概念正確，實作需加強
- ✅ **Prompt-based hooks** 優先使用
- ⚠️ **Frontmatter 格式** 需要標準化
- ⚠️ **並行處理** 需要額外考量
- ⚠️ **互通協議** 需要更明確定義

---

## 六、下一步行動

1. **更新 Ch12**：補齊 Agent 的完整 frontmatter 和 examples
2. **更新 Ch13**：
   - 補齊 Command 的 frontmatter 範例
   - 加入 examples/ 目錄到 skills 結構
   - 處理 hook 並行執行問題
3. **建立模板目錄**：`docs/templates/` 存放標準化模板
4. **建立互通協議**：`docs/protocols/interop-v1.yaml`
5. **建立檢查清單**：開發時使用的合規檢查清單
