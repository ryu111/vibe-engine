# 19. Commands、Contexts 與進階指南

來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code) 深度分析（第四輪）

本章整合了 everything-claude-code 的 Commands 系統、Contexts 情境切換、Longform Guide 核心概念、以及完整的 Skills/Agents 分析。

---

## 19.1 Commands 系統

### 概述

Commands 是用戶互動的主要入口，提供可執行的斜線命令。everything-claude-code 包含 25 個命令，核心功能包括：

- **學習系統**：`/learn`, `/evolve`, `/instinct-status`
- **任務編排**：`/orchestrate`, `/plan`, `/checkpoint`
- **測試驗證**：`/verify`, `/tdd`, `/code-review`
- **會話管理**：`/sessions`

### 核心命令詳解

#### 19.1.1 /learn - 模式提取

```yaml
command: /learn
purpose: 分析當前會話，提取可重用的模式並保存為技能檔案
trigger: 在會話中解決非平凡問題後手動執行

workflow:
  1. 審查會話尋找可提取模式
  2. 識別最有價值的洞察
  3. 草擬技能檔案
  4. 確認後儲存

output: ~/.claude/skills/learned/[pattern-name].md

extraction_types:
  - 錯誤解決模式
  - 調試技術
  - 解決方案/繞過方法
  - 專案特定模式
```

#### 19.1.2 /evolve - 本能進化

```yaml
command: /evolve [--domain <domain>] [--dry-run] [--execute]
purpose: 將相關的 instincts 聚類成更高級結構

workflow:
  1. 讀取所有 instincts
  2. 按域/觸發器/動作序列分組
  3. 判定進化類型
  4. 生成對應檔案

evolution_rules:
  to_command: "用戶明確請求的動作（多個 instincts 描述同一用戶流程）"
  to_skill: "自動觸發的行為（模式匹配、錯誤處理、代碼風格）"
  to_agent: "複雜多步驟流程（調試、重構、研究任務）"

output: ~/.claude/homunculus/evolved/{commands|skills|agents}/
```

#### 19.1.3 /orchestrate - 編排命令

```yaml
command: /orchestrate [workflow-type] [task-description]
purpose: 按順序調用多個 Agent 完成複雜任務

workflow_types:
  feature:
    agents: [planner, tdd-guide, code-reviewer, security-reviewer]
  bugfix:
    agents: [explorer, tdd-guide, code-reviewer]
  refactor:
    agents: [architect, code-reviewer, tdd-guide]
  security:
    agents: [security-reviewer, code-reviewer, architect]

handoff_format: |
  ## HANDOFF: [previous-agent] -> [next-agent]
  ### Context / Findings / Files Modified / Open Questions / Recommendations

output: ORCHESTRATION REPORT
```

#### 19.1.4 /plan - 規劃命令

```yaml
command: /plan
purpose: 重述需求、評估風險、創建分步實施計劃

workflow:
  1. 重述需求
  2. 分解為階段
  3. 識別依賴
  4. 評估風險
  5. 估算複雜度
  6. "**等待用戶確認**"  # CRITICAL

confirmation_required:
  accept: ["yes", "proceed", "go ahead", "looks good"]
  modify: "modify: [changes]"
  reject: "different approach: [alternative]"
```

#### 19.1.5 /verify - 驗證命令

```yaml
command: /verify [quick|full|pre-commit|pre-pr]
purpose: 對當前代碼庫執行全面驗證檢查

modes:
  quick: "Build + Types"
  full: "所有 6 階段（預設）"
  pre-commit: "Build + Types + Lint + Security"
  pre-pr: "完整檢查 + 額外安全掃描"

phases:
  1_build: "npm run build"
  2_types: "npx tsc --noEmit"
  3_lint: "npm run lint"
  4_tests: "npm run test -- --coverage"
  5_secrets: "grep + npm audit"
  6_diff: "git diff --stat"

output: |
  VERIFICATION: [PASS/FAIL]
  Build:    [OK/FAIL]
  Types:    [OK/X errors]
  Lint:     [OK/X issues]
  Tests:    [X/Y passed, Z% coverage]
  Secrets:  [OK/X found]
  Logs:     [OK/X console.logs]
  Ready for PR: [YES/NO]
```

#### 19.1.6 /checkpoint - 檢查點命令

```yaml
command: /checkpoint [create|verify|list] [name]
purpose: 創建或驗證工作流程中的檢查點

operations:
  create:
    steps: ["驗證 clean state", "git stash/commit", "記錄日誌"]
    output: ".claude/checkpoints.log"

  verify:
    comparison:
      - "檔案增減數量"
      - "測試結果變化"
      - "代碼覆蓋率差異"
      - "構建狀態"

typical_workflow:
  1_start: "/checkpoint create feature-start"
  2_milestone: "/checkpoint create core-done"
  3_verify: "/checkpoint verify core-done"
  4_complete: "/checkpoint create ready-for-test"
  5_final: "/checkpoint verify feature-start"
```

#### 19.1.7 /instinct-status - 本能狀態

```yaml
command: /instinct-status [--domain <name>] [--low-confidence] [--high-confidence]
purpose: 顯示所有學習到的 instincts 及其信心等級

output_format: |
  ## Code Style (4 instincts)

  ### prefer-functional-style
  Trigger: when writing new functions
  Action: Use functional patterns over classes
  Confidence: ████████░░ 80%
  Source: session-observation | Last updated: 2025-01-22

filters:
  domain: "按領域過濾"
  low_confidence: "信心 < 0.5"
  high_confidence: "信心 >= 0.7"
  source: "按來源過濾"
  json: "JSON 格式輸出"
```

---

## 19.2 Contexts 系統

### 概述

Contexts 是工作模式切換機制，根據不同工作場景調整 Claude Code 的行為模式和優先策略。

### 三種 Context 定義

#### 19.2.1 Development Context (dev.md)

```yaml
mode: "Active development"
focus: "實作、編碼、建構功能"

behaviors:
  - "先寫程式碼，後解釋"
  - "偏好可運行的解決方案，而非完美方案"
  - "變更後執行測試"
  - "保持原子化提交"

priorities:
  1: "Get it working - 先讓它能運行"
  2: "Get it right - 讓它正確"
  3: "Get it clean - 讓它整潔"

preferred_tools:
  - Edit, Write  # 程式碼變更
  - Bash         # 執行測試/建構
  - Grep, Glob   # 搜尋程式碼
```

#### 19.2.2 Research Context (research.md)

```yaml
mode: "Exploration, investigation, learning"
focus: "行動前先理解"

behaviors:
  - "廣泛閱讀後再下結論"
  - "提出澄清問題"
  - "邊研究邊記錄發現"
  - "在理解清晰前不寫程式碼"

research_flow:
  1: "理解問題"
  2: "探索相關程式碼/文件"
  3: "形成假設"
  4: "以證據驗證"
  5: "總結發現"

preferred_tools:
  - Read              # 理解程式碼
  - Grep, Glob        # 尋找模式
  - WebSearch, WebFetch  # 外部文件
  - Task with Explore    # 程式碼庫問題

output_principle: "發現先行，建議其次"
```

#### 19.2.3 Review Context (review.md)

```yaml
mode: "PR review, code analysis"
focus: "品質、安全性、可維護性"

behaviors:
  - "評論前徹底閱讀"
  - "按嚴重程度排序問題（critical > high > medium > low）"
  - "建議修復方案，而非僅指出問題"
  - "檢查安全漏洞"

review_checklist:
  - "邏輯錯誤"
  - "邊界情況"
  - "錯誤處理"
  - "安全性（注入、認證、密鑰）"
  - "效能"
  - "可讀性"
  - "測試覆蓋率"

output_format: "按檔案分組，嚴重程度優先"
```

### Context 與 Agents/Skills 的互動

```
┌─────────────────────────────────────────────────────────┐
│                    Context Layer                         │
│  ┌─────────┐    ┌─────────────┐    ┌──────────┐        │
│  │  dev.md │    │ research.md │    │ review.md│        │
│  └────┬────┘    └──────┬──────┘    └────┬─────┘        │
└───────┼────────────────┼─────────────────┼──────────────┘
        │                │                 │
        ▼                ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│                    Agents Layer                          │
│  planner, architect, tdd-guide, code-reviewer,          │
│  security-reviewer, build-error-resolver...             │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│                    Skills Layer                          │
│  coding-standards, backend-patterns, tdd-workflow,      │
│  security-review, verification-loop...                  │
└─────────────────────────────────────────────────────────┘
```

| Context | 主要配合的 Agents | 主要使用的 Skills |
|---------|------------------|------------------|
| **dev** | planner, tdd-guide, build-error-resolver | tdd-workflow, coding-standards, backend-patterns |
| **research** | architect (搭配 Explore agent) | iterative-retrieval, continuous-learning |
| **review** | code-reviewer, security-reviewer, go-reviewer | security-review, verification-loop, eval-harness |

---

## 19.3 Longform Guide 核心概念

### Token 經濟學

```yaml
token_economics:
  principle: "最大化每個 token 的價值"

  model_selection:
    haiku: ["探索/搜尋", "簡單編輯", "撰寫文件"]
    sonnet: ["多檔實作", "PR 審查"]  # 90% 的程式設計任務
    opus: ["複雜架構", "安全分析", "除錯複雜 Bug"]

  upgrade_to_opus_when:
    - "第一次嘗試失敗"
    - "任務跨越 5+ 檔案"
    - "架構決策"
    - "安全關鍵程式碼"

mcp_optimization:
  insight: "許多 MCP 只是包裝 CLI"
  recommendation: "用 skills 和 commands 取代 MCP"
  example: "/gh-pr command 包裝 gh pr create"
  benefit: "減少 context window 佔用和 token 消耗"

tool_optimization:
  mgrep: "相比 grep/ripgrep，平均減少約 50% token 使用"
  modular_code: "主檔案維持在數百行而非數千行"
```

### 記憶持久化

```yaml
memory_persistence:
  session_storage:
    content:
      - "哪些方法有效（附帶證據）"
      - "哪些方法嘗試過但失敗"
      - "尚未嘗試的方法和待辦事項"
    location: ".tmp/{session-id}.md"

  key_hooks:
    PreCompact: "壓縮前儲存重要狀態"
    Stop: "Session 結束時持久化學習內容"
    SessionStart: "新 Session 自動載入前次 context"

  why_stop_not_userpromptsubmit:
    reason: "UserPromptSubmit 每條訊息都執行，增加延遲"
    alternative: "Stop 只在 session 結束時執行，輕量無負擔"
```

### 驗證迴圈

```yaml
verification_loops:
  checkpoint_based:
    description: "設定明確檢查點，驗證定義標準，修復後再繼續"

  continuous:
    description: "每 N 分鐘或重大變更後執行完整測試套件"

  metrics:
    pass_at_k: "k 次嘗試中至少一次成功（只需要能用）"
    pass_caret_k: "k 次嘗試全部成功（需要一致性）"
```

### 並行化策略

```yaml
parallelization:
  git_worktrees:
    commands: |
      git worktree add ../project-feature-a feature-a
      git worktree add ../project-feature-b feature-b
    use_case: "多功能並行開發"

  cascade_method:
    steps:
      - "新任務在右邊新開 tab"
      - "從左到右掃描，最舊到最新"
      - "最多同時關注 3-4 個任務"

  two_instance_kickoff:
    instance_1:
      role: "Scaffolding Agent"
      task: "建立專案結構、設定配置"
    instance_2:
      role: "Deep Research Agent"
      task: "連接服務、建立 PRD、架構圖、文件參考"
```

### Sub-Agent 最佳實踐

```yaml
subagent_best_practices:
  context_problem: "Sub-agent 只知道字面查詢，不知道背後目的"

  iterative_retrieval_pattern:
    steps:
      1: "Orchestrator 評估每個 sub-agent 回傳"
      2: "在接受前詢問後續問題"
      3: "Sub-agent 回到來源獲取答案"
      4: "循環直到滿足（最多 3 輪）"

  sequential_phases:
    phase_1: "RESEARCH → research-summary.md"
    phase_2: "PLAN → plan.md"
    phase_3: "IMPLEMENT → code changes"
    phase_4: "REVIEW → review-comments.md"
    phase_5: "VERIFY → done or loop back"

  key_rules:
    - "每個 agent 一個清晰輸入，產生一個清晰輸出"
    - "輸出成為下階段輸入"
    - "不跳過階段"
    - "Agent 之間使用 /clear"
    - "中間輸出存檔"
```

---

## 19.4 進階 Skills 分析

### 19.4.1 Iterative Retrieval（迭代檢索）

```yaml
skill: iterative-retrieval
purpose: 解決多代理工作流中的「上下文問題」

trigger: "子代理需要檢索程式碼上下文時"

workflow:
  max_iterations: 3
  phases: ["DISPATCH", "EVALUATE", "REFINE", "LOOP"]

dispatch: "以廣泛的關鍵字和模式開始搜尋"

evaluate:
  high_0.8_1.0: "直接實作目標功能"
  medium_0.5_0.7: "包含相關模式或類型"
  low_0.2_0.4: "間接相關"

refine: "根據評估結果更新搜尋條件，學習專案術語"

termination:
  - "找到 3+ 個高相關性檔案"
  - "達到最大迭代次數（3）"
```

### 19.4.2 Strategic Compact（策略性壓縮）

```yaml
skill: strategic-compact
purpose: 在邏輯性的任務邊界點建議手動 /compact

trigger:
  initial: "工具呼叫達到 50 次"
  subsequent: "之後每 25 次呼叫提醒"

good_timing:
  - "探索完成後、執行前"
  - "完成一個里程碑後"
  - "重大上下文轉換前"

bad_timing:
  - "實作進行中"
  - "調試過程中"
  - "等待外部結果時"

principle: "Hook 告訴你*何時*，你決定*是否*"
```

### 19.4.3 Verification Loop（驗證迴圈）

```yaml
skill: verification-loop
purpose: 提供 Claude Code 會話的全面驗證系統

trigger: "完成功能或重大程式碼變更後"

six_phases:
  1_build: "npm run build"
  2_types: "npx tsc --noEmit"
  3_lint: "npm run lint"
  4_tests: "npm run test -- --coverage（目標 80%+）"
  5_security: "檢查 secrets、console.log"
  6_diff: "git diff --stat"

output: |
  VERIFICATION REPORT
  ==================
  Build:     [PASS/FAIL]
  Types:     [PASS/FAIL] (X errors)
  Lint:      [PASS/FAIL] (X warnings)
  Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
  Security:  [PASS/FAIL] (X issues)
  Diff:      [X files changed]
  Overall:   [READY/NOT READY] for PR
```

### 19.4.4 TDD Workflow（測試驅動開發）

```yaml
skill: tdd-workflow
purpose: 強制執行測試驅動開發

trigger: ["撰寫新功能", "修復 bug", "重構程式碼"]

seven_steps:
  1: "撰寫 User Journey"
  2: "產生測試案例"
  3: "執行測試（應該失敗）"
  4: "實作程式碼（最小化）"
  5: "再次執行測試（應該通過）"
  6: "重構（保持測試綠燈）"
  7: "驗證覆蓋率（確保 80%+）"

test_types:
  unit: "個別函式、元件邏輯 → Jest/Vitest"
  integration: "API、資料庫、服務互動 → Jest + Mocks"
  e2e: "完整使用者流程 → Playwright"

anti_patterns:
  - "測試實作細節（應測試行為）"
  - "使用脆弱的 CSS 選擇器"
  - "測試間相互依賴"
```

### 19.4.5 Eval Harness（評估框架）

```yaml
skill: eval-harness
purpose: 實作評估驅動開發（EDD）

concept: "evals = AI 開發的單元測試"

workflow:
  1_define: "編碼前定義成功標準"
  2_implement: "撰寫程式碼通過評估"
  3_evaluate: "/eval check feature-name"
  4_report: "產生完整評估報告"

eval_types:
  capability: "測試新能力"
  regression: "確保不破壞現有功能"

graders:
  code_based: "確定性程式碼檢查"
  model_based: "使用 Claude 評估開放式輸出"
  human: "標記需要人工審查"

metrics:
  pass_at_k: "k 次嘗試中至少成功一次"
  pass_caret_k: "k 次連續成功"
```

---

## 19.5 完整 Agents 分析

### Agents 總覽

| Agent | 角色 | 模型 | 工具限制 |
|-------|------|------|----------|
| architect | 軟體架構師 | opus | Read, Grep, Glob (唯讀) |
| code-reviewer | 通用代碼審查 | opus | Read, Grep, Glob, Bash |
| database-reviewer | PostgreSQL 專家 | opus | 完整工具 |
| doc-updater | 文件專家 | opus | 完整工具 |
| e2e-runner | E2E 測試專家 | opus | 完整工具 |
| go-reviewer | Go 代碼審查 | opus | Read, Grep, Glob, Bash |
| python-reviewer | Python 代碼審查 | opus | Read, Grep, Glob, Bash |
| refactor-cleaner | 重構清理專家 | opus | 完整工具 |
| tdd-guide | TDD 指導專家 | opus | Read, Write, Edit, Bash, Grep |
| go-build-resolver | Go 建置解決 | opus | 完整工具 |

### 工具權限分類

```yaml
read_only_reviewers:
  agents: [architect, code-reviewer, go-reviewer, python-reviewer]
  tools: [Read, Grep, Glob, Bash]
  principle: "只審查，不修改"

full_access_implementers:
  agents: [database-reviewer, doc-updater, e2e-runner, refactor-cleaner, go-build-resolver]
  tools: [Read, Write, Edit, Bash, Grep, Glob]
  principle: "需要完整編輯能力"

trigger_types:
  must_use: [code-reviewer, go-reviewer, python-reviewer]
  proactively: [architect, database-reviewer, doc-updater, e2e-runner, refactor-cleaner, tdd-guide]
  when_fails: [go-build-resolver]
```

### 關鍵 Agent 定義

#### architect - 軟體架構師

```yaml
agent: architect
model: opus
tools: [Read, Grep, Glob]  # 唯讀

trigger: "planning new features, refactoring large systems, or making architectural decisions"

responsibilities:
  - "設計新功能的系統架構"
  - "評估技術權衡 (Trade-off Analysis)"
  - "推薦設計模式與最佳實踐"
  - "識別可擴展性瓶頸"
  - "建立架構決策紀錄 (ADR)"

features:
  - "完整的系統設計檢查清單"
  - "前端/後端/資料模式定義"
  - "可擴展性規劃 (10K → 10M 用戶)"
  - "架構反模式警告"
```

#### code-reviewer - 通用代碼審查

```yaml
agent: code-reviewer
model: opus
tools: [Read, Grep, Glob, Bash]

trigger: "immediately after writing or modifying code. MUST BE USED for all code changes"

workflow:
  1: "運行 git diff 查看變更"
  2: "檢查安全漏洞 (CRITICAL)"
  3: "檢查代碼品質 (HIGH)"
  4: "檢查效能問題 (MEDIUM)"
  5: "檢查最佳實踐 (MEDIUM)"

security_checklist:
  - "硬編碼憑證"
  - "SQL 注入風險"
  - "XSS 漏洞"
  - "輸入驗證缺失"
  - "不安全的依賴"

verdicts:
  approve: "無 CRITICAL 或 HIGH 問題"
  warning: "僅有 MEDIUM 問題"
  block: "存在 CRITICAL 或 HIGH 問題"
```

#### tdd-guide - TDD 指導專家

```yaml
agent: tdd-guide
model: opus
tools: [Read, Write, Edit, Bash, Grep]  # 無 Glob

trigger: "PROACTIVELY when writing new features, fixing bugs, or refactoring code"

workflow:
  RED: "先寫失敗測試"
  GREEN: "寫最小實作"
  REFACTOR: "改進代碼"
  VERIFY: "確認覆蓋率 80%+"

edge_cases_must_test:
  - "Null/Undefined"
  - "空值"
  - "無效類型"
  - "邊界值"
  - "錯誤情況"
  - "競態條件"
  - "大數據量"
  - "特殊字符"
```

---

## 19.6 Schemas 系統

### 概覽

```yaml
schemas:
  hooks.schema.json:
    purpose: "Hooks 事件鉤子配置驗證"
    complexity: "高（支援兩種格式）"

  plugin.schema.json:
    purpose: "插件元資料配置驗證"
    required_fields: [name]

  package-manager.schema.json:
    purpose: "套件管理器配置驗證"
    allowed_values: [npm, pnpm, yarn, bun]
```

### hooks.schema.json 結構

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "$schema": { "type": "string" },
        "hooks": {
          "type": "object",
          "additionalProperties": {
            "type": "array",
            "items": { "$ref": "#/$defs/matcherEntry" }
          }
        }
      }
    },
    {
      "type": "array",
      "items": { "$ref": "#/$defs/matcherEntry" }
    }
  ],
  "$defs": {
    "hookItem": {
      "type": "object",
      "required": ["type", "command"],
      "properties": {
        "type": { "type": "string" },
        "command": { "oneOf": [{ "type": "string" }, { "type": "array" }] }
      }
    },
    "matcherEntry": {
      "type": "object",
      "required": ["matcher", "hooks"],
      "properties": {
        "matcher": { "type": "string" },
        "hooks": { "type": "array", "items": { "$ref": "#/$defs/hookItem" } },
        "description": { "type": "string" }
      }
    }
  }
}
```

---

## 19.7 系統整合架構

```
┌─────────────────────────────────────────────────────────────────┐
│                    Commands System Architecture                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   學習系統    │     │   任務編排    │     │   測試驗證    │    │
│  ├──────────────┤     ├──────────────┤     ├──────────────┤    │
│  │ /learn       │     │ /orchestrate │     │ /verify      │    │
│  │ /evolve      │     │ /plan        │     │ /tdd         │    │
│  │ /instinct-   │     │ /checkpoint  │     │ /code-review │    │
│  │  status      │     │              │     │              │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Context Layer                           │  │
│  │     dev.md (開發) | research.md (研究) | review.md (審查) │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Agents Layer (13 個)                    │  │
│  │  planner, architect, tdd-guide, code-reviewer,           │  │
│  │  security-reviewer, build-error-resolver...              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Skills Layer (28 個)                    │  │
│  │  iterative-retrieval, strategic-compact, verification-   │  │
│  │  loop, tdd-workflow, eval-harness, coding-standards...   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 參考資源

- [everything-claude-code](https://github.com/affaan-m/everything-claude-code)
- [the-longform-guide.md](https://github.com/affaan-m/everything-claude-code/blob/main/the-longform-guide.md)
- 本專案研究章節 16-18
