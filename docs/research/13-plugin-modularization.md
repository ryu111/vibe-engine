# 13. Plugin 模組化設計

## 設計決策：單一 Plugin vs 多個 Plugins

### 分析

| 方案 | 優點 | 缺點 |
|------|------|------|
| **單一 Plugin** | 統一管理、共享資源、一致性強 | 體積大、無法部分啟用 |
| **多個獨立 Plugins** | 可選安裝、職責清晰 | 配置分散、可能有版本衝突 |
| **核心 + 擴展 Plugins** | 平衡靈活性和一致性 | 需要定義清晰的核心邊界 |

### 決策：採用「核心 + 擴展」模式

```
vibe-engine/                    # 核心 Plugin（必裝）
├── 協調引擎 (Ch1)
├── 狀態管理 (Ch3)
├── 安全權限 (Ch9)
└── 基礎 Hooks

vibe-engine-verification/       # 驗證擴展（可選）
└── 驗證機制 (Ch2)

vibe-engine-memory/             # 記憶擴展（可選）
└── 記憶系統 (Ch5)

vibe-engine-observability/      # 可觀測性擴展（可選）
├── 資源管理 (Ch6)
└── 觀測系統 (Ch7)

vibe-engine-methodology/        # 方法論擴展（可選）
└── SDD+TDD+BDD (Ch10)
```

**理由**：
1. 核心 Plugin 包含「不可或缺」的基礎設施
2. 擴展 Plugin 可以按需安裝
3. 符合 Claude Code 的 plugin 發現機制
4. 避免單一巨型 plugin 載入過多 context

---

## 核心 Plugin: vibe-engine

### 職責範圍

核心 plugin 提供「執行任務的基礎能力」：

| 章節 | 包含原因 |
|------|----------|
| Ch1 協調 | 沒有協調就沒有多 Agent 能力 |
| Ch3 狀態 | 沒有狀態就無法恢復/追蹤 |
| Ch4 錯誤恢復 | 錯誤處理是基礎設施 |
| Ch8 自主 | 自主等級控制所有操作 |
| Ch9 安全 | 安全是不可關閉的 |
| Ch11 衝突 | 跨組件協調規則 |

### 檔案結構

```
vibe-engine/
├── .claude-plugin/
│   └── plugin.json
├── CLAUDE.md                       # 全局規則（Ch1,8,9,11）
│
├── commands/
│   ├── vibe-status.md              # /vibe-status 查看狀態
│   ├── vibe-config.md              # /vibe-config 配置管理
│   └── vibe-checkpoint.md          # /vibe-checkpoint 手動存檔
│
├── agents/
│   ├── main-orchestrator.md        # Main Agent (Ch1)
│   ├── architect.md                # 架構設計 Agent
│   ├── developer.md                # 開發執行 Agent
│   ├── tester.md                   # 測試執行 Agent
│   └── reviewer.md                 # 審查 Agent
│
├── skills/
│   ├── task-decomposition/         # 任務分解 (Ch1)
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   └── decomposition-rules.md
│   │   └── scripts/
│   │       └── analyze-dependencies.ts
│   │
│   ├── state-management/           # 狀態管理 (Ch3)
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   └── checkpoint-format.md
│   │   └── scripts/
│   │       ├── create-checkpoint.sh
│   │       └── restore-checkpoint.sh
│   │
│   ├── error-recovery/             # 錯誤恢復 (Ch4)
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── saga-patterns.md
│   │
│   └── autonomy-control/           # 自主控制 (Ch8)
│       ├── SKILL.md
│       └── references/
│           └── autonomy-levels.md
│
├── hooks/
│   ├── hooks.json                  # Hook 配置
│   └── scripts/
│       ├── security-check.sh       # 安全檢查 (Ch9)
│       ├── permission-check.sh     # 權限驗證 (Ch9)
│       ├── router-guard.sh         # Main Agent 路由守衛 (Ch1)
│       └── checkpoint-trigger.sh   # 自動存檔 (Ch3)
│
├── scripts/                        # 共用腳本
│   ├── lib/
│   │   └── common.sh
│   └── init-runtime.sh
│
└── .vibe-engine/                   # Runtime 資料（gitignore）
    ├── config.yaml
    ├── tasks/
    ├── checkpoints/
    └── audit.jsonl
```

### plugin.json

```json
{
  "name": "vibe-engine",
  "version": "0.1.0",
  "description": "AI Workflow Infrastructure - Core orchestration, state, and security",
  "author": {
    "name": "Vibe Engine Team"
  },
  "keywords": [
    "orchestration",
    "multi-agent",
    "workflow",
    "infrastructure"
  ],
  "dependencies": []
}
```

### CLAUDE.md（精簡版）

```markdown
# Vibe Engine 全局規則

## 核心原則

### Star Topology（星狀拓撲）
- Main Agent 是唯一協調中心
- SubAgent 之間不能直接通訊
- 所有任務分配必須經過 Main Agent

### Router, Not Executor
- Main Agent 只做路由和彙整
- 直接回答條件：純問答、單檔案讀取、澄清問題、狀態查詢

### Safety First
- 安全規則永遠優先
- 危險操作必須經過確認

## 自主等級

| 等級 | 行為 |
|------|------|
| L0 | 每步確認 |
| L1 | 讀取自動，寫入確認 |
| L2 | 低風險自動，中風險確認 |
| L3 | 大部分自動，關鍵點確認 |
| L4 | 幾乎全自動 |

預設：L2

## 衝突解決

1. 安全規則
2. 用戶明確指示
3. 預算限制
4. 效率優化
```

### Commands 範例（符合規範的 frontmatter）

**vibe-status.md**:
```markdown
---
name: vibe-status
description: Show current Vibe Engine status including task progress, budget usage, and agent states
---

# Vibe Status

Display the current status of Vibe Engine.

## Information to Display

1. **Current Task**
   - Task ID and description
   - Status (pending/in_progress/completed/failed)
   - Progress percentage

2. **Budget Usage**
   - Tokens used / total
   - Cost estimate
   - Remaining budget percentage

3. **Agent States**
   - Active agents and their current tasks
   - Completed subtasks

4. **Recent Checkpoints**
   - Last 3 checkpoints with timestamps

## Execution

Read status from `.vibe-engine/tasks/current/state.json` and format output.
```

**vibe-config.md**:
```markdown
---
name: vibe-config
description: Configure Vibe Engine settings including autonomy level, budget limits, and model preferences
---

# Vibe Config

Manage Vibe Engine configuration.

## Available Settings

| Setting | Description | Values |
|---------|-------------|--------|
| autonomy_level | Human-in-the-loop control | L0-L4 |
| budget.tokens | Max tokens per task | number |
| budget.cost | Max cost per task | USD |
| model.default | Default model | opus/sonnet/haiku |

## Usage

- `/vibe-config show` - Display current config
- `/vibe-config set autonomy_level L3` - Set autonomy level
- `/vibe-config reset` - Reset to defaults

## Config Location

`.vibe-engine/config.yaml`
```

### hooks.json（含並行處理說明）

**注意**：所有 command hooks 使用 **Node.js** 以確保跨平台相容性（Windows, macOS, Linux）。

```json
{
  "description": "Vibe Engine core hooks for security and routing",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "安全檢查。檢查操作是否：1) 包含危險模式（rm -rf, DROP TABLE）2) 存取敏感檔案（.env, credentials）3) 超出任務範圍。回覆 JSON: {\"decision\": \"allow|deny\", \"reason\": \"...\"}",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "路由檢查。如果當前是 Main Agent 且操作不符合直接回答條件（純問答、單檔案讀取、澄清問題、狀態查詢），應該委派給 SubAgent。回覆 JSON: {\"decision\": \"allow|delegate\", \"suggested_agent\": \"...\"}",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/checkpoint-trigger.js\"",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/init-runtime.js\"",
            "timeout": 10
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/pre-compact.js\"",
            "timeout": 15
          }
        ],
        "description": "Save critical state before context compaction"
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "任務完成檢查。驗證：1) 所有子任務已完成 2) 沒有未處理的錯誤 3) 狀態已保存。回覆 JSON: {\"decision\": \"approve|block\", \"reason\": \"...\"}",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

### Hook 並行執行處理

**重要**：Claude Code 的 hooks 是**並行執行**的，不能假設執行順序。

#### 問題場景

```
PreToolUse hooks 並行執行：
├── security-check (prompt) ─────┐
├── budget-check (command) ──────┼── 同時執行，結果不確定順序
└── router-guard (prompt) ───────┘

如果 security-check 拒絕但 router-guard 通過，最終結果是什麼？
→ 任一 hook 返回 deny 就會阻擋操作
```

#### 解決方案 1：在腳本內部處理依賴

對於有依賴的 hooks，在腳本內部等待前置條件（使用 **Node.js** 確保跨平台）：

```javascript
// hooks/scripts/router-guard.js
// 此 hook 依賴 security-check 的結果
const fs = require('fs');
const path = require('path');

const LOCK_DIR = path.join(process.env.VIBE_ENGINE_ROOT || '.vibe-engine', '.hooks');
const SECURITY_DONE = path.join(LOCK_DIR, 'security-check.done');
const SECURITY_DENIED = path.join(LOCK_DIR, 'security-denied');

// 確保目錄存在
fs.mkdirSync(LOCK_DIR, { recursive: true });

// 等待 security-check 完成（最多 5 秒）
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForSecurity() {
  let timeout = 50;
  while (!fs.existsSync(SECURITY_DONE) && !fs.existsSync(SECURITY_DENIED) && timeout > 0) {
    await sleep(100);
    timeout--;
  }

  // 如果 security 已經拒絕，直接退出
  if (fs.existsSync(SECURITY_DENIED)) {
    console.log(JSON.stringify({ decision: 'allow' })); // 讓 security 的結果生效
    process.exit(0);
  }

  // 正常執行 router guard 邏輯
  let input = '';
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => {
    const data = JSON.parse(input);
    // ... 路由檢查邏輯 ...
  });
}

waitForSecurity();
```

#### 解決方案 2：合併相關的 hooks

將強依賴的檢查合併成單一 hook：

```json
{
  "matcher": "Edit|Write|Bash",
  "hooks": [
    {
      "type": "prompt",
      "prompt": "執行以下檢查（按順序）：\n1. 安全檢查：是否包含危險模式\n2. 預算檢查：是否超出預算\n3. 路由檢查：Main Agent 是否應該委派\n\n任一檢查失敗則阻擋。回覆 JSON: {\"decision\": \"allow|deny\", \"failed_check\": \"...\", \"reason\": \"...\"}",
      "timeout": 15
    }
  ]
}
```

#### 解決方案 3：使用 flag files 協調

```javascript
// hooks/scripts/security-check.js
const fs = require('fs');
const path = require('path');

const LOCK_DIR = path.join(process.env.VIBE_ENGINE_ROOT || '.vibe-engine', '.hooks');
const SECURITY_DONE = path.join(LOCK_DIR, 'security-check.done');
const SECURITY_DENIED = path.join(LOCK_DIR, 'security-denied');

// 確保目錄存在
fs.mkdirSync(LOCK_DIR, { recursive: true });

// 清理舊的 flag files
try { fs.unlinkSync(SECURITY_DONE); } catch {}
try { fs.unlinkSync(SECURITY_DENIED); } catch {}

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const data = JSON.parse(input);
  // ... 安全檢查邏輯 ...

  const decision = performSecurityCheck(data); // 假設的檢查函數
  const result = { decision, reason: '...' };

  if (decision === 'deny') {
    fs.writeFileSync(SECURITY_DENIED, '');
    console.log(JSON.stringify(result));
    process.exit(2);
  }

  // 標記完成
  fs.writeFileSync(SECURITY_DONE, '');
  console.log(JSON.stringify(result));
});

function performSecurityCheck(data) {
  // 檢查危險模式
  const dangerous = ['rm -rf', 'DROP TABLE', 'DELETE FROM'];
  const command = data.tool_input?.command || '';

  for (const pattern of dangerous) {
    if (command.includes(pattern)) return 'deny';
  }
  return 'allow';
}
```

---

## 擴展 Plugin 1: vibe-engine-verification

### 職責

提供多層驗證能力 (Ch2)

### 檔案結構

```
vibe-engine-verification/
├── .claude-plugin/
│   └── plugin.json
│
├── skills/
│   └── verification-protocol/
│       ├── SKILL.md
│       ├── references/
│       │   ├── verification-layers.md
│       │   └── llm-judge-prompts.md
│       └── scripts/
│           └── run-verification.sh
│
├── hooks/
│   ├── hooks.json
│   └── scripts/
│       └── post-impl-verify.sh
│
└── commands/
    └── verify.md                   # /verify 手動觸發驗證
```

### SKILL.md (verification-protocol)

```markdown
---
name: Verification Protocol
description: This skill should be used when the user asks to "verify code", "run verification", "check implementation", "validate changes", or when implementation phase completes. Provides multi-layer verification guidance.
version: 0.1.0
---

# 驗證協議技能

## 用途

Implementation Phase 完成後執行多層驗證，確保代碼品質。

## 驗證層級

### Minimal（快速）
適用：純格式修改、文檔更新
- Layer 1: Static Analysis

### Standard（標準）
適用：一般功能開發
- Layer 1: Static Analysis
- Layer 2: Unit Tests
- Layer 5: LLM Judge

### Thorough（完整）
適用：API 變更、安全相關
- Layer 1-6 全部執行

## 執行方式

調用 `scripts/run-verification.sh` 並傳入驗證等級：

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/run-verification.sh standard
```

## 預算感知

- 預算 > 70%: standard
- 預算 > 90%: minimal
- 預算用盡: Layer 1 only

## 更多資訊

詳細驗證層說明見 `references/verification-layers.md`
LLM Judge prompts 見 `references/llm-judge-prompts.md`
```

---

## 擴展 Plugin 2: vibe-engine-memory

### 職責

提供長期記憶能力 (Ch5)

### 檔案結構

```
vibe-engine-memory/
├── .claude-plugin/
│   └── plugin.json
│
├── skills/
│   └── memory-management/
│       ├── SKILL.md
│       ├── references/
│       │   ├── memory-types.md
│       │   └── retrieval-algorithm.md
│       └── scripts/
│           ├── store-memory.ts
│           ├── retrieve-memory.ts
│           └── consolidate-memory.ts
│
├── hooks/
│   ├── hooks.json
│   └── scripts/
│       └── inject-memories.sh
│
└── commands/
    ├── remember.md                 # /remember 手動儲存
    └── recall.md                   # /recall 手動檢索
```

### hooks.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/inject-memories.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "記憶固化。從對話中提取值得長期記憶的資訊。分類：semantic（專案事實）、episodic（經驗教訓）、procedural（操作程序）。只提取高價值資訊。回覆 JSON array: [{\"type\": \"...\", \"content\": \"...\", \"confidence\": 0.0-1.0}]",
            "timeout": 20
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "檢查用戶請求是否需要注入相關記憶。如果請求涉及過去的決策、經驗或專案知識，檢索並注入相關記憶。回覆 JSON: {\"inject\": boolean, \"memories\": [...]}",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

---

## 擴展 Plugin 3: vibe-engine-observability

### 職責

提供預算追蹤和觀測能力 (Ch6, Ch7)

### 檔案結構

```
vibe-engine-observability/
├── .claude-plugin/
│   └── plugin.json
│
├── skills/
│   ├── budget-tracking/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       └── track-usage.ts
│   │
│   └── logging/
│       ├── SKILL.md
│       └── references/
│           └── log-schema.md
│
├── hooks/
│   ├── hooks.json
│   └── scripts/
│       ├── log-operation.sh
│       └── check-budget.sh
│
└── commands/
    ├── budget.md                   # /budget 查看預算
    └── logs.md                     # /logs 查看日誌
```

### hooks.json

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/check-budget.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/log-operation.sh",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

---

## 擴展 Plugin 4: vibe-engine-methodology

### 職責

提供 SDD+TDD+BDD 開發方法論 (Ch10)

### 檔案結構

```
vibe-engine-methodology/
├── .claude-plugin/
│   └── plugin.json
│
├── skills/
│   ├── spec-generator/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   └── spec-schema.md
│   │   └── templates/
│   │       └── spec.yaml.template
│   │
│   └── health-check/
│       ├── SKILL.md
│       └── scripts/
│           └── calculate-health.ts
│
├── hooks/
│   └── hooks.json
│
└── commands/
    ├── spec.md                     # /spec 生成規格
    └── health.md                   # /health 健康檢查
```

### SKILL.md (spec-generator)

```markdown
---
name: Spec Generator
description: This skill should be used when the user asks to "create spec", "generate specification", "define requirements", "write spec.yaml", or when starting a new feature implementation. Provides SDD-style specification generation.
version: 0.1.0
---

# 規格生成技能

## 用途

從自然語言需求生成結構化規格，作為後續 TDD/BDD 的基礎。

## 漸進式生成

### Level 1: 快速規格
只需 name + description + done_criteria

### Level 2: 標準規格
加入 inputs, outputs, scenarios

### Level 3: 完整規格
加入 edge_cases, non_functional, dependencies

## 生成流程

1. 詢問需求描述
2. 識別 inputs/outputs
3. 生成 scenarios (Given-When-Then)
4. 請用戶確認
5. 輸出 spec.yaml

## 模板位置

`${CLAUDE_PLUGIN_ROOT}/templates/spec.yaml.template`

## 更多資訊

詳細 schema 見 `references/spec-schema.md`
```

---

## 依賴關係

```
┌─────────────────────────────────────────────────────────────┐
│                     vibe-engine (核心)                       │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐  │
│  │ 協調 (Ch1)  │ 狀態 (Ch3)  │ 錯誤 (Ch4)  │ 安全 (Ch9)  │  │
│  └─────────────┴─────────────┴─────────────┴─────────────┘  │
└─────────────────────────────────────────────────────────────┘
              ↑              ↑              ↑              ↑
              │              │              │              │
    ┌─────────┴───┐  ┌───────┴────┐  ┌──────┴─────┐  ┌────┴────────┐
    │ verification │  │   memory   │  │observability│  │ methodology │
    │    (Ch2)     │  │   (Ch5)    │  │  (Ch6,7)   │  │   (Ch10)    │
    └──────────────┘  └────────────┘  └────────────┘  └─────────────┘
          可選              可選            可選            可選
```

### 依賴規則

1. **核心 Plugin 無依賴** - 可獨立運作
2. **擴展 Plugins 依賴核心** - 需要 vibe-engine 已安裝
3. **擴展 Plugins 之間無依賴** - 可任意組合

---

## 安裝組合建議

### 最小安裝
```bash
# 只有核心協調能力
claude plugins install vibe-engine
```

### 標準安裝
```bash
# 核心 + 驗證 + 記憶
claude plugins install vibe-engine
claude plugins install vibe-engine-verification
claude plugins install vibe-engine-memory
```

### 完整安裝
```bash
# 所有功能
claude plugins install vibe-engine
claude plugins install vibe-engine-verification
claude plugins install vibe-engine-memory
claude plugins install vibe-engine-observability
claude plugins install vibe-engine-methodology
```

---

## 跨 Plugin 通訊

由於 Claude Code 的 plugin 是獨立的，跨 plugin 通訊透過：

### 1. 共享 Runtime 目錄

所有 plugins 共用 `.vibe-engine/` 目錄：

```
project/
└── .vibe-engine/
    ├── config.yaml          # 共享配置
    ├── tasks/               # 任務狀態（核心）
    ├── memory/              # 記憶儲存（memory plugin）
    ├── logs/                # 日誌（observability plugin）
    └── specs/               # 規格檔（methodology plugin）
```

### 2. 共享環境變數

SessionStart hook 設定共享變數：

```bash
# 在 $CLAUDE_ENV_FILE 設定
echo "export VIBE_ENGINE_ROOT=$CLAUDE_PROJECT_DIR/.vibe-engine" >> "$CLAUDE_ENV_FILE"
echo "export VIBE_AUTONOMY_LEVEL=L2" >> "$CLAUDE_ENV_FILE"
```

### 3. 共享 CLAUDE.md

核心 plugin 的 CLAUDE.md 被所有 agents 讀取，確保規則一致。

---

## Plugin 載入順序

Claude Code 會並行載入所有 enabled plugins，但 hooks 的執行有順序考量：

```yaml
# 建議的 hook 執行優先級
PreToolUse:
  1. security-check (核心)     # 最先：安全檢查
  2. budget-check (observability) # 其次：預算檢查
  3. router-guard (核心)       # 然後：路由檢查

PostToolUse:
  1. log-operation (observability) # 先記錄
  2. checkpoint-trigger (核心)    # 再存檔

SessionStart:
  1. init-runtime (核心)       # 先初始化
  2. inject-memories (memory)  # 再注入記憶

Stop:
  1. consolidate-memory (memory)  # 先固化記憶
  2. save-checkpoint (核心)       # 再保存狀態
```

**注意**：Claude Code 的 hooks 是並行執行的，上述順序是「邏輯建議」，實際需要在 hook 內部處理依賴。

---

## 總結

### 模組化決策

| 決策 | 選擇 | 理由 |
|------|------|------|
| Plugin 數量 | 1 核心 + 4 擴展 | 平衡靈活性和一致性 |
| 核心包含 | Ch1,3,4,8,9,11 | 基礎設施不可缺少 |
| 擴展分類 | 按功能領域 | 用戶按需安裝 |

### 組件分配

| 章節 | Plugin | 主要組件 |
|------|--------|----------|
| Ch1 協調 | 核心 | agents/, skills/task-decomposition |
| Ch2 驗證 | verification | skills/verification-protocol |
| Ch3 狀態 | 核心 | skills/state-management, hooks |
| Ch4 錯誤 | 核心 | skills/error-recovery |
| Ch5 記憶 | memory | skills/memory-management, hooks |
| Ch6 資源 | observability | skills/budget-tracking |
| Ch7 觀測 | observability | skills/logging |
| Ch8 自主 | 核心 | skills/autonomy-control, CLAUDE.md |
| Ch9 安全 | 核心 | hooks, CLAUDE.md |
| Ch10 方法論 | methodology | skills/spec-generator, skills/health-check |
| Ch11 衝突 | 核心 | CLAUDE.md |
```
