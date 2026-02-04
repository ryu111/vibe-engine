# 2. 閉環驗證

## 問題定義

如何確保 Agent 產出的結果真正達到要求，而不是「看起來完成了」？

---

## 子問題拆解

### 2.1 Agentic Loop 設計

**問題**：如何設計「感知→推理→行動→評估」的迭代循環？

**現有認知**：
```
Goal → Perceive → Reason → Act → Evaluate → 達成？
                                              ↓
                                      No → 回到 Perceive
                                      Yes → 結束
```

**待解決**：
- [ ] 每個階段的具體實作是什麼？
- [ ] 如何傳遞狀態給下一次迭代？
- [ ] 迭代之間如何避免重複工作？

---

### 2.2 成功標準定義

**問題**：什麼叫「任務完成」？如何定義可驗證的標準？

**現有認知**：
```yaml
success_criteria:
  - BUILD_PASS
  - TEST_PASS
  - LINT_PASS
  - FUNCTIONALITY_VERIFIED
```

**待解決**：
- [ ] 如何從用戶請求自動推導成功標準？
- [ ] 標準的優先級如何排序？
- [ ] 「FUNCTIONALITY_VERIFIED」具體怎麼驗證？

---

### 2.3 終止條件判斷

**問題**：什麼時候應該停止迭代？

**現有認知**：
- 成功標準全部達成
- 達到最大迭代次數
- 達到超時限制

**待解決**：
- [ ] 如何判斷「無法完成」vs「需要更多迭代」？
- [ ] 達到上限後應該怎麼處理？
- [ ] 如何避免「無限趨近但永遠不達標」？

---

### 2.4 多層驗證體系

**問題**：除了單元測試，還需要哪些驗證層？

**現有認知**：
```
Layer 1: 靜態驗證 (Type check, Lint, Security scan)
Layer 2: 單元測試
Layer 3: 整合測試
Layer 4: 端到端測試
Layer 5: AI 行為驗證 (LLM-as-Judge)
Layer 6: 人類驗收
```

**待解決**：
- [ ] 每層的具體實作方式？
- [ ] 哪些層是必須的、哪些可選？
- [ ] Layer 5「LLM-as-Judge」的 prompt 怎麼寫？

---

### 2.5 幻覺傳播防護

**問題**：如何防止 Agent A 的錯誤被 Agent B 放大？

**現有認知**：
- Chain-of-Verification：每個輸出都要驗證
- 事實檢查：代碼分析、測試執行、文件存在性
- 信心閾值：低信心的輸出標記為「不確定」

**待解決**：
- [ ] 驗證層的具體實作？
- [ ] 「事實」如何定義和檢查？
- [ ] 標記「不確定」後下游怎麼處理？

---

### 2.6 驗證協議

**問題**：標準化的驗證協議應該包含什麼？

**現有認知**：
```
BUILD   - 構建通過
TEST    - 測試通過
LINT    - Lint 通過
FUNCTIONALITY - 功能正確
ARCHITECT - 架構審查
```

**待解決**：
- [ ] 每個協議的具體執行步驟？
- [ ] 協議之間的執行順序？
- [ ] 如何自定義新協議？

---

## 現有方案

### oh-my-claudecode
- `ralph` skill：持續執行直到驗證完成
- 7 種驗證協議：BUILD, TEST, LINT, FUNCTIONALITY, ARCHITECT, TODO, ERROR_FREE

### Anthropic 建議
- "Grade what the agent produced, not the path it took"
- 確定性評分優先，LLM 評分次之

### LangWatch
- Domain-Driven TDD for AI
- 場景化測試

---

## 我們的解法

### 2.1 解法：Agentic Loop 設計

**四階段具體實作**：
```typescript
interface AgenticLoopState {
  goal: string;
  iteration: number;
  maxIterations: number;
  context: Context;
  history: ActionResult[];
}

async function agenticLoop(state: AgenticLoopState): Promise<FinalResult> {
  while (state.iteration < state.maxIterations) {
    // Phase 1: PERCEIVE - 感知環境與收集資訊
    const perception = await perceive(state);

    // Phase 2: REASON - 分析並決定下一步
    const plan = await reason(perception, state);

    // Phase 3: ACT - 執行決定的行動
    const result = await act(plan);

    // Phase 4: EVALUATE - 評估結果
    const evaluation = await evaluate(result, state.goal);

    // 更新狀態
    state.history.push(result);
    state.iteration++;

    // 終止條件檢查
    if (evaluation.goalAchieved) {
      return { status: 'success', result };
    }
    if (evaluation.unrecoverable) {
      return { status: 'failed', reason: evaluation.reason };
    }

    // 將評估結果帶入下一輪
    state.context = mergeContext(state.context, evaluation.insights);
  }

  return { status: 'max_iterations_reached', partialResult: state.history };
}
```

**各階段詳細實作**：
```yaml
perceive:
  inputs:
    - user_request
    - current_file_state
    - tool_outputs_from_last_action
    - error_messages
  process:
    - 整理相關 context
    - 過濾 noise
    - 識別關鍵變化
  output: PerceptionSummary

reason:
  inputs:
    - perception
    - goal
    - action_history
  process:
    - 分析差距 (current vs goal)
    - 生成可能的行動方案
    - 評估每個方案的風險與收益
    - 選擇最佳行動
  output: ActionPlan

act:
  inputs:
    - action_plan
  process:
    - 調用相應的 tool
    - 記錄執行結果
    - 處理執行錯誤
  output: ActionResult

evaluate:
  inputs:
    - action_result
    - goal
    - success_criteria
  process:
    - 對比結果與預期
    - 執行驗證檢查
    - 判斷是否需要繼續
  output: EvaluationResult
```

**迭代狀態傳遞**：
```yaml
state_passing:
  carry_forward:
    - files_modified: ["src/auth.ts"]
    - decisions_made: ["使用 JWT 而非 session"]
    - errors_encountered: ["首次嘗試的 import 錯誤"]
    - progress_markers: ["Step 1/5 完成"]

  compress_when:
    - iteration > 3: 摘要前幾輪的詳細 reasoning
    - tool_output > 1000_tokens: 只保留關鍵輸出

  avoid_repetition:
    method: state_hash_tracking
    process:
      - 計算當前狀態的 hash
      - 如果 hash 與歷史相同 → 偵測到循環
      - 強制改變策略或終止
```

---

### 2.2 解法：成功標準定義

**從用戶請求推導成功標準**：
```yaml
criteria_derivation:
  step_1_parse_request:
    extract:
      - action_verbs: ["實作", "修復", "新增", "重構"]
      - targets: ["登入功能", "API endpoint", "測試"]
      - constraints: ["不要改變 API", "保持向後相容"]

  step_2_map_to_criteria:
    verb_mapping:
      實作|新增:
        - CODE_COMPILES
        - TESTS_PASS
        - FUNCTIONALITY_WORKS
      修復:
        - BUG_RESOLVED
        - REGRESSION_TESTS_PASS
        - NO_NEW_ERRORS
      重構:
        - BEHAVIOR_UNCHANGED
        - CODE_QUALITY_IMPROVED
        - TESTS_STILL_PASS

  step_3_infer_implicit:
    always_include:
      - NO_SYNTAX_ERRORS
      - NO_TYPE_ERRORS (if TypeScript)
    context_based:
      - has_tests: TESTS_PASS
      - has_linter: LINT_PASS
      - is_production: NO_SECURITY_VULNERABILITIES
```

**標準優先級**：
```yaml
criteria_priority:
  P0_blocking:  # 必須通過，否則失敗
    - NO_SYNTAX_ERRORS
    - CODE_COMPILES
    - NO_RUNTIME_CRASHES

  P1_required:  # 應該通過，可以警告
    - TESTS_PASS
    - LINT_PASS
    - TYPE_CHECK_PASS

  P2_desired:   # 最好通過，不阻擋
    - CODE_COVERAGE > 80%
    - NO_TODO_COMMENTS
    - DOCUMENTATION_UPDATED
```

**FUNCTIONALITY_VERIFIED 的具體驗證**：
```yaml
functionality_verification:
  method: execution_based_testing
  steps:
    1. 識別功能的關鍵路徑
    2. 生成測試輸入
    3. 執行程式碼
    4. 驗證輸出是否符合預期

  example:
    task: "實作 isPrime 函數"
    verification:
      - input: 2, expected: true
      - input: 4, expected: false
      - input: 17, expected: true
      - input: 1, expected: false

  when_cannot_execute:
    fallback: llm_as_judge
    prompt: |
      檢查以下代碼是否正確實作了 {功能描述}：
      ```
      {code}
      ```
      回答 CORRECT 或 INCORRECT，並說明原因。
```

---

### 2.3 解法：終止條件判斷

**判斷決策樹**：
```
評估結果？
├── 所有標準都通過 → SUCCESS → 終止
├── P0 標準失敗 → FAILED → 終止
├── 只有 P2 標準未過 → SUCCESS_WITH_WARNINGS → 終止
└── P1 標準失敗
    ├── iteration < max → 繼續迭代
    └── iteration >= max
        ├── 有進展 → 延長迭代 (max * 1.5)
        └── 無進展 → FAILED → 終止
```

**「無法完成」vs「需要更多迭代」**：
```yaml
cannot_complete_signals:
  - same_error_repeated: 3  # 同樣錯誤連續出現 3 次
  - no_progress_iterations: 5  # 連續 5 輪無進展
  - external_blocker: true  # 需要人類輸入或外部資源
  - confidence_too_low: <0.3  # Agent 自評信心 < 30%

need_more_iterations_signals:
  - error_changing: true  # 錯誤在改變（代表有進展）
  - partial_success: true  # 部分標準已通過
  - clear_next_step: true  # 知道下一步該做什麼
```

**避免「無限趨近但永不達標」**：
```yaml
convergence_detection:
  track_metric: test_pass_rate  # 或其他量化指標

  pattern_detection:
    oscillation:
      description: 指標在 A 和 B 之間來回
      detection: variance(last_5_values) < threshold
      action: 強制選擇一個方向

    asymptotic:
      description: 指標趨近但不達到目標
      detection: derivative(metric) → 0 but metric < goal
      action: 嘗試完全不同的方法

  max_convergence_iterations: 3
  message: |
    偵測到收斂停滯。已嘗試 {n} 次微調但未能達標。
    建議：1) 人類介入 2) 重新定義目標 3) 接受當前結果
```

---

### 2.4 解法：多層驗證體系

**六層驗證的具體實作**：
```yaml
verification_layers:
  layer_1_static:
    tools:
      - typescript: tsc --noEmit
      - eslint: eslint --max-warnings 0
      - security: npm audit / semgrep
    execution: parallel
    blocking: true
    timeout: 30s

  layer_2_unit_test:
    tools:
      - jest / vitest / pytest
    execution: after layer_1 pass
    coverage_threshold: 70%
    timeout: 120s

  layer_3_integration_test:
    tools:
      - supertest (API testing)
      - playwright (E2E)
    execution: after layer_2 pass
    scope: 只測試變更相關的整合點
    timeout: 300s

  layer_4_e2e_test:
    tools:
      - playwright / cypress
    execution: after layer_3 pass (可選)
    scope: 關鍵用戶流程
    timeout: 600s

  layer_5_llm_judge:
    execution: after layer_4 or parallel
    use_cases:
      - 代碼品質評估
      - 需求符合度
      - 潛在問題識別
    prompt_template: |
      ## 任務
      評估以下代碼變更是否正確實作了需求。

      ## 需求
      {requirement}

      ## 代碼變更
      {diff}

      ## 評估標準
      1. 功能正確性 (0-10)
      2. 代碼品質 (0-10)
      3. 潛在風險 (列舉)

      回答格式 (JSON):
      {
        "functionality_score": number,
        "quality_score": number,
        "risks": string[],
        "verdict": "PASS" | "FAIL" | "NEEDS_REVIEW",
        "reasoning": string
      }

  layer_6_human_review:
    trigger_conditions:
      - security_sensitive_files
      - architecture_changes
      - llm_judge_verdict == "NEEDS_REVIEW"
    presentation:
      - 摘要變更
      - 高亮風險點
      - 提供 approve/reject/modify 選項
```

**層級選擇策略**：
```yaml
layer_selection:
  minimal_mode:  # 快速驗證
    layers: [1]
    use_when: "純格式修改、文檔更新"

  standard_mode:  # 一般開發
    layers: [1, 2, 5]
    use_when: "一般功能開發"

  thorough_mode:  # 重要變更
    layers: [1, 2, 3, 5, 6]
    use_when: "API 變更、安全相關、架構調整"

  full_mode:  # 發布前
    layers: [1, 2, 3, 4, 5, 6]
    use_when: "準備發布、大型重構"
```

---

### 2.5 解法：幻覺傳播防護

**Chain-of-Verification 實作**：
```yaml
chain_of_verification:
  step_1_generate:
    action: Agent 產生輸出
    output: initial_response

  step_2_extract_claims:
    action: 從輸出中提取可驗證的宣稱
    example:
      response: "我已在 auth.ts 第 42 行加入了 validateToken 函數"
      claims:
        - file: auth.ts, line: 42, function: validateToken, action: added

  step_3_verify_claims:
    action: 獨立驗證每個宣稱
    methods:
      - file_exists: 檢查檔案是否存在
      - function_exists: AST 分析函數是否存在
      - line_content: 檢查特定行的內容
      - test_execution: 執行測試驗證行為

  step_4_revise_or_flag:
    if_verified: 保留原始輸出
    if_not_verified:
      - 標記為 UNVERIFIED
      - 要求 Agent 修正
      - 或上報給用戶確認
```

**事實檢查清單**：
```yaml
fact_checking:
  file_operations:
    - claim: "已修改 {file}"
      check: git diff --name-only includes {file}
    - claim: "新增了 {file}"
      check: file exists AND git status shows new file
    - claim: "刪除了 {file}"
      check: file does not exist AND git status shows deleted

  code_claims:
    - claim: "函數 {name} 在 {file}"
      check: AST parse {file} AND find function {name}
    - claim: "import {module} from {path}"
      check: grep import statement in file

  execution_claims:
    - claim: "測試通過"
      check: actually run tests AND check exit code
    - claim: "沒有 type error"
      check: run tsc --noEmit AND check output
```

**信心閾值機制**：
```yaml
confidence_handling:
  threshold: 0.7

  high_confidence:  # >= 0.7
    action: 直接使用輸出
    verification: 抽樣驗證 (10%)

  medium_confidence:  # 0.4 - 0.7
    action: 加上 "UNVERIFIED" 標記
    verification: 全部驗證
    downstream_handling: 下游 Agent 會看到警告

  low_confidence:  # < 0.4
    action: 不傳遞給下游
    handling: 要求 Agent 重新嘗試或詢問用戶

  propagation_rule: |
    下游 Agent 的信心 ≤ min(自身信心, 上游輸入信心)
    即：不確定性只會累積，不會消失
```

---

### 2.6 解法：驗證協議

**協議執行步驟**：
```yaml
protocols:
  BUILD:
    description: 確保代碼可以構建
    steps:
      1. 安裝依賴 (npm install / pip install)
      2. 執行構建命令 (npm run build / python setup.py)
      3. 檢查退出碼
      4. 解析錯誤訊息 (如果失敗)
    success: exit_code == 0
    output: build_log, error_messages[]

  TEST:
    description: 確保測試通過
    steps:
      1. 識別測試框架 (jest / vitest / pytest)
      2. 執行測試命令
      3. 解析測試結果
      4. 計算覆蓋率 (可選)
    success: all_tests_pass AND coverage >= threshold
    output: test_results, coverage_report

  LINT:
    description: 確保代碼風格一致
    steps:
      1. 識別 linter 配置 (eslint / prettier / flake8)
      2. 執行 lint 命令
      3. 解析警告和錯誤
    success: error_count == 0
    output: lint_issues[]

  FUNCTIONALITY:
    description: 確保功能正確
    steps:
      1. 從任務描述推導預期行為
      2. 生成測試案例
      3. 執行並驗證結果
      4. 如果無法執行 → LLM-as-Judge
    success: all_cases_pass
    output: functionality_report

  ARCHITECT:
    description: 架構審查
    steps:
      1. 識別架構變更 (新檔案、新依賴、API 變化)
      2. 檢查是否符合既有 patterns
      3. 評估複雜度變化
      4. LLM-as-Judge 評估設計合理性
    success: no_red_flags AND llm_approval
    output: architecture_review
```

**協議執行順序**：
```yaml
execution_order:
  default: BUILD → LINT → TEST → FUNCTIONALITY → ARCHITECT

  fast_fail: true  # 前一步失敗就停止

  parallel_groups:
    - [BUILD]
    - [LINT, TEST]  # 可並行
    - [FUNCTIONALITY, ARCHITECT]  # 可並行

  conditional:
    ARCHITECT:
      only_when:
        - new_files_created
        - dependencies_changed
        - api_signature_changed
```

**自定義協議**：
```yaml
custom_protocol_template:
  name: string
  description: string
  trigger_conditions: Condition[]
  steps:
    - name: string
      command: string | function
      success_condition: Expression
      on_failure: retry | skip | fail
  success_criteria: Expression
  output_schema: JSONSchema
```

---

## 參考資源

- [Designing Agentic Loops - Simon Willison](https://simonwillison.net/2025/Sep/30/designing-agentic-loops/)
- [Demystifying Evals for AI Agents - Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [How to Test AI Agents - Galileo AI](https://galileo.ai/learn/test-ai-agents)
- [Chain-of-Verification - ACL](https://aclanthology.org/2024.findings-acl.212.pdf)
- [LLM Agent Hallucination Survey - Arxiv](https://arxiv.org/html/2509.18970v1)
