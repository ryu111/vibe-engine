# 16. 外部最佳實踐參考

## 來源

[everything-claude-code](https://github.com/affaan-m/everything-claude-code)
- **Stars**: 38,891
- **作者**: Affaan Mustafa（Anthropic Hackathon 獲獎者）
- **經驗**: 10+ 個月日常使用的實戰配置

---

## 關鍵發現

### 1. Agent 定義格式（簡化版）

**他們的格式**：
```markdown
---
name: architect
description: Software architecture specialist for system design, scalability, and technical decision-making. Use PROACTIVELY when planning new features, refactoring large systems, or making architectural decisions.
tools: ["Read", "Grep", "Glob"]
model: opus
---

[System Prompt]
```

**關鍵差異**：
- `description` 直接寫觸發條件，不用 `<example>` blocks
- 使用 "Use PROACTIVELY when..." 格式
- 更簡潔，專注於何時使用

**建議**：考慮採用簡化版 description，如果 Claude Code 支持這種格式。

---

### 2. Hooks 使用 Node.js（跨平台）

**他們的做法**：
```json
{
  "type": "command",
  "command": "node -e \"console.error('[Hook] BLOCKED: Dev server must run in tmux');process.exit(1)\""
}
```

**優點**：
- 跨平台（Windows, macOS, Linux）
- 不需要 bash
- 可以用 `${CLAUDE_PLUGIN_ROOT}/scripts/hooks/*.js`

**建議**：將 Vibe Engine 的 bash hooks 改為 Node.js scripts。

---

### 3. Continuous Learning System（持續學習系統）

**核心概念**：
```
Session Activity
      ↓
  Hooks 捕獲（100% 可靠）
      ↓
  observations.jsonl
      ↓
  Pattern Detection（背景 Haiku agent）
      ↓
  Instincts（原子學習單位）
      ↓
  /evolve → Skills/Commands/Agents
```

**Instinct 格式**：
```yaml
---
id: prefer-functional-style
trigger: "when writing new functions"
confidence: 0.7
domain: "code-style"
source: "session-observation"
---

# Prefer Functional Style

## Action
Use functional patterns over classes when appropriate.

## Evidence
- Observed 5 instances of functional pattern preference
```

**Confidence Scoring**：
| 分數 | 含義 | 行為 |
|------|------|------|
| 0.3 | Tentative | 建議但不強制 |
| 0.5 | Moderate | 相關時應用 |
| 0.7 | Strong | 自動批准 |
| 0.9 | Near-certain | 核心行為 |

**對 Vibe Engine 的啟示**：
- Memory 模組可以採用類似的 confidence scoring
- 用 hooks 觀察 session 比用 Stop hook 更可靠（100% vs ~80%）
- 考慮用 Haiku 作為背景 observer（成本低）

---

### 4. Tools 限制（最小權限）

**他們的做法**：
```markdown
# Architect Agent
tools: ["Read", "Grep", "Glob"]  # 只讀，不能修改

# Reviewer Agent
tools: ["Read", "Grep", "Glob", "Bash"]  # 可以執行 npm audit

# Developer Agent
tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]  # 完整權限
```

**關鍵原則**：
- Architect 和 Reviewer 不需要 Write/Edit
- 每個 agent 只給必要的工具
- 減少意外修改的風險

**對 Vibe Engine 的啟示**：
- 更新 Ch12 的 agents，明確限制 tools
- Reviewer 應該只有讀取權限

---

### 5. Skill 包含子組件

**他們的結構**：
```
skills/continuous-learning-v2/
├── SKILL.md           # 主要說明
├── config.json        # 配置
├── agents/            # 專屬 agents
├── hooks/             # 專屬 hooks
└── scripts/           # 工具腳本
```

**關鍵發現**：Skill 可以包含自己的 agents 和 hooks！

**對 Vibe Engine 的啟示**：
- verification-protocol skill 可以包含自己的 verification-checker agent
- memory-manager skill 可以包含 memory-retrieval agent

---

### 6. Context Window 管理

**他們的建議**：
> "Your 200k context window before compacting might only be 70k with too many tools enabled."

**規則**：
- 有 20-30 MCPs 在配置中，但只啟用 <10 個
- 保持 <80 個工具活躍
- 定期 `/compact` 清理 context

**對 Vibe Engine 的啟示**：
- observability 模組應該追蹤 context 使用量
- 建議在 budget-tracker 中加入 context % 警告

---

### 7. 實用 Hook Patterns

#### 7.1 阻擋危險操作
```json
{
  "matcher": "tool == \"Bash\" && tool_input.command matches \"(npm run dev|pnpm dev)\"",
  "hooks": [{
    "type": "command",
    "command": "node -e \"console.error('[Hook] BLOCKED: Dev server must run in tmux');process.exit(1)\""
  }],
  "description": "Block dev servers outside tmux"
}
```

#### 7.2 PostToolUse 自動格式化
```json
{
  "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\\\.(ts|tsx)$\"",
  "hooks": [{
    "type": "command",
    "command": "node -e \"const{execFileSync}=require('child_process');execFileSync('npx',['prettier','--write',process.env.FILE_PATH])\""
  }],
  "description": "Auto-format after edit"
}
```

#### 7.3 PreCompact 保存狀態
```json
{
  "matcher": "*",
  "hooks": [{
    "type": "command",
    "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/pre-compact.js\""
  }],
  "description": "Save state before context compaction"
}
```

---

### 8. Rules vs Skills 的區別

| 類型 | 位置 | 觸發 | 用途 |
|------|------|------|------|
| Rules | `~/.claude/rules/*.md` | 永遠生效 | 必須遵守的約束 |
| Skills | `~/.claude/skills/` | 按需觸發 | 工作流程和知識 |

**他們的 Rules 範例**：
- `security.md` - 不可硬編碼 secrets
- `coding-style.md` - 偏好 immutability
- `testing.md` - TDD 流程，80% coverage

**對 Vibe Engine 的啟示**：
- CLAUDE.md 應該更像 rules（必須遵守）
- Skills 提供「如何做」的指導

---

### 9. Git Worktrees 並行開發

**他們的建議**：
```bash
git worktree add ../feature-branch feature-branch
# 在每個 worktree 運行獨立的 Claude 實例
```

**優點**：
- 避免檔案衝突
- 每個 worktree 是獨立的 checkout
- 可以同時開發多個功能

**對 Vibe Engine 的啟示**：
- 可以考慮在 methodology 模組加入 worktree 支援
- 用於並行 SubAgents 的檔案隔離

---

### 10. ADR（Architecture Decision Records）

**他們的格式**：
```markdown
# ADR-001: Use Redis for Vector Storage

## Context
Need to store 1536-dimensional embeddings.

## Decision
Use Redis Stack with vector search.

## Consequences

### Positive
- Fast vector similarity search (<10ms)
- Simple deployment

### Negative
- In-memory (expensive for large datasets)

### Alternatives Considered
- PostgreSQL pgvector
- Pinecone

## Status
Accepted

## Date
2025-01-15
```

**對 Vibe Engine 的啟示**：
- methodology 模組可以自動生成 ADR
- 用於記錄架構決策

---

## 採納狀態追蹤

### ✅ 已採納（高優先級）

| 功能 | 狀態 | 更新位置 |
|------|------|----------|
| Node.js hooks | ✅ 完成 | Ch12, Ch13, hook-config-template.json |
| Tools 限制 | ✅ 完成 | Ch12 (Architect), agent-template.md |
| PreCompact hook | ✅ 完成 | Ch13, hook-config-template.json, interop-v1.yaml |
| Confidence scoring | ✅ 完成 | Ch5 (Memory) |
| Context % tracking | ✅ 完成 | Ch7 (Observability) |
| ADR 自動生成 | ✅ 完成 | Ch10 (Methodology) |

### ✅ 已採納（中優先級）

| 功能 | 狀態 | 更新位置 |
|------|------|----------|
| 簡化 Agent description | ✅ 完成 | agent-template.md（格式 A/B） |
| Skill 包含子組件 | ✅ 完成 | Ch12, skill-template.md |
| Instinct-based learning | ✅ 完成 | Ch5 (Memory 5.6) |
| Hook 協調機制 | ✅ 完成 | interop-v1.yaml |

### 📋 待評估（v2 考慮）

| 功能 | 狀態 | 備註 |
|------|------|------|
| Git worktrees | 待評估 | 用於並行 SubAgents 的檔案隔離 |
| /learn 命令 | 待評估 | 明確觸發學習 |
| /sessions 命令 | 待評估 | Session 管理/監控 |

---

## 與 Vibe Engine 設計的差異（更新後）

| 面向 | everything-claude-code | Vibe Engine (更新後) | 狀態 |
|------|------------------------|---------------------|------|
| Agent description | 簡化版 | 支援兩種格式（簡化版 + 完整版） | ✅ 整合 |
| Hooks 語言 | Node.js | Node.js | ✅ 對齊 |
| 學習系統 | Instinct-based | Memory + Instinct 整合 | ✅ 整合 |
| 模型選擇 | 明確指定 | inherit 為主 + 按需指定 | ✅ 對齊 |
| Context 管理 | 工具數量控制 | Context 監控 + 警告 | ✅ 整合 |
| ADR | 手動/自動 | 自動觸發 + /adr 命令 | ✅ 整合 |

---

## 總結

### 本次迭代採納的功能（6 輪）

| 輪次 | 主題 | 關鍵更新 |
|------|------|----------|
| 1 | 基礎最佳實踐 | Node.js hooks, Tools 限制, PreCompact hook |
| 2 | Instinct Learning | Ch5 添加 5.6 Instinct-based Learning |
| 3 | Skill 子組件 | Skill 包含專屬 agents/hooks |
| 4 | ADR 自動生成 | Ch10 添加 10.7 ADR 自動生成 |
| 5 | Context 管理 | Ch7 添加 7.6 Context Window 管理 |
| 6 | 整合更新 | 本總結 |

### 更新的檔案清單

```
docs/research/
├── 05-memory.md              # +Confidence Scoring, +Instinct Learning
├── 07-observability.md       # +Context Window 管理
├── 10-methodology.md         # +ADR 自動生成
├── 12-plugin-architecture.md # +Agent tools 限制, +Skill 子組件, +Node.js scripts
├── 13-plugin-modularization.md # +Node.js hooks, +PreCompact hook
└── 16-external-best-practices.md # 本檔案更新

docs/templates/
├── agent-template.md         # +簡化版 description, +Tools 最佳實踐
├── skill-template.md         # +子組件支援
└── hook-config-template.json # +Node.js, +PreCompact

docs/protocols/
└── interop-v1.yaml           # +Hook 協調機制, +PreCompact 協調
```

### 最有價值的發現（第一輪）

1. **Node.js hooks** - 跨平台是必要的（Windows 支援）
2. **Tools 限制** - 最小權限原則（Architect/Reviewer 只讀）
3. **PreCompact hook** - 在 context compaction 前保存狀態
4. **Confidence scoring** - 為學習內容分級（0.3-1.0）
5. **Instinct-based learning** - 原子學習單位 + /evolve 演化
6. **Skill 子組件** - Skills 可包含專屬 agents/hooks
7. **Context 監控** - 工具數量控制 + 使用率警告
8. **ADR 自動生成** - 記錄架構決策的 why

---

## 第二輪深度分析

### 新發現的 Skills

| Skill | 用途 | 整合位置 |
|-------|------|----------|
| iterative-retrieval | SubAgent 漸進式 context 收集 | Ch12, Ch17 |
| strategic-compact | 智慧化手動 compact 建議 | Ch12, Ch17 |
| verification-loop | 6 階段 PR 驗證流程 | Ch12, Ch17 |
| tdd-workflow | 嚴格的測試驅動開發 | Ch10, Ch12 |
| eval-harness | EDD 評估驅動開發 | Ch10, Ch12, Ch17 |
| coding-standards | 通用編碼標準 | 參考 |
| backend-patterns | 後端開發模式 | 參考 |

### 新發現的 Rules

| Rule | 內容 | 整合位置 |
|------|------|----------|
| security.md | 8 項必要安全檢查 + 事件響應 | Ch17 |
| testing.md | 80% 覆蓋率 + RED-GREEN-REFACTOR | Ch10, Ch17 |
| agents.md | 何時自動啟動 agents + 並行策略 | Ch17 |
| performance.md | 模型選擇策略（Haiku/Sonnet/Opus） | Ch17 |

### 新發現的 Commands

| Command | 功能 | 整合位置 |
|---------|------|----------|
| /tdd | TDD 工作流程（RED-GREEN-REFACTOR） | Ch12 |
| /verify | 6 階段驗證（build → diff review） | Ch12 |
| /learn | 從 session 提取學習模式 | Ch5 |
| /checkpoint | Git 整合的快照管理 | Ch5 |
| /evolve | instincts → commands/skills/agents | Ch5 |

### 新發現的 Agents

| Agent | 角色 | 特點 |
|-------|------|------|
| planner | 4 階段規劃流程 | 具體檔案路徑 + 複雜度估算 |
| security-reviewer | OWASP Top 10 + 金融安全 | 主動觸發 + 嚴重性分級 |
| build-error-resolver | 最小化修改原則 | 速度優先 + <5% diff |

### 新發現的 Hooks 模式

```yaml
advanced_hooks:
  # tmux 強制
  force_tmux_for_dev_server:
    matcher: "Bash"
    pattern: "npm run dev|pnpm dev"
    action: "BLOCK: Dev server must run in tmux"

  # git push 提醒
  git_push_reminder:
    matcher: "Bash"
    pattern: "git push"
    action: "提醒檢查變更"

  # markdown 創建阻擋
  block_unnecessary_markdown:
    matcher: "Write"
    pattern: "*.md"
    action: "除非用戶明確要求，否則 BLOCK"

  # 自動格式化
  auto_format_on_edit:
    matcher: "Edit|Write"
    pattern: "*.ts|*.tsx"
    action: "npx prettier --write"

  # console.log 警告
  warn_console_log:
    matcher: "Edit|Write"
    path: "src/"
    action: "警告 console.log 語句"
```

### 關鍵概念整合

#### Iterative Retrieval Pattern

```
問題：SubAgent 不知道需要什麼 context
解決：4 階段循環（DISPATCH → EVALUATE → REFINE → LOOP）
效果：3-4 個高相關性檔案，而非數十個普通匹配
```

#### Strategic Compact

```
問題：系統隨機觸發 compaction 中斷工作
解決：在邏輯邊界手動觸發（50 次工具呼叫後建議）
原則："Hook 告訴你何時，你決定是否"
```

#### Verification Loop

```
6 階段：Build → Types → Lint → Tests → Security → Diff
模式：quick | full | pre-commit | pre-pr
輸出：結構化報告 + READY/NOT READY 狀態
```

#### Eval-Driven Development

```
概念：Evaluations = AI 開發的單元測試
類型：Capability evals + Regression evals
評分：code-based (100%) > model-based (~90%) > human-based
指標：pass@k（k 次內成功）, pass^k（連續 k 次成功）
```

#### Build Error Resolver 原則

```
原則："修復錯誤，驗證通過，繼續前進"
目標：速度和精確優先於完美
標準：構建通過 + 受影響檔案修改 < 5%
避免：重構、架構變更、功能開發
```

### 第二輪採納狀態

| 功能 | 狀態 | 更新位置 |
|------|------|----------|
| Iterative Retrieval Skill | ✅ 完成 | Ch12, Ch17 |
| Strategic Compact Skill | ✅ 完成 | Ch12, Ch17 |
| Verification Loop Skill | ✅ 完成 | Ch12, Ch17 |
| TDD Workflow Skill | ✅ 完成 | Ch10, Ch12 |
| Eval Harness (EDD) | ✅ 完成 | Ch10, Ch12, Ch17 |
| /checkpoint 詳細實作 | ✅ 完成 | Ch5 |
| /evolve 詳細實作 | ✅ 完成 | Ch5 |
| Security Rules | ✅ 整合 | Ch17 |
| Testing Rules | ✅ 整合 | Ch17 |
| Agents Rules | ✅ 整合 | Ch17 |
| Performance Rules | ✅ 整合 | Ch17 |
| Planner Agent 模式 | ✅ 整合 | Ch17 |
| Build Error Resolver 模式 | ✅ 整合 | Ch17 |
| Advanced Hooks 模式 | ✅ 整合 | Ch17 |

### 新增的檔案清單（第二輪）

```
docs/research/
├── 17-advanced-patterns.md    # 新建：整合所有進階模式
├── 12-plugin-architecture.md  # +5 個新 Skills
├── 10-methodology.md          # +EDD 評估驅動開發
├── 05-memory.md               # +/checkpoint, +/evolve 詳細實作
└── 16-external-best-practices.md  # 本次更新
```

### 最有價值的發現（第二輪）

1. **Iterative Retrieval** - SubAgent context 收集的標準模式
2. **Strategic Compact** - 用戶控制的智慧 compact 時機
3. **Verification Loop** - 6 階段標準化 PR 驗證
4. **EDD (Eval-Driven Development)** - AI 開發的單元測試思維
5. **/checkpoint** - Git 整合的進度追蹤
6. **/evolve** - instincts 自動聚類成 commands/skills/agents
7. **Build Error Resolver** - 最小化修改原則（<5% diff）
8. **Advanced Hooks** - tmux 強制、auto-format、console.log 警告

---

## 待評估（v2 考慮）

| 功能 | 狀態 | 備註 |
|------|------|------|
| Git worktrees | 待評估 | 用於並行 SubAgents 的檔案隔離 |
| /learn 命令 | 待評估 | 明確觸發學習（類似 /evolve） |
| /sessions 命令 | 待評估 | Session 管理/監控 |
| coding-standards Skill | ✅ 整合 | Ch18 完整參考 |
| backend-patterns Skill | ✅ 整合 | Ch18 完整參考 |
| golang-patterns Skill | ✅ 整合 | Ch18 完整參考 |
| frontend-patterns Skill | ✅ 整合 | Ch18 完整參考 |

---

## 第三輪深度分析

### 新發現的 MCP 整合

| MCP Server | 類型 | 用途 |
|------------|------|------|
| github | npm | GitHub operations - PRs, issues, repos |
| supabase | npm | Supabase database operations |
| memory | npm | Persistent memory across sessions |
| sequential-thinking | npm | Chain-of-thought reasoning |
| vercel | http | Vercel deployments and projects |
| railway | npm | Railway deployments |
| cloudflare-docs | http | Cloudflare documentation search |
| cloudflare-workers-builds | http | Cloudflare Workers builds |
| cloudflare-workers-bindings | http | Cloudflare Workers bindings |
| cloudflare-observability | http | Cloudflare observability/logs |
| clickhouse | http | ClickHouse analytics queries |
| context7 | npm | Live documentation lookup |
| firecrawl | npm | Web scraping and crawling |
| magic | npm | Magic UI components |
| filesystem | npm | Filesystem operations |

### 完整 Hooks 實作發現

| Hook 事件 | 功能 | 說明 |
|-----------|------|------|
| PreToolUse | tmux 強制 | Dev server 必須在 tmux 中 |
| PreToolUse | git push 提醒 | 推送前提醒檢查 |
| PreToolUse | markdown 阻擋 | 防止不必要的 .md 檔案 |
| PreToolUse | compact 建議 | 邏輯邊界建議 compact |
| PreCompact | 狀態保存 | compaction 前保存狀態 |
| PostToolUse | PR 日誌 | 記錄 PR URL |
| PostToolUse | 自動格式化 | Prettier 格式化 |
| PostToolUse | TypeScript 檢查 | 即時類型檢查 |
| PostToolUse | console.log 警告 | 警告遺留日誌 |
| SessionEnd | 模式評估 | 提取可學習模式 |

### 語言/框架 Skills 完整清單

| 領域 | Skills |
|------|--------|
| **Go** | golang-patterns, golang-testing |
| **Python** | python-patterns, python-testing, django-patterns, django-security, django-tdd, django-verification |
| **Java** | java-coding-standards, jpa-patterns, springboot-patterns, springboot-security, springboot-tdd, springboot-verification |
| **Frontend** | frontend-patterns |
| **Database** | postgres-patterns, clickhouse-io |
| **Testing** | tdd-workflow, eval-harness, verification-loop |
| **Context** | iterative-retrieval, strategic-compact |
| **Security** | security-review |
| **Learning** | continuous-learning, continuous-learning-v2 |

### 第三輪採納狀態

| 功能 | 狀態 | 更新位置 |
|------|------|----------|
| MCP 整合配置 | ✅ 完成 | Ch18 |
| 完整 hooks.json | ✅ 完成 | Ch18 |
| golang-patterns Skill | ✅ 整合 | Ch18 |
| frontend-patterns Skill | ✅ 整合 | Ch18 |
| django-patterns Skill | ✅ 整合 | Ch18 |
| python-patterns Skill | ✅ 整合 | Ch18 |
| springboot-patterns Skill | ✅ 整合 | Ch18 |
| security-review Skill | ✅ 整合 | Ch18 |
| continuous-learning-v2 | ✅ 整合 | Ch18 |
| Planner Agent | ✅ 整合 | Ch18 |
| Build Error Resolver Agent | ✅ 整合 | Ch18 |
| Security Reviewer Agent | ✅ 整合 | Ch18 |
| Rules 最佳實踐 | ✅ 整合 | Ch18 |

### 新增的檔案清單（第三輪）

```
docs/research/
├── 18-comprehensive-patterns.md  # 新建：完整模式參考
└── 16-external-best-practices.md # 本次更新
```

### 最有價值的發現（第三輪）

1. **MCP 整合配置** - 16 個 MCP servers 完整配置，包含 GitHub、Supabase、Vercel、Cloudflare 等
2. **完整 hooks.json** - 生產級 hooks 配置，涵蓋 PreToolUse、PostToolUse、PreCompact、SessionEnd 等
3. **語言 Skills** - golang, python, java 完整開發模式和最佳實踐
4. **框架 Skills** - Django, Spring Boot, React/Next.js 架構模式
5. **continuous-learning-v2** - Instinct-based 學習系統，100% hooks 觀察 + Haiku 分析
6. **Agent 定義** - Planner、Build Error Resolver、Security Reviewer 完整定義
7. **Rules 系統** - Security、Testing、Performance、Agents 規則最佳實踐
8. **Async Hooks** - 異步 hooks 用於不阻擋的後台分析

---

## 總結：三輪迭代採納的功能

| 輪次 | 主題 | 關鍵發現 |
|------|------|----------|
| **第一輪** | 基礎最佳實踐 | Node.js hooks, Tools 限制, PreCompact hook, Confidence scoring |
| **第二輪** | 進階模式 | Iterative Retrieval, Strategic Compact, Verification Loop, EDD, /checkpoint, /evolve |
| **第三輪** | 完整參考 | MCP 整合, 完整 hooks.json, 語言/框架 Skills, Agents 定義, Rules 系統 |

### 所有更新的檔案

```
docs/research/
├── 05-memory.md              # +Confidence Scoring, +Instinct Learning, +/checkpoint, +/evolve
├── 07-observability.md       # +Context Window 管理
├── 10-methodology.md         # +ADR 自動生成, +EDD
├── 12-plugin-architecture.md # +Agent tools 限制, +Skill 子組件, +Skills 2.7-2.11
├── 13-plugin-modularization.md # +Node.js hooks, +PreCompact hook
├── 16-external-best-practices.md # 採納追蹤（本文件）
├── 17-advanced-patterns.md   # Iterative Retrieval, Strategic Compact, Verification Loop
└── 18-comprehensive-patterns.md # MCP, hooks.json, 語言/框架 Skills, Agents, Rules

docs/templates/
├── agent-template.md         # +簡化版 description, +Tools 最佳實踐
├── skill-template.md         # +子組件支援
└── hook-config-template.json # +Node.js, +PreCompact

docs/protocols/
└── interop-v1.yaml           # +Hook 協調機制, +PreCompact 協調
```

---

## 第四輪深度分析

### 新發現的 Commands 系統

| Command | 功能 | 重要性 |
|---------|------|--------|
| `/learn` | 從會話提取可重用模式 | 學習閉環核心 |
| `/evolve` | instincts → commands/skills/agents | 自動進化 |
| `/orchestrate` | 多 Agent 編排工作流 | 任務自動化 |
| `/plan` | 需求分析 + 等待確認 | 安全規劃 |
| `/verify` | 6 階段驗證（Build→Diff） | 品質保證 |
| `/checkpoint` | Git 整合的進度追蹤 | 狀態管理 |
| `/tdd` | RED-GREEN-REFACTOR 循環 | TDD 強制 |
| `/sessions` | 會話歷史管理 | 知識累積 |
| `/instinct-status` | 顯示學習到的 instincts | 學習監控 |
| `/code-review` | 安全 + 品質審查 | 安全優先 |

### 新發現的 Contexts 系統

| Context | 模式 | 核心哲學 |
|---------|------|----------|
| `dev.md` | 主動開發 | 速度優先：先讓它能跑 |
| `research.md` | 探索調查 | 理解優先：先搞懂再動手 |
| `review.md` | PR 審查 | 品質優先：系統性檢查 |

### Longform Guide 核心發現

| 概念 | 說明 |
|------|------|
| Token 經濟學 | 90% Sonnet，只在 5+ 檔案/架構/安全時升 Opus |
| MCP 替代 | 用 skills/commands 取代 MCP 減少 context 佔用 |
| mgrep 優化 | 比標準 grep 減少約 50% token |
| 記憶持久化 | PreCompact/Stop/SessionStart hooks |
| Two-Instance | Scaffolding + Deep Research 並行 |
| Iterative Retrieval | 最多 3 輪漸進式 context 收集 |

### 新分析的 Skills（8 個）

| Skill | 用途 |
|-------|------|
| iterative-retrieval | 4 階段漸進式 context 收集 |
| strategic-compact | 邏輯邊界建議 /compact |
| verification-loop | 6 階段 PR 驗證 |
| tdd-workflow | 7 步驟 TDD 循環 |
| eval-harness | EDD 評估驅動開發 |
| postgres-patterns | PostgreSQL 最佳實踐 |
| coding-standards | TypeScript/React 編碼標準 |
| backend-patterns | 後端架構模式 |

### 新分析的 Agents（10 個）

| Agent | 模型 | 工具 | 觸發類型 |
|-------|------|------|----------|
| architect | opus | 唯讀 | PROACTIVELY |
| code-reviewer | opus | 唯讀+Bash | MUST USE |
| database-reviewer | opus | 完整 | PROACTIVELY |
| doc-updater | opus | 完整 | PROACTIVELY |
| e2e-runner | opus | 完整 | PROACTIVELY |
| go-reviewer | opus | 唯讀+Bash | MUST USE |
| python-reviewer | opus | 唯讀+Bash | MUST USE |
| refactor-cleaner | opus | 完整 | PROACTIVELY |
| tdd-guide | opus | 完整（無Glob） | PROACTIVELY |
| go-build-resolver | opus | 完整 | WHEN FAILS |

### 第四輪採納狀態

| 功能 | 狀態 | 更新位置 |
|------|------|----------|
| Commands 系統（10 核心） | ✅ 完成 | Ch19 |
| Contexts 系統（3 情境） | ✅ 完成 | Ch19 |
| Longform Guide 核心概念 | ✅ 完成 | Ch19 |
| iterative-retrieval Skill | ✅ 完成 | Ch19 |
| strategic-compact Skill | ✅ 完成 | Ch19 |
| verification-loop Skill | ✅ 完成 | Ch19 |
| tdd-workflow Skill | ✅ 完成 | Ch19 |
| eval-harness Skill | ✅ 完成 | Ch19 |
| postgres-patterns Skill | ✅ 完成 | Ch19 |
| coding-standards Skill | ✅ 完成 | Ch19 |
| backend-patterns Skill | ✅ 完成 | Ch19 |
| 10 個新 Agents 分析 | ✅ 完成 | Ch19 |
| Schemas 系統（3 個） | ✅ 完成 | Ch19 |

### 新增的檔案清單（第四輪）

```
docs/research/
├── 19-commands-contexts-guide.md  # 新建：Commands、Contexts、Longform Guide
└── 16-external-best-practices.md  # 本次更新
```

### 最有價值的發現（第四輪）

1. **Commands 學習閉環** - observe → learn → evolve → apply 的完整循環
2. **Contexts 工作模式** - dev/research/review 三種模式切換
3. **Token 經濟學** - 90% Sonnet 原則，MCP 替代策略
4. **/plan 安全規劃** - CRITICAL: 必須等待用戶確認才能開始編碼
5. **/orchestrate 編排** - 4 種預設工作流（feature/bugfix/refactor/security）
6. **Agent 工具權限** - 所有 reviewer 使用唯讀工具，只有實作者有完整權限
7. **Iterative Retrieval** - 最多 3 輪漸進式 context 收集
8. **Schemas 驗證** - hooks/plugin/package-manager 配置驗證

---

## 總結：四輪迭代採納的功能

| 輪次 | 主題 | 關鍵發現 |
|------|------|----------|
| **第一輪** | 基礎最佳實踐 | Node.js hooks, Tools 限制, PreCompact hook, Confidence scoring |
| **第二輪** | 進階模式 | Iterative Retrieval, Strategic Compact, Verification Loop, EDD, /checkpoint, /evolve |
| **第三輪** | 完整參考 | MCP 整合, 完整 hooks.json, 語言/框架 Skills, Agents 定義, Rules 系統 |
| **第四輪** | Commands + Contexts | 25 Commands, 3 Contexts, Longform Guide, 18 Skills/Agents 分析 |

### 所有更新的檔案（四輪總計）

```
docs/research/
├── 05-memory.md              # +Confidence Scoring, +Instinct Learning, +/checkpoint, +/evolve
├── 07-observability.md       # +Context Window 管理
├── 10-methodology.md         # +ADR 自動生成, +EDD
├── 12-plugin-architecture.md # +Agent tools 限制, +Skill 子組件, +Skills 2.7-2.11
├── 13-plugin-modularization.md # +Node.js hooks, +PreCompact hook
├── 16-external-best-practices.md # 採納追蹤（本文件）
├── 17-advanced-patterns.md   # Iterative Retrieval, Strategic Compact, Verification Loop
├── 18-comprehensive-patterns.md # MCP, hooks.json, 語言/框架 Skills, Agents, Rules
└── 19-commands-contexts-guide.md # Commands, Contexts, Longform Guide, Skills/Agents 分析

docs/templates/
├── agent-template.md         # +簡化版 description, +Tools 最佳實踐
├── skill-template.md         # +子組件支援
└── hook-config-template.json # +Node.js, +PreCompact

docs/protocols/
└── interop-v1.yaml           # +Hook 協調機制, +PreCompact 協調
```

### 完整分析覆蓋率

| 組件類型 | 總數 | 已分析 | 覆蓋率 |
|----------|------|--------|--------|
| Commands | 25 | 10（核心） | 40% |
| Contexts | 3 | 3 | 100% |
| Skills | 28 | 15 | 54% |
| Agents | 13 | 13 | 100% |
| Rules | 8 | 8 | 100% |
| Schemas | 3 | 3 | 100% |
| MCP Servers | 16 | 16 | 100% |
