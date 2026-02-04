# 17. 進階模式與工作流程

來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code) 深度分析

---

## 17.1 Iterative Retrieval Pattern

### 核心問題

SubAgents 在啟動時缺乏對所需 context 的了解：
- 發送所有內容 → 超出 token 限制
- 不發送任何內容 → 無法有效工作
- 猜測 → 不可靠

### 解決方案：4 階段循環

```yaml
iterative_retrieval:
  max_iterations: 3

  phases:
    1_dispatch:
      action: "使用初始關鍵字和檔案模式進行廣泛搜索"
      tools: ["Glob", "Grep"]

    2_evaluate:
      action: "評估每個結果的相關性（0-1 分數）"
      scoring:
        high: "0.8-1.0 - 直接實現所需功能"
        medium: "0.5-0.7 - 包含相關模式或類型"
        low: "0.2-0.4 - 間接相關"
        none: "<0.2 - 不相關，排除於未來搜索"

    3_refine:
      action: "根據學習到的內容更新搜索條件"
      strategy:
        - "納入新發現的模式和術語"
        - "明確針對已識別的差距"

    4_loop:
      action: "使用改進的查詢重複直到有足夠高相關性 context"
      termination:
        - "3-4 個高相關性檔案"
        - "達到最大迭代次數"
```

### 實作範例

```typescript
interface RetrievalState {
  iteration: number;
  results: Array<{
    file: string;
    relevance: number;
    keywords: string[];
  }>;
  gaps: string[];
}

async function iterativeRetrieve(
  task: string,
  maxIterations: number = 3
): Promise<RetrievalState> {
  let state: RetrievalState = {
    iteration: 0,
    results: [],
    gaps: extractInitialKeywords(task)
  };

  while (state.iteration < maxIterations) {
    // DISPATCH
    const searchResults = await broadSearch(state.gaps);

    // EVALUATE
    for (const result of searchResults) {
      const relevance = await evaluateRelevance(result, task);
      if (relevance >= 0.5) {
        state.results.push({
          file: result.file,
          relevance,
          keywords: extractKeywords(result.content)
        });
      }
    }

    // REFINE
    state.gaps = identifyGaps(state.results, task);

    // Check termination
    const highRelevanceCount = state.results.filter(r => r.relevance >= 0.8).length;
    if (highRelevanceCount >= 3 || state.gaps.length === 0) {
      break;
    }

    state.iteration++;
  }

  return state;
}
```

### 對 Vibe Engine 的應用

```yaml
# skills/iterative-retrieval/SKILL.md
---
name: iterative-retrieval
description: This skill should be used when SubAgents need to gather context without knowing the codebase. Provides progressive context refinement.
version: 0.1.0
---

# Iterative Retrieval

## 用途

為 SubAgents 提供漸進式 context 收集，避免一次性載入過多或過少資訊。

## 核心流程

1. DISPATCH: 使用任務關鍵字廣泛搜索
2. EVALUATE: 評估結果相關性（0-1）
3. REFINE: 根據發現更新搜索策略
4. LOOP: 重複直到收集 3-4 個高相關性檔案

## 重要規則

- 最多 3 次迭代
- 相關性 < 0.2 的結果排除於未來搜索
- 發現新術語時加入搜索條件
```

---

## 17.2 Strategic Compact

### 核心概念

不讓系統隨機觸發 compaction，而是在邏輯工作流程邊界手動觸發。

### 策略時機

```yaml
strategic_compact:
  # 建議 compact 的時機
  good_moments:
    - "完成計劃後"
    - "調試會話結束後"
    - "主要 context 轉換前"
    - "完成里程碑時"

  # 避免 compact 的時機
  bad_moments:
    - "實作進行中"
    - "調試過程中"
    - "等待外部結果時"

  # 觸發機制
  trigger:
    tool_call_threshold: 50  # 50 次工具呼叫後建議
    reminder_interval: 25    # 之後每 25 次提醒
```

### Hook 實作

```javascript
// hooks/scripts/strategic-compact.js
const fs = require('fs');
const path = require('path');

const COUNTER_FILE = path.join(
  process.env.VIBE_ENGINE_ROOT || '.vibe-engine',
  'tool-call-counter.json'
);

function getCounter() {
  if (!fs.existsSync(COUNTER_FILE)) {
    return { count: 0, lastCompact: Date.now() };
  }
  return JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
}

function incrementAndCheck() {
  const state = getCounter();
  state.count++;

  let suggestion = null;

  if (state.count >= 50 && (state.count - 50) % 25 === 0) {
    suggestion = {
      systemMessage: `💡 Strategic Compact Suggestion: ${state.count} tool calls since last compact. Consider /compact if you're at a natural breakpoint.`,
      toolCallCount: state.count
    };
  }

  fs.writeFileSync(COUNTER_FILE, JSON.stringify(state));

  return suggestion;
}

// Reset on compact
function resetCounter() {
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({
    count: 0,
    lastCompact: Date.now()
  }));
}

module.exports = { incrementAndCheck, resetCounter };
```

---

## 17.3 Verification Loop（6 階段驗證）

### 完整驗證流程

```yaml
verification_loop:
  phases:
    1_build:
      name: "Build Verification"
      command: "npm run build"
      failure_action: "STOP - 修復編譯錯誤"

    2_type_check:
      name: "Type Checking"
      command: "npx tsc --noEmit"
      output: "類型錯誤位置和詳情"

    3_lint:
      name: "Linting"
      command: "npm run lint"
      output: "樣式違規和潛在問題"

    4_test:
      name: "Testing"
      command: "npm test -- --coverage"
      threshold: "80% 最低覆蓋率"
      output: "通過率和覆蓋率指標"

    5_security:
      name: "Security Scanning"
      checks:
        - "搜索硬編碼憑證"
        - "檢測 console.log 語句"
        - "npm audit"

    6_diff_review:
      name: "Diff Review"
      checks:
        - "檢查變更檔案的意外修改"
        - "確認錯誤處理完整"

  output_format: |
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Verification Report
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ✅ Build:     PASS
    ✅ Types:     PASS (0 errors)
    ⚠️  Lint:     WARN (3 warnings)
    ✅ Tests:     PASS (42/42, 85% coverage)
    ✅ Security:  PASS
    ✅ Diff:      PASS
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Status: READY FOR PR ✅

  continuous_mode:
    checkpoint_interval: "15 分鐘"
    purpose: "增量捕獲問題，而非最後發現"
```

### /verify 命令實作

```yaml
# commands/vibe-verify.md
---
name: vibe-verify
description: Run 6-phase verification loop
arguments:
  - name: mode
    description: "quick|full|pre-commit|pre-pr"
    required: false
    default: "full"
---

# /vibe-verify 命令

## 執行驗證

根據 $ARGUMENTS 執行不同級別的驗證：

| Mode | Phases |
|------|--------|
| quick | Build + Types |
| full | 全部 6 階段 |
| pre-commit | Build + Types + Lint + Security |
| pre-pr | 全部 6 階段 + 額外安全掃描 |

## 執行步驟

1. 執行 `npm run build`，失敗則停止
2. 執行 `npx tsc --noEmit`，記錄錯誤
3. 執行 `npm run lint`，記錄警告
4. 執行 `npm test -- --coverage`，檢查 80% 閾值
5. 執行安全掃描（grep secrets, npm audit）
6. 執行 diff review

## 輸出報告

生成結構化報告，指示 READY/NOT READY for PR。

如果有關鍵問題，列出修復建議。
```

---

## 17.4 Eval-Driven Development (EDD)

### 核心概念

將 evaluations 視為「AI 開發的單元測試」—在實作前定義預期行為。

```yaml
eval_driven_development:
  philosophy: "Define expected behavior BEFORE implementation"

  eval_types:
    capability:
      purpose: "驗證新功能按預期工作"
      example: "Login endpoint returns JWT for valid credentials"

    regression:
      purpose: "確保現有功能不受影響"
      example: "Existing user lookup still works after refactor"

  grading_methods:
    code_based:
      description: "確定性檢查（grep, tests, builds）"
      reliability: "100%"
      examples:
        - "Build passes"
        - "Test suite passes"
        - "No console.log in production"

    model_based:
      description: "Claude 評估開放式輸出"
      reliability: "~85-95%"
      examples:
        - "Error message is user-friendly"
        - "Code follows project patterns"

    human_based:
      description: "需要人工審核"
      use_cases:
        - "安全敏感變更"
        - "UX 決策"

  success_metrics:
    "pass@k":
      description: "在 k 次嘗試內成功"
      example: "pass@3 - 3 次內成功即可"

    "pass^k":
      description: "連續 k 次都成功"
      example: "pass^3 - 連續 3 次成功"
```

### EDD 工作流程

```yaml
edd_workflow:
  phases:
    1_define:
      action: "在編碼前建立成功標準"
      output: ".vibe-engine/evals/{feature}.md"
      template: |
        # {Feature} Eval

        ## Success Criteria
        - [ ] Build passes
        - [ ] All tests pass
        - [ ] Coverage >= 80%
        - [ ] No security vulnerabilities
        - [ ] {Feature-specific criterion}

        ## Grading
        - Code-based: Build, tests, coverage
        - Model-based: Code quality assessment

    2_implement:
      action: "編寫針對 evals 的代碼"
      focus: "滿足定義的標準"

    3_evaluate:
      action: "運行測試並記錄結果"
      output: ".vibe-engine/evals/{feature}.log"

    4_report:
      action: "文檔通過率和整體狀態"
      format: |
        ## Eval Results
        - pass@1: 75%
        - pass@3: 95%
        - Status: READY
```

### Eval 存儲結構

```
.vibe-engine/evals/
├── auth-login.md          # Eval 定義
├── auth-login.log         # 運行歷史
├── user-registration.md
├── user-registration.log
└── baseline.json          # 回歸基線
```

---

## 17.5 Rules 最佳實踐

### Security Rules

```yaml
security_rules:
  mandatory_checks:
    1: "禁止硬編碼 secrets"
    2: "驗證所有輸入"
    3: "防禦 SQL injection"
    4: "清理 HTML 輸出（防 XSS）"
    5: "啟用 CSRF 保護"
    6: "驗證認證控制"
    7: "實施速率限制"
    8: "錯誤訊息不洩露敏感資訊"

  incident_response:
    steps:
      1: "立即停止工作"
      2: "啟動 security-reviewer agent"
      3: "解決關鍵漏洞後才繼續"
      4: "使已曝露的憑證失效"
      5: "審計代碼庫中的類似弱點"

  secret_handling:
    wrong: |
      const apiKey = "sk-proj-xxxxx";
    correct: |
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API_KEY required");
```

### Testing Rules

```yaml
testing_rules:
  coverage:
    minimum: "80%"
    critical_paths: "100%"
    critical_includes:
      - "財務計算"
      - "認證邏輯"
      - "安全關鍵部分"
      - "核心業務邏輯"

  test_types:
    required:
      - unit: "獨立函數和組件測試"
      - integration: "API 和資料庫操作驗證"
      - e2e: "關鍵用戶流程（Playwright）"

  tdd_cycle:
    1: "Write test first (RED)"
    2: "Run test - it should FAIL"
    3: "Write minimal implementation (GREEN)"
    4: "Run test - it should PASS"
    5: "Refactor (IMPROVE)"

  failure_resolution:
    priority:
      1: "檢查測試隔離和 mock 準確性"
      2: "修復實作，而非測試（除非測試有誤）"
      3: "使用 tdd-guide agent 獲得支援"
```

### Agents Rules

```yaml
agents_rules:
  auto_activation_scenarios:
    - "複雜功能實作"
    - "最近修改的代碼"
    - "bug 修復或新功能"
    - "架構決策"

  efficiency_principles:
    parallel_launch:
      description: "同時啟動獨立 agents"
      wrong: "順序啟動等待完成"
      correct: "並行啟動無依賴的 agents"

    multi_perspective:
      description: "對挑戰性問題使用多專家視角"
      example: "安全專家 + 資深工程師一起審查"

  available_agents:
    planner: "實作規劃"
    architect: "系統設計"
    tdd_guide: "測試驅動開發"
    code_reviewer: "代碼質量評估"
    security_reviewer: "安全評估"
    build_error_resolver: "編譯失敗修復"
    e2e_runner: "端到端測試"
    refactor_cleaner: "移除未使用代碼"
    doc_updater: "維護文檔"
```

### Performance Rules

```yaml
performance_rules:
  model_selection:
    haiku:
      capability: "90% of Sonnet capability"
      cost_saving: "3x"
      use_for: "輕量級、頻繁調用的任務"

    sonnet:
      role: "主要開發模型"
      use_for: "複雜編碼工作"

    opus:
      capability: "最深度推理"
      use_for: "架構和研究挑戰"

  context_window:
    best_practices:
      - "保留最後 1/5 用於需要深度推理的任務"
      - "單檔案修改對 context 限制較不敏感"
      - "文檔工作可以容忍較小 context"

  advanced_reasoning:
    techniques:
      - "結合增強思考模式與結構化規劃"
      - "通過多輪審查進行迭代精煉"
      - "使用專門的 sub-agents"
```

---

## 17.6 進階 Hooks 配置

### 完整 Hooks 範例

```json
{
  "description": "Vibe Engine comprehensive hooks",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/check-tmux.js\"",
            "timeout": 5
          }
        ],
        "description": "強制長時間命令在 tmux 中運行"
      },
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "檢查是否創建不必要的 markdown 檔案。如果是文檔且用戶未明確要求，回覆 {\"decision\": \"deny\", \"reason\": \"Unnecessary documentation\"}",
            "timeout": 10
          }
        ],
        "description": "阻止創建非必要的 markdown"
      }
    ],

    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/auto-format.js\"",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/type-check.js\"",
            "timeout": 30
          }
        ],
        "description": "自動格式化和類型檢查"
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "檢查修改的檔案是否包含 console.log。如果在 src/ 目錄下發現，回覆警告。",
            "timeout": 5
          }
        ],
        "description": "警告 console.log 語句"
      }
    ],

    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "檢查已修改檔案中是否有遺留的 console.log 或 TODO 註釋。列出發現的問題。",
            "timeout": 15
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
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/load-previous-context.js\"",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/detect-package-manager.js\"",
            "timeout": 5
          }
        ]
      }
    ],

    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/save-session-state.js\"",
            "timeout": 10
          },
          {
            "type": "prompt",
            "prompt": "評估本次會話是否有可提取的模式或學習。如果有，回覆 JSON 格式的 instincts。",
            "timeout": 20
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
        ]
      }
    ]
  }
}
```

---

## 17.7 Checkpoint 與狀態管理

### /checkpoint 命令設計

```yaml
checkpoint_command:
  operations:
    create:
      steps:
        1: "驗證 clean state（無未提交變更）"
        2: "創建 Git stash/commit"
        3: "記錄到 .vibe-engine/checkpoints.log"
        4: "保存 timestamp 和 SHA"

    verify:
      comparison:
        - "檔案變更數量"
        - "測試結果變化"
        - "代碼覆蓋率差異"
        - "構建狀態"

    list:
      output: "Name, Timestamp, Git SHA, Status (current/behind/ahead)"

    clear:
      behavior: "移除舊 checkpoints，保留最近 5 個"

  typical_workflow:
    1: "create checkpoint-feature-start"
    2: "... 開發 ..."
    3: "create checkpoint-core-complete"
    4: "verify checkpoint-feature-start"
    5: "... 繼續開發 ..."
    6: "create checkpoint-ready-for-test"
    7: "verify checkpoint-core-complete"
```

### Checkpoint 存儲格式

```json
// .vibe-engine/checkpoints.log (JSONL)
{"name": "feature-start", "timestamp": "2024-01-15T10:00:00Z", "sha": "abc123", "files": 42, "coverage": 78}
{"name": "core-complete", "timestamp": "2024-01-15T12:30:00Z", "sha": "def456", "files": 45, "coverage": 82}
{"name": "ready-for-test", "timestamp": "2024-01-15T15:00:00Z", "sha": "ghi789", "files": 48, "coverage": 85}
```

---

## 17.8 Build Error Resolver Agent

### 核心原則

```yaml
build_error_resolver:
  mission: "快速修復構建錯誤，最小化代碼變更"

  responsibilities:
    - "TypeScript 錯誤解決和類型推斷修復"
    - "構建編譯失敗解決"
    - "Import/module 和依賴問題排除"
    - "配置錯誤修復"
    - "保持最小 diff"

  when_to_use:
    activate:
      - "構建失敗"
      - "類型錯誤"
      - "Import 問題"
      - "配置問題"
      - "依賴衝突"
    avoid:
      - "重構"
      - "架構變更"
      - "功能開發"
      - "測試修復"

  workflow:
    1: "收集所有錯誤：npx tsc --noEmit --pretty"
    2: "按類型分類（推斷、imports、null checks 等）"
    3: "應用最小修復（一次一個錯誤）"
    4: "驗證每個修復不產生新錯誤"

  guiding_principle: |
    "修復錯誤，驗證構建通過，繼續前進。
    速度和精確優先於完美。"

  success_criteria: "構建通過，受影響檔案修改 < 5%"

  constraints:
    - "不重構不相關代碼"
    - "不進行不必要的變數重命名"
    - "只需要錯誤解決時不優化"
```

---

## 17.9 Security Reviewer Agent

### OWASP Top 10 檢查清單

```yaml
security_reviewer:
  focus_areas:
    owasp_top_10:
      - "Injection attacks"
      - "Broken authentication"
      - "Sensitive data exposure"
      - "XSS (Cross-site scripting)"
      - "Broken access control"
      - "Security misconfiguration"
      - "Insecure deserialization"
      - "Using components with known vulnerabilities"
      - "Insufficient logging & monitoring"

  primary_tools:
    - "npm audit"
    - "eslint-plugin-security"
    - "grep-based pattern matching"

  financial_security:
    reason: "處理真實金錢時的額外檢查"
    checks:
      - "原子交易處理"
      - "提款前餘額驗證"
      - "金融端點速率限制"
      - "錢包簽名驗證"
      - "MEV 保護（區塊鏈特定）"

  review_methodology:
    phases:
      1: "自動掃描"
      2: "OWASP Top 10 類別評估"
      3: "專案特定檢查"
    output:
      format: "按嚴重性分類（Critical/High/Medium/Low）"
      includes: "修復範例"

  activation: "PROACTIVELY when code handles user input, authentication, API endpoints, or sensitive data"
```

---

## 17.10 Planner Agent

### 4 階段規劃流程

```yaml
planner_agent:
  purpose: "為複雜功能實作和重構任務創建詳細、可操作的計劃"

  methodology:
    1_requirements_analysis:
      actions:
        - "理解範圍和成功標準"
        - "識別利益相關者需求"
        - "澄清模糊需求"

    2_architecture_review:
      actions:
        - "檢查代碼庫結構"
        - "識別受影響的組件"
        - "評估現有模式"

    3_step_breakdown:
      actions:
        - "詳細說明具體行動"
        - "包含檔案路徑和函數名"
        - "估算複雜度"

    4_implementation_order:
      actions:
        - "按依賴關係組織工作"
        - "識別可並行的任務"
        - "標記關鍵路徑"

  deliverable_format:
    sections:
      - "Overview"
      - "Requirements"
      - "Architectural Changes"
      - "Phased Implementation Steps"
      - "Testing Strategy"
      - "Risk Assessment"
      - "Success Criteria"

  guiding_principles:
    - "具體性（確切的檔案路徑和函數名）"
    - "考慮邊緣情況"
    - "增量測試"
    - "遵循現有專案模式"
```

---

## 參考資源

- [everything-claude-code](https://github.com/affaan-m/everything-claude-code)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
