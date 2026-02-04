# 10. 開發方法論

## 問題定義

AI 參與的開發流程應該用什麼方法論？如何防止代碼品質下降？

---

## 子問題拆解

### 10.1 代碼熵增問題

**問題**：AI 生成的代碼為什麼會導致系統複雜度上升？

**現有認知**：
```
AI 生成代碼
    ↓
通過基本測試 ✓
    ↓
隱藏問題累積：
├── 重複代碼
├── 過度工程
├── 不一致風格
├── 死代碼
└── 文檔腐爛
    ↓
系統複雜度上升
    ↓
維護成本 > 開發成本
```

**關鍵數據**：
- Google 約 30% 代碼由 AI 生成
- 企業平均花 60-80% IT 預算維護現有系統

**待解決**：
- [ ] 如何量化「代碼熵」？
- [ ] 熵增的早期預警指標？
- [ ] 如何建立「代碼健康度」指標？

---

### 10.2 持續代謝機制

**問題**：如何主動檢測和清理代碼問題？

**現有認知**：
```yaml
metabolism:
  detection:
    - static_analysis
    - code_smell_detection
    - dead_code_finder
    - duplication_checker

  triggers:
    - complexity_threshold: 15
    - duplication_ratio: 0.1
    - file_size: 500 lines

  actions:
    - extract_function
    - remove_dead_code
    - consolidate_duplicates
```

**待解決**：
- [ ] 檢測工具的選擇和整合？
- [ ] 閾值如何設定才合理？
- [ ] 自動重構的安全邊界？

---

### 10.3 TDD vs SDD

**問題**：傳統 TDD 對 AI 開發有什麼侷限？

**現有認知**：
| 面向 | TDD | SDD |
|------|-----|-----|
| 焦點 | 測試驅動代碼 | 規格驅動測試和代碼 |
| 主要產物 | 測試 → 代碼 | 規格 → 測試 → 代碼 |
| 驗證 | 代碼是否正確 | 意圖是否被正確理解 |
| 適用 | 人類編寫代碼 | **AI 編寫代碼** |

**待解決**：
- [ ] 「規格」的具體格式？
- [ ] 如何從用戶需求自動生成規格？
- [ ] 規格的粒度如何控制？

---

### 10.4 SDD + TDD + BDD 融合

**問題**：如何結合三種方法論的優點？

**現有認知**：
```
Phase 1: Specification (SDD)
├── 定義功能規格 (WHAT)
├── 定義成功標準 (DONE CRITERIA)
└── 定義驗收場景 (ACCEPTANCE SCENARIOS)

Phase 2: Test Design (TDD/BDD)
├── 從規格生成測試案例
├── 單元測試 + 整合測試
└── 行為測試 (Given-When-Then)

Phase 3: Implementation (AI Agent)
├── AI 根據規格和測試實現代碼
└── 迭代直到測試通過

Phase 4: Verification (超越測試)
├── 實際操作驗證
├── 邊界情況測試
└── 非功能性驗證
```

**待解決**：
- [ ] 每個 Phase 的具體實作？
- [ ] Phase 之間如何銜接？
- [ ] AI 在每個 Phase 的角色？

---

### 10.5 規格模板

**問題**：標準化的規格應該包含什麼？

**現有認知**：
```yaml
spec:
  name: user-authentication
  description: 用戶登入功能

  done_criteria:
    - 用戶可以使用 email/password 登入
    - 錯誤的密碼顯示適當錯誤訊息
    - 登入成功後重定向到 dashboard

  scenarios:
    - name: 正常登入
      given: 用戶已註冊
      when: 輸入正確的 email 和 password
      then: 登入成功並重定向

  edge_cases:
    - 空的 email
    - SQL injection 嘗試

  non_functional:
    - 響應時間 < 500ms
```

**待解決**：
- [ ] 模板欄位是否完整？
- [ ] 如何驗證規格的完整性？
- [ ] 規格如何版本控制？

---

### 10.6 重構時機

**問題**：什麼時候應該觸發重構？

**現有認知**：
| 指標 | 閾值 | 行動 |
|------|------|------|
| 圈複雜度 | > 15 | 拆分函數 |
| 重複率 | > 10% | 抽取共用 |
| 文件行數 | > 500 | 模組化 |
| 測試覆蓋率 | < 70% | 補充測試 |
| 文檔過期 | > 7 天 | 更新文檔 |

**待解決**：
- [ ] 閾值是否需要根據專案調整？
- [ ] 如何排程重構任務？
- [ ] 重構和新功能開發如何平衡？

---

## 現有方案

### SDD (Specification-Driven Development)
- 前置清晰度減少返工
- AI 第一次就接近目標

### Domain-Driven TDD
- 場景化測試
- 貼近業務邏輯

### AI Code Refactoring (IBM)
- 持續重構
- AI 輔助識別問題

---

## 我們的解法

### 10.1 解法：代碼熵增問題

**代碼熵量化指標**：
```yaml
entropy_metrics:
  complexity:
    cyclomatic_complexity:
      measure: number of independent paths
      tool: eslint-plugin-complexity
      healthy: < 10
      warning: 10-15
      critical: > 15

    cognitive_complexity:
      measure: mental effort to understand
      tool: sonarqube
      healthy: < 15
      warning: 15-25
      critical: > 25

  duplication:
    metric: percentage of duplicated lines
    tool: jscpd
    healthy: < 5%
    warning: 5-10%
    critical: > 10%

  coupling:
    metric: dependencies between modules
    tool: dependency-cruiser
    healthy: low coupling, high cohesion

  file_metrics:
    lines_per_file:
      healthy: < 300
      warning: 300-500
      critical: > 500
    functions_per_file:
      healthy: < 15
      warning: 15-25
      critical: > 25
```

**早期預警指標**：
```yaml
early_warning:
  delta_tracking:
    description: 追蹤每次變更的熵變化
    implementation:
      before_commit:
        1. 計算變更前的熵指標
        2. 計算變更後的熵指標
        3. 如果 delta > threshold → 警告

  trend_analysis:
    window: last 10 commits
    alerts:
      - entropy_increasing: 連續 3 次 commit 熵增加
      - complexity_spike: 單次 commit 複雜度增加 > 20%
      - duplication_creep: 重複率持續上升

  automated_reporting:
    frequency: weekly
    content:
      - entropy_trend_chart
      - worst_offending_files
      - improvement_suggestions
```

**代碼健康度指標**：
```yaml
code_health_score:
  calculation:
    formula: |
      health = 100 - (
        complexity_penalty +
        duplication_penalty +
        coupling_penalty +
        staleness_penalty
      )

    weights:
      complexity: 30%
      duplication: 25%
      coupling: 25%
      staleness: 20%

  interpretation:
    90-100: 優秀
    70-89: 良好
    50-69: 需要關注
    0-49: 需要立即處理

  dashboard:
    show:
      - overall_health_score
      - breakdown_by_module
      - trend_over_time
      - actionable_recommendations
```

---

### 10.2 解法：持續代謝機制

**檢測工具選擇與整合**：
```yaml
detection_tools:
  static_analysis:
    primary: eslint
    config_extends:
      - eslint:recommended
      - plugin:@typescript-eslint/recommended
    custom_rules:
      - complexity
      - max-lines
      - no-unused-vars

  code_smell:
    tool: sonarqube (or sonar-scanner)
    checks:
      - code_smells
      - bugs
      - vulnerabilities
      - security_hotspots

  dead_code:
    tools:
      - ts-prune: unused exports
      - knip: unused files, dependencies
    schedule: weekly

  duplication:
    tool: jscpd
    config:
      min_lines: 5
      min_tokens: 50

  integration:
    unified_runner:
      command: vibe health-check
      output: structured JSON report
      aggregation: combine all tool outputs
```

**閾值設定方法**：
```yaml
threshold_tuning:
  baseline_approach:
    1. 分析現有代碼庫
    2. 計算當前指標
    3. 設定閾值 = 當前值 * 1.1 (允許 10% 波動)
    4. 逐步收緊

  project_specific:
    new_project:
      complexity: strict (< 10)
      duplication: strict (< 3%)

    legacy_project:
      complexity: relaxed (< 20)
      duplication: relaxed (< 15%)
      strategy: gradual improvement

  adaptive:
    track: historical_data
    adjust:
      if average_improving: tighten thresholds
      if consistently_violated: review if too strict
```

**自動重構安全邊界**：
```yaml
auto_refactor_boundaries:
  safe_operations:
    - rename_variable: isolated scope
    - extract_constant: simple string/number
    - remove_unused_import: no side effects
    - format_code: purely cosmetic

  requires_review:
    - extract_function: changes control flow
    - inline_function: may affect callers
    - change_signature: affects all call sites
    - move_to_file: changes imports

  never_auto:
    - delete_function: may break external
    - change_public_api: breaking change
    - refactor_shared_code: affects multiple consumers

  verification:
    after_any_refactor:
      - run_tests
      - verify_type_check
      - compare_behavior (if possible)
```

---

### 10.3 解法：TDD vs SDD

**規格的具體格式**：
```yaml
spec_format:
  yaml_schema:
    spec:
      name: kebab-case identifier
      description: 1-2 句描述

      inputs:
        - name: param_name
          type: typescript_type
          description: string
          constraints: validation rules

      outputs:
        - name: result_name
          type: typescript_type
          description: string

      done_criteria:
        - criterion 1
        - criterion 2

      scenarios:
        - name: scenario_name
          given: precondition
          when: action
          then: expected outcome

      edge_cases:
        - description
        - description

      non_functional:
        - performance: response_time < 500ms
        - security: no_sql_injection

  example:
    spec:
      name: user-login
      description: 驗證用戶憑證並返回 session token

      inputs:
        - name: email
          type: string
          constraints: valid email format
        - name: password
          type: string
          constraints: min 8 chars

      outputs:
        - name: token
          type: string
          description: JWT token
        - name: user
          type: User
          description: 用戶基本資訊

      done_criteria:
        - 正確憑證返回 token
        - 錯誤憑證返回適當錯誤
        - 記錄登入嘗試

      scenarios:
        - name: successful_login
          given: 用戶已註冊
          when: 輸入正確的 email/password
          then: 返回有效的 JWT token

        - name: wrong_password
          given: 用戶已註冊
          when: 輸入錯誤的 password
          then: 返回 401 錯誤

      edge_cases:
        - 空的 email
        - 空的 password
        - SQL injection 嘗試
        - 不存在的用戶

      non_functional:
        - response_time: < 500ms
        - rate_limit: 5 attempts per minute
```

**從需求自動生成規格**：
```yaml
spec_generation:
  process:
    1. 用戶描述需求（自然語言）
    2. AI 解析並結構化
    3. 生成初步規格
    4. 用戶審查和修改
    5. 確認後進入開發

  ai_prompt:
    system: |
      你是一個軟體需求分析師。
      將用戶的需求轉換為結構化的規格文件。
      使用以下 YAML 格式...

    user: |
      用戶需求：{user_description}
      專案上下文：{project_context}

      請生成規格文件。

  validation:
    check:
      - 所有必要欄位都填充
      - scenarios 覆蓋主要路徑
      - edge_cases 合理
      - done_criteria 可驗證
```

**規格粒度控制**：
```yaml
spec_granularity:
  too_coarse:
    example: "實作用戶管理系統"
    problem: 太大，難以驗證，難以估計

  too_fine:
    example: "在 line 42 加入 null check"
    problem: 過於瑣碎，不需要規格

  right_size:
    characteristics:
      - 1-3 小時可完成
      - 有明確的輸入/輸出
      - 可獨立測試
      - 3-5 個 scenarios

  decomposition:
    if_too_large:
      - 按功能拆分
      - 按用戶角色拆分
      - 按技術層拆分

    example:
      original: "實作用戶管理系統"
      split:
        - "實作用戶註冊"
        - "實作用戶登入"
        - "實作密碼重設"
        - "實作用戶資料更新"
```

---

### 10.4 解法：SDD + TDD + BDD 融合

**各 Phase 的具體實作**：
```yaml
phase_implementation:
  phase_1_specification:
    owner: user + AI (協作)
    deliverable: spec.yaml
    activities:
      - 需求討論
      - 規格起草
      - 審查確認
    tools:
      - natural language to spec converter
      - spec validator
    duration: 10-20% of total time

  phase_2_test_design:
    owner: AI (主導) + user (審查)
    deliverable: test files
    activities:
      - 從 spec 生成 unit tests
      - 從 scenarios 生成 BDD tests
      - 識別需要 mock 的依賴
    output:
      - *.test.ts (unit tests)
      - *.spec.ts (integration tests)
      - *.feature (Gherkin, optional)
    duration: 20-30% of total time

  phase_3_implementation:
    owner: AI Agent
    deliverable: source code
    activities:
      - 實作以通過測試
      - 迭代直到測試通過
      - 代碼品質檢查
    constraints:
      - 不修改測試 (除非有 bug)
      - 遵循規格中的約束
    duration: 30-40% of total time

  phase_4_verification:
    owner: AI + user
    deliverable: verification report
    activities:
      - 執行所有測試
      - 手動驗證關鍵功能
      - 邊界情況測試
      - 效能測試 (if applicable)
    duration: 10-20% of total time
```

**Phase 銜接機制**：
```yaml
phase_transitions:
  spec_to_test:
    trigger: spec approved by user
    automation:
      - parse spec.yaml
      - generate test stubs
      - create test data fixtures
    validation:
      - generated tests compile
      - tests match spec scenarios

  test_to_implementation:
    trigger: tests reviewed and finalized
    handoff:
      - test files
      - spec (for reference)
      - project context
    validation:
      - all tests fail initially (red phase)

  implementation_to_verification:
    trigger: all tests pass
    handoff:
      - implementation code
      - test results
      - coverage report
    validation:
      - coverage > threshold
      - no lint errors
      - no security issues
```

**AI 在各 Phase 的角色**：
```yaml
ai_roles:
  phase_1_specification:
    role: 助手
    activities:
      - 幫助結構化需求
      - 建議 edge cases
      - 提問澄清模糊點
    autonomy: L1 (輔助)

  phase_2_test_design:
    role: 主導
    activities:
      - 生成測試代碼
      - 設計測試數據
      - 建議測試策略
    autonomy: L2 (部分自主)
    human_review: required

  phase_3_implementation:
    role: 執行者
    activities:
      - 編寫實現代碼
      - 修復失敗的測試
      - 重構以提高品質
    autonomy: L3 (條件自主)
    human_review: on completion

  phase_4_verification:
    role: 助手
    activities:
      - 執行自動化測試
      - 報告結果
      - 建議改進
    autonomy: L2 (部分自主)
    human_action: final approval
```

---

### 10.5 解法：規格模板

**模板欄位完整性**：
```yaml
spec_template_v1:
  required_fields:
    - name: string
    - description: string
    - done_criteria: string[]
    - scenarios: Scenario[]

  optional_fields:
    - inputs: Input[]
    - outputs: Output[]
    - edge_cases: string[]
    - non_functional: NonFunctional
    - dependencies: string[]
    - assumptions: string[]
    - out_of_scope: string[]

  validation_rules:
    name:
      - kebab-case
      - unique within project
    done_criteria:
      - at least 1
      - each must be verifiable
    scenarios:
      - at least 1 happy path
      - at least 1 error path
```

**規格完整性驗證**：
```yaml
spec_validation:
  automated_checks:
    structural:
      - all required fields present
      - field types correct
      - no empty required values

    semantic:
      - done_criteria are measurable
      - scenarios cover happy/error paths
      - inputs have constraints defined

    coverage:
      - all inputs used in scenarios
      - all outputs verified in then clauses

  quality_score:
    calculate:
      - completeness: required fields (40%)
      - coverage: scenario coverage (30%)
      - clarity: measurable criteria (30%)

    thresholds:
      ready_for_dev: > 80%
      needs_improvement: 60-80%
      incomplete: < 60%
```

**規格版本控制**：
```yaml
spec_versioning:
  storage:
    location: specs/{spec-name}/
    files:
      - spec.yaml (current)
      - history/
        - v1.yaml
        - v2.yaml

  version_tracking:
    format: semver (major.minor.patch)
    increment:
      major: breaking changes to interface
      minor: new features/scenarios
      patch: clarifications, typos

  change_management:
    on_spec_change:
      1. 創建新版本
      2. 更新受影響的測試
      3. 標記需要重新實作的部分
      4. 通知相關人員

  traceability:
    link:
      - spec version → test commit
      - spec version → implementation commit
```

---

### 10.6 解法：重構時機

**閾值調整依據**：
```yaml
threshold_adjustment:
  project_factors:
    age:
      new (< 6 months): stricter thresholds
      mature (6m - 2y): standard thresholds
      legacy (> 2y): relaxed thresholds

    team_size:
      solo: can be flexible
      small (2-5): standard
      large (> 5): stricter for consistency

    domain:
      critical (finance, health): stricter
      internal_tools: can be relaxed

  dynamic_adjustment:
    based_on:
      - team_velocity: if slowing, check if tech debt
      - bug_rate: high bugs → tighten thresholds
      - onboarding_time: slow onboarding → improve code clarity
```

**重構任務排程**：
```yaml
refactoring_schedule:
  integration:
    boy_scout_rule:
      description: 每次修改時順手改善
      scope: 只改動觸及的代碼
      budget: 10-15% of feature time

    dedicated_sprints:
      frequency: every 3-4 sprints
      duration: 1 sprint
      focus: accumulated tech debt

    continuous:
      automated: dead code removal, formatting
      manual: architecture improvements

  prioritization:
    urgency_matrix:
      high_impact_easy_fix: do first
      high_impact_hard_fix: plan and schedule
      low_impact_easy_fix: boy scout rule
      low_impact_hard_fix: defer or skip

  tracking:
    tech_debt_backlog:
      - item description
      - estimated effort
      - impact if not fixed
      - deadline (if any)
```

**重構與新功能平衡**：
```yaml
balance_strategy:
  ratio_guideline:
    healthy: 80% features / 20% maintenance
    debt_accumulating: 70/30
    debt_critical: 50/50 until improved

  negotiation:
    with_stakeholders:
      - visualize tech debt impact
      - show bug correlation
      - present velocity trends
      - propose trade-offs

  enforcement:
    definition_of_done:
      - include: no new tech debt introduced
      - include: affected code improved
      - metric: health score not decreased

  escape_valve:
    deadline_pressure:
      allow: temporary tech debt
      require: tech debt ticket created
      enforce: must address within 2 sprints
```

---

## 10.7 ADR 自動生成

來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code) 的 ADR 模式

### 什麼是 ADR？

**Architecture Decision Records (ADR)** 是記錄架構決策的輕量文檔，幫助團隊了解「為什麼」做出某個決定。

### ADR 格式

```markdown
# ADR-{number}: {Title}

## Context
{描述問題背景和約束}

## Decision
{決定採用什麼方案}

## Consequences

### Positive
- {好處 1}
- {好處 2}

### Negative
- {缺點 1}
- {缺點 2}

### Alternatives Considered
- {替代方案 1}
- {替代方案 2}

## Status
{Proposed | Accepted | Deprecated | Superseded}

## Date
{YYYY-MM-DD}
```

### 自動生成觸發條件

```yaml
adr_triggers:
  # 架構決策發生時
  on_architect_decision:
    when: "Architect Agent 完成設計且包含多個方案選擇"
    action: "生成 ADR 記錄選擇理由"

  # 技術選型時
  on_tech_choice:
    patterns:
      - "Should we use X or Y?"
      - "Which library for..."
      - "REST vs GraphQL"
      - "SQL vs NoSQL"
    action: "生成 ADR 記錄技術選型"

  # 重大重構時
  on_major_refactor:
    when: "修改超過 10 個檔案 OR 變更核心模組"
    action: "生成 ADR 記錄重構原因"

  # 用戶明確要求
  on_user_request:
    command: "/adr [topic]"
    action: "互動式 ADR 生成"
```

### 自動生成流程

```yaml
adr_generation:
  # 從對話中提取決策
  extraction_prompt: |
    分析以下對話，提取架構決策：

    {conversation}

    識別：
    1. 問題背景（Context）
    2. 做出的決定（Decision）
    3. 考慮過的替代方案（Alternatives）
    4. 選擇理由（Why this decision?）

    回傳 JSON:
    {
      "title": "...",
      "context": "...",
      "decision": "...",
      "alternatives": [...],
      "rationale": "...",
      "consequences": {"positive": [...], "negative": [...]}
    }

  # 生成 ADR 文件
  output:
    location: "docs/adr/ADR-{number}-{slug}.md"
    numbering: "auto-increment"
    index: "docs/adr/index.md"

  # 連結到相關檔案
  linking:
    add_comment_to_code: |
      // ADR-{number}: {title}
      // See docs/adr/ADR-{number}-{slug}.md
```

### /adr 命令

```yaml
command_adr:
  usage:
    - "/adr" - 列出所有 ADR
    - "/adr create [topic]" - 互動式創建 ADR
    - "/adr search [keyword]" - 搜尋相關 ADR

  create_flow:
    1_gather:
      questions:
        - "What decision are you documenting?"
        - "What problem does it solve?"
        - "What alternatives were considered?"
        - "Why was this option chosen?"

    2_generate:
      action: "生成 ADR markdown"

    3_review:
      action: "讓用戶確認內容"

    4_save:
      action: "保存到 docs/adr/"

  output_example: |
    📄 ADR Created

    # ADR-007: Use Redis for Vector Storage

    **Status**: Accepted
    **Date**: 2024-01-15

    ## Decision
    Use Redis Stack with vector search for embedding storage.

    ## Rationale
    - Fast similarity search (<10ms)
    - Simple deployment
    - Already using Redis for caching

    Saved to: docs/adr/ADR-007-redis-vector-storage.md
```

### ADR 索引維護

```yaml
adr_index:
  location: "docs/adr/index.md"

  format: |
    # Architecture Decision Records

    | # | Decision | Status | Date |
    |---|----------|--------|------|
    | 007 | Use Redis for Vector Storage | Accepted | 2024-01-15 |
    | 006 | Adopt TypeScript Strict Mode | Accepted | 2024-01-10 |
    | 005 | REST over GraphQL for MVP | Accepted | 2024-01-08 |

  auto_update:
    trigger: "ADR 創建或更新時"
    action: "重新生成索引"
```

---

## 10.8 Eval-Driven Development (EDD)

來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code) 的 Eval Harness

### 什麼是 EDD？

**Eval-Driven Development** 將 evaluations 視為「AI 開發的單元測試」—在實作前定義預期行為，就像 TDD 在寫代碼前先寫測試。

### EDD vs TDD

| 面向 | TDD | EDD |
|------|-----|-----|
| 對象 | 傳統代碼 | AI 輔助開發 |
| 定義 | 測試案例 | 成功標準 |
| 評估者 | 測試框架 | Code + Model + Human |
| 確定性 | 100% | 視評估方法 |

### Eval 類型

```yaml
eval_types:
  capability_eval:
    purpose: "驗證新功能按預期工作"
    examples:
      - "Login endpoint returns JWT for valid credentials"
      - "Search returns relevant results within 200ms"
      - "Export generates valid CSV format"

  regression_eval:
    purpose: "確保現有功能不受影響"
    examples:
      - "Existing user lookup still works after refactor"
      - "API response format unchanged"
      - "Performance baseline maintained"
```

### 評分方法

```yaml
grading_methods:
  code_based:
    description: "確定性檢查"
    reliability: "100%"
    tools:
      - "Build passes"
      - "Test suite passes"
      - "grep for patterns"
      - "No console.log in production"
    when_to_use: "可客觀驗證的標準"

  model_based:
    description: "Claude 評估開放式輸出"
    reliability: "85-95%"
    examples:
      - "Error message is user-friendly"
      - "Code follows project patterns"
      - "Documentation is clear"
    when_to_use: "主觀或需要理解的標準"

  human_based:
    description: "需要人工審核"
    reliability: "依審核者"
    use_cases:
      - "安全敏感變更"
      - "UX 決策"
      - "商業邏輯驗證"
    when_to_use: "高風險或需要業務判斷"
```

### 成功指標

```yaml
success_metrics:
  "pass@k":
    formula: "在 k 次嘗試內至少成功一次"
    example: "pass@3 = 3 次內成功即可"
    use_case: "允許重試的場景"

  "pass^k":
    formula: "連續 k 次都成功"
    example: "pass^3 = 連續 3 次成功"
    use_case: "需要穩定性的場景"

  recommendations:
    development: "pass@3 足夠"
    production: "pass^2 或 pass^3"
    critical: "pass^5 + 人工審核"
```

### EDD 工作流程

```yaml
edd_workflow:
  1_define:
    description: "在編碼前建立成功標準"
    output: ".vibe-engine/evals/{feature}.md"
    template: |
      # {Feature} Eval

      ## Success Criteria
      - [ ] Build passes
      - [ ] All tests pass
      - [ ] Coverage >= 80%
      - [ ] No security vulnerabilities
      - [ ] {Feature-specific criterion 1}
      - [ ] {Feature-specific criterion 2}

      ## Grading
      - Code-based: Build, tests, coverage
      - Model-based: Code quality assessment
      - Human-based: Security review (if applicable)

      ## Baseline
      - Existing tests: {count}
      - Current coverage: {percentage}

  2_implement:
    description: "編寫針對 evals 的代碼"
    focus: "滿足定義的標準，不多不少"
    checkpoint: "每個標準通過時記錄"

  3_evaluate:
    description: "運行所有 evals 並記錄結果"
    output: ".vibe-engine/evals/{feature}.log"
    format: |
      ## Run #{n} - {timestamp}
      - Build: PASS
      - Tests: PASS (42/42)
      - Coverage: 85%
      - Security: PASS
      - Feature-specific-1: PASS
      - Feature-specific-2: FAIL (reason)

      Result: 5/6 PASS

  4_report:
    description: "文檔通過率和整體狀態"
    metrics:
      - "pass@1: 0% (first attempt failed)"
      - "pass@3: 100% (succeeded on 3rd try)"
      - "Overall: READY"
```

### Eval 存儲結構

```
.vibe-engine/evals/
├── auth-login.md          # Eval 定義
├── auth-login.log         # 運行歷史
├── user-registration.md
├── user-registration.log
├── baseline.json          # 回歸基線
└── index.md               # Eval 索引
```

### /eval 命令

```yaml
command_eval:
  usage:
    - "/eval" - 顯示當前功能的 eval 狀態
    - "/eval define [feature]" - 定義新 eval
    - "/eval run" - 運行所有相關 evals
    - "/eval report" - 生成報告

  define_flow:
    1: "識別功能名稱"
    2: "詢問成功標準"
    3: "確定評分方法"
    4: "設定基線"
    5: "保存到 .vibe-engine/evals/"

  output_example: |
    📊 Eval Status: auth-login

    Success Criteria:
    ✅ Build passes
    ✅ All tests pass (15/15)
    ✅ Coverage >= 80% (87%)
    ⏳ Security review pending

    Metrics:
    - pass@1: 67%
    - pass@3: 100%

    Status: ALMOST READY
    Action: Complete security review
```

### 與 TDD 的整合

```yaml
tdd_edd_integration:
  sequence:
    1: "EDD: 定義功能級別成功標準"
    2: "TDD: 為每個標準寫單元測試"
    3: "實作代碼通過測試"
    4: "EDD: 運行完整 eval 套件"
    5: "重複直到所有 evals 通過"

  example:
    edd_criteria: "Login returns JWT for valid credentials"
    tdd_tests:
      - "test_login_with_valid_email_password"
      - "test_login_returns_valid_jwt"
      - "test_jwt_contains_user_id"
      - "test_login_fails_with_invalid_password"
```

### 最佳實踐

```yaml
edd_best_practices:
  do:
    - "先定義 evals，再寫代碼"
    - "頻繁運行 evals"
    - "優先使用 code-based graders"
    - "安全變更需人工審核"
    - "保持 eval 定義簡潔"

  dont:
    - "跳過 eval 定義直接編碼"
    - "只在最後運行 evals"
    - "過度依賴 model-based grading"
    - "忽略 regression evals"

  tips:
    - "開始時 2-3 個標準，逐步增加"
    - "code-based > model-based > human-based"
    - "regression evals 比 capability evals 更重要"
```

---

## 參考資源

- [The Hidden Cost of Code Entropy - IN-COM](https://www.in-com.com/blog/the-hidden-cost-of-code-entropy-why-refactoring-isnt-optional-anymore/)
- [Spec Driven Development - Medium](https://noailabs.medium.com/specification-driven-development-sdd-66a14368f9d6)
- [Beyond TDD: Why SDD - Kinde](https://kinde.com/learn/ai-for-software-engineering/best-practice/beyond-tdd-why-spec-driven-development-is-the-next-step/)
- [AI Code Refactoring - IBM](https://www.ibm.com/think/topics/ai-code-refactoring)
- [Domain-Driven TDD for AI - LangWatch](https://langwatch.ai/blog/from-scenario-to-finished-how-to-test-ai-agents-with-domain-driven-tdd)
- [everything-claude-code Eval Harness](https://github.com/affaan-m/everything-claude-code)
