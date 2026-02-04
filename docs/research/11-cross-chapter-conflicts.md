# 11. 跨章節衝突分析

## 目的

分析 10 個研究章節中的解法是否存在設計衝突，並提出協調方案。

---

## 衝突矩陣

```
          Ch1   Ch2   Ch3   Ch4   Ch5   Ch6   Ch7   Ch8   Ch9   Ch10
Ch1 協調   -    ⚡    ○    ○    ○    ⚡    ○    ⚠️    ⚠️    ○
Ch2 驗證        -    ○    ○    ○    ⚠️    ○    ○    ○    ⚡
Ch3 狀態             -    ⚡    ⚠️    ○    ○    ○    ○    ○
Ch4 錯誤                  -    ○    ○    ○    ⚠️    ○    ○
Ch5 記憶                       -    ⚡    ⚡    ○    ⚠️    ○
Ch6 資源                            -    ⚠️    ⚡    ○    ○
Ch7 觀測                                 -    ○    ⚠️    ○
Ch8 自主                                      -    ⚡    ⚠️
Ch9 安全                                           -    ○
Ch10 方法                                               -

圖例：
⚡ = 高優先級衝突（設計原則層面）
⚠️ = 中優先級衝突（實作細節層面）
○ = 無顯著衝突
```

---

## 高優先級衝突 (⚡)

### 衝突 1：協調 (Ch1) vs 資源 (Ch6)

**衝突描述**：
- Ch1：最大並行 4 個 Agent，追求效率
- Ch6：token 預算有限，可能不足以支撐 4 個並行 Agent

**具體場景**：
```
任務：重構 4 個模組
預算：50,000 tokens
每個 Agent 預估：20,000 tokens

如果並行執行 → 80,000 tokens → 超出預算
如果序列執行 → 效率降低但符合預算
```

**衝突本質**：效率優化 vs 成本控制

**解決方案**：
```yaml
coordination_budget_aware:
  parallel_decision:
    check_budget_first: true

    strategy:
      budget_sufficient:
        condition: estimated_total < budget * 0.8
        action: full_parallel

      budget_tight:
        condition: estimated_total < budget * 1.2
        action: partial_parallel
        max_concurrent: 2

      budget_insufficient:
        condition: estimated_total > budget * 1.2
        action: sequential_with_priority
        order_by: dependency_then_importance

  dynamic_adjustment:
    during_execution:
      if: actual_usage > estimated * 1.3
      then: reduce_parallelism
```

**協調規則**：資源限制優先於效率優化

---

### 衝突 2：協調 (Ch1) vs 驗證 (Ch2)

**衝突描述**：
- Ch1：目標 5 秒內完成任務分配
- Ch2：六層驗證需要時間執行

**具體場景**：
```
Main Agent 分析任務 → 應該快速路由
但如果要預驗證子任務的可行性 → 需要執行部分驗證
```

**衝突本質**：路由速度 vs 分配品質

**解決方案**：
```yaml
routing_vs_verification:
  phase_separation:
    routing_phase:
      time_budget: 5s
      verification_level: none
      responsibility: 只做任務分解和路由

    execution_phase:
      verification_level: full
      responsibility: SubAgent 執行時自行驗證

  pre_routing_validation:
    enabled: only_for_critical_tasks
    scope:
      - dependency_cycle_check (快速)
      - resource_availability_check (快速)
    excluded:
      - build_verification (慢)
      - test_execution (慢)
```

**協調規則**：路由階段只做結構驗證，內容驗證延遲到執行階段

---

### 衝突 3：驗證 (Ch2) vs 資源 (Ch6)

**衝突描述**：
- Ch2：六層驗證，每層都消耗資源
- Ch6：預算有限

**具體場景**：
```
預算：$1.00
任務：修改一個函數
六層驗證成本：
- Layer 1 (Static): $0.00 (本地工具)
- Layer 2 (Unit Test): $0.00 (本地執行)
- Layer 3 (Integration): $0.05 (需要 API)
- Layer 4 (E2E): $0.10 (需要 API)
- Layer 5 (LLM Judge): $0.20 (LLM 調用)
- Layer 6 (Human Review): $0.00 (人工)

如果預算已用 90%，應該跳過哪些層？
```

**衝突本質**：驗證完整性 vs 成本控制

**解決方案**：
```yaml
verification_budget_policy:
  budget_allocation:
    reserved_for_verification: 20%  # 預留 20% 給驗證

  layer_priority:
    P0_always_run:  # 不可跳過
      - layer_1_static
      - layer_2_unit_test
      cost: $0.00

    P1_important:   # 預算緊張時可簡化
      - layer_3_integration
      - layer_5_llm_judge
      simplified_mode:
        integration: only_affected_modules
        llm_judge: shorter_prompt

    P2_optional:    # 預算不足時可跳過
      - layer_4_e2e
      - layer_6_human_review (變成 optional notification)

  degradation_rules:
    budget_at_70:
      action: run P0, P1 in simplified mode, skip P2
    budget_at_90:
      action: run P0 only, notify user of reduced verification
    budget_exceeded:
      action: P0 only + warning message
```

**協調規則**：基礎驗證 (P0) 不可跳過，其他根據預算動態調整

---

### 衝突 4：狀態 (Ch3) vs 錯誤恢復 (Ch4)

**衝突描述**：
- Ch3：Checkpoint 在特定時機保存
- Ch4：Saga 補償需要精確的狀態點

**具體場景**：
```
執行順序：
1. 修改 file A ✓ (checkpoint 1)
2. 修改 file B ✓
3. 修改 file C ✗ (失敗)
4. 需要補償 B → 但沒有 checkpoint 2

Saga 需要在每個 step 後有恢復點
但 Checkpoint 可能只在「重要時機」保存
```

**衝突本質**：Checkpoint 粒度 vs 補償需求

**解決方案**：
```yaml
checkpoint_saga_integration:
  unified_approach:
    description: Saga 的每個 step 自帶 mini-checkpoint

  implementation:
    saga_step:
      before_execute:
        - capture_affected_state (輕量)
        - store_in_saga_context (記憶體)

      on_failure:
        - use_saga_context_for_compensation (快速)

      on_success:
        - merge_to_main_checkpoint (定期)

  checkpoint_triggers:
    saga_aware:
      - saga_transaction_complete: create_full_checkpoint
      - saga_partial_complete: create_incremental_checkpoint

  example:
    step_1_modify_A:
      mini_checkpoint: { file: A, content_hash: xxx }
    step_2_modify_B:
      mini_checkpoint: { file: B, content_hash: yyy }
    step_3_fails:
      compensate_using: [mini_checkpoint_2, mini_checkpoint_1]
    after_compensation:
      full_checkpoint: restore_to_pre_saga_state
```

**協調規則**：Saga 維護自己的輕量恢復點，與主 Checkpoint 系統協作而非依賴

---

### 衝突 5：記憶 (Ch5) vs 資源 (Ch6)

**衝突描述**：
- Ch5：長期記憶需要儲存和檢索
- Ch6：token 預算包括注入的記憶

**具體場景**：
```
檢索到 10 條相關記憶 = 2000 tokens
任務預算 = 20000 tokens
注入記憶後實際可用 = 18000 tokens

記憶太多 → 擠壓任務執行空間
記憶太少 → 可能重複錯誤
```

**衝突本質**：上下文豐富度 vs 任務執行空間

**解決方案**：
```yaml
memory_budget_coordination:
  token_allocation:
    total_context: 100%
    breakdown:
      system_prompt: 10%
      memory_injection: 10-15%  # 有上限
      task_context: 20-30%
      tool_outputs: 30-40%
      reasoning_space: 10-20%

  adaptive_injection:
    budget_healthy:
      memory_tokens: max 15%
      retrieval_count: 5-10 items

    budget_tight:
      memory_tokens: max 10%
      retrieval_count: 3-5 items
      filter: only_high_relevance (>0.8)

    budget_critical:
      memory_tokens: max 5%
      retrieval_count: 1-3 items
      filter: only_critical_memories

  memory_compression:
    when: injection_exceeds_limit
    method: summarize_similar_memories
    example:
      before: 5 separate episodic memories about auth
      after: 1 consolidated memory: "Auth 相關經驗摘要..."
```

**協調規則**：記憶注入有硬性上限，根據預算動態調整

---

### 衝突 6：記憶 (Ch5) vs 可觀測性 (Ch7)

**衝突描述**：
- Ch5：記憶系統儲存在 `.vibe-engine/memory/`
- Ch7：Log 系統儲存在 `.vibe-engine/logs/`

**具體場景**：
```
兩個系統都：
- 寫入磁碟
- 有輪轉/清理策略
- 需要索引和查詢
- 可能包含敏感資訊

是否應該統一？還是保持分離？
```

**衝突本質**：儲存架構統一性 vs 職責分離

**解決方案**：
```yaml
storage_architecture:
  decision: 保持分離，但統一管理介面

  rationale:
    - 記憶是語義內容（facts, experiences）
    - Log 是事件記錄（what happened, when）
    - 生命週期不同（記憶長期，log 短期）
    - 查詢模式不同（記憶語義搜索，log 時間範圍）

  unified_management:
    storage_manager:
      responsibilities:
        - 磁碟空間監控
        - 統一清理觸發
        - 敏感資料掃描

    shared_policies:
      max_total_storage: 500MB
      allocation:
        logs: 60%
        memory: 30%
        checkpoints: 10%

    cross_reference:
      memory_can_link_to: log_entries (via timestamp)
      log_can_tag: memory_access (which memory was used)
```

**協調規則**：邏輯分離，物理空間統一管理

---

### 衝突 7：資源 (Ch6) vs 自主 (Ch8)

**衝突描述**：
- Ch6：模型路由根據任務複雜度選擇
- Ch8：自主等級影響操作執行

**具體場景**：
```
L3 自主等級：大部分操作自動執行
但預算壓力導致降級到 Haiku

用 Haiku 執行 L3 等級的自主決策安全嗎？
```

**衝突本質**：模型能力 vs 授權等級

**解決方案**：
```yaml
model_autonomy_binding:
  principle: 自主等級應與模型能力綁定

  safe_combinations:
    opus:
      allowed_autonomy: [L0, L1, L2, L3, L4]
    sonnet:
      allowed_autonomy: [L0, L1, L2, L3]
    haiku:
      allowed_autonomy: [L0, L1, L2]

  on_model_downgrade:
    check_current_autonomy: true
    if_incompatible:
      action: auto_reduce_autonomy
      notify_user: |
        ⚠️ 模型已降級到 {model}
        自主等級從 L{old} 調整到 L{new}
        更多操作將需要您的確認

  override:
    user_can_force: true
    warning: "使用較弱模型執行高自主任務可能產生錯誤"
```

**協調規則**：自主等級必須與模型能力匹配，降級時同步降低自主

---

### 衝突 8：自主 (Ch8) vs 安全 (Ch9)

**衝突描述**：
- Ch8：L3/L4 等級允許大部分自動執行
- Ch9：Zero Trust 要求每個操作都驗證

**具體場景**：
```
L4 高度自主：幾乎所有操作自動執行
Zero Trust：Agent 調用 tool 前需要權限驗證

這不是自相矛盾嗎？
```

**衝突本質**：自動化程度 vs 安全檢查

**解決方案**：
```yaml
autonomy_security_reconciliation:
  clarification:
    autonomy_controls: 人類是否需要介入決策
    security_controls: 操作是否被允許執行

    # 這兩個是正交的維度！

  example:
    L4_autonomy_high_security:
      agent_decides: "需要修改 auth.ts"
      human_approval: 不需要 (L4)
      security_check: 仍然執行
        - agent 有 write 權限嗎？ ✓
        - 操作符合 task scope 嗎？ ✓
        - 是危險模式嗎？ ✗ 不是
      result: 自動執行

    L4_autonomy_blocked_by_security:
      agent_decides: "需要讀取 .env"
      human_approval: 不需要 (L4)
      security_check: 失敗
        - agent 有讀 .env 權限嗎？ ✗ 沒有
      result: 拒絕執行 (安全優先)

  priority_order:
    1. security_check (硬性限制)
    2. autonomy_level (軟性授權)

  implementation:
    security_is_invisible:
      description: 安全檢查在背景自動執行
      user_sees: 只看到自主等級的批准流程

    security_block_escalation:
      when: security_blocks_an_action
      action: 無論自主等級都通知用戶
      message: "操作被安全策略阻擋：{reason}"
```

**協調規則**：安全檢查是硬性限制，自主等級是軟性授權，兩者正交

---

## 中優先級衝突 (⚠️)

### 衝突 9：協調 (Ch1) vs 自主 (Ch8)

**衝突描述**：
- Ch1：SubAgent 不能創建 SubSubAgent (Worker Preamble Protocol)
- Ch8：高自主等級暗示 Agent 有更多決策權

**問題**：高自主的 SubAgent 是否可以請求創建輔助 Agent？

**解決方案**：
```yaml
subagent_autonomy_limits:
  rule: 自主等級只影響 human-agent 互動，不影響 agent 結構

  subagent_cannot:
    - create_new_subagent (無論自主等級)
    - delegate_to_peer (必須經過 Main)
    - modify_task_structure

  subagent_can_with_high_autonomy:
    - skip_intermediate_confirmations
    - auto_retry_on_failure
    - make_implementation_decisions
```

---

### 衝突 10：協調 (Ch1) vs 安全 (Ch9)

**衝突描述**：
- Ch1：快速路由，5 秒內分配
- Ch9：每個 Agent 創建需要安全驗證

**解決方案**：
```yaml
fast_routing_with_security:
  pre_computed_permissions:
    at_task_start:
      - 分析任務需要的權限
      - 預先計算 SubAgent 權限範圍
      - 快取常用 Agent 配置

  routing_time_security:
    inline_checks: only_fast_checks
      - agent_type_allowed: O(1) lookup
      - permission_subset_valid: O(1) comparison
    deferred_checks: slow_checks_during_execution
      - detailed_action_validation
```

---

### 衝突 11：狀態 (Ch3) vs 記憶 (Ch5)

**衝突描述**：
- Ch3：Checkpoint 保存任務狀態
- Ch5：Memory consolidation 提取重要資訊

**問題**：任務完成後，Checkpoint 是否應該觸發 Memory consolidation？

**解決方案**：
```yaml
checkpoint_memory_integration:
  on_task_complete:
    step_1: 保存最終 checkpoint
    step_2: 觸發 memory consolidation
    step_3: 標記 checkpoint 可以清理

  on_task_resume:
    step_1: 載入 checkpoint
    step_2: 注入相關記憶
    step_3: 繼續執行

  lifecycle:
    checkpoint: short_term (7-30 days)
    memory: long_term (90+ days)

  deduplication:
    dont_store_in_both:
      - raw_conversation (只在 checkpoint)
      - extracted_facts (只在 memory)
```

---

### 衝突 12：錯誤恢復 (Ch4) vs 自主 (Ch8)

**衝突描述**：
- Ch4：Saga 補償自動執行
- Ch8：高風險操作需要確認

**問題**：補償操作（如刪除剛創建的檔案）是否需要確認？

**解決方案**：
```yaml
compensation_autonomy:
  principle: 補償操作的風險等級 ≤ 原操作

  examples:
    original: create_file
    compensation: delete_file
    risk: LOW (只刪除剛創建的)
    need_confirmation: no

    original: modify_file
    compensation: restore_backup
    risk: MEDIUM (可能覆蓋其他變更)
    need_confirmation: depends_on_autonomy_level

  override_for_safety:
    if: compensation_involves_external_system
    then: always_confirm
    example: "undoing an API call that sent email"
```

---

### 衝突 13：記憶 (Ch5) vs 安全 (Ch9)

**衝突描述**：
- Ch5：記憶系統儲存歷史資訊
- Ch9：敏感資訊不應被儲存

**解決方案**：
```yaml
memory_security:
  before_storing:
    scan_for_secrets:
      - api_keys
      - passwords
      - personal_data

    on_detection:
      action: redact_before_store
      example:
        original: "設定 API key 為 sk-12345..."
        stored: "設定 API key 為 [REDACTED]"

  memory_access_control:
    sensitive_memories:
      tag: "contains_redacted"
      access: only_with_explicit_permission
```

---

### 衝突 14：資源 (Ch6) vs 可觀測性 (Ch7)

**衝突描述**：
- Ch6：追蹤每個 token 使用
- Ch7：Log 詳細程度消耗儲存

**解決方案**：
```yaml
observability_budget:
  logging_cost:
    not_counted_against_token_budget: true
    has_own_storage_budget: true

  adaptive_logging:
    when_disk_low:
      reduce_log_level: DEBUG → INFO
      increase_sampling: 10% → 1%

  token_tracking_overhead:
    method: piggyback_on_api_response
    no_extra_calls: true
```

---

### 衝突 15：可觀測性 (Ch7) vs 安全 (Ch9)

**衝突描述**：
- Ch7：Log 應該詳細以便除錯
- Ch9：Log 不應包含敏感資訊

**解決方案**：
```yaml
secure_logging:
  already_defined_in_ch7:
    sensitive_data_filtering:
      patterns: [api_keys, passwords, tokens, emails]
      action: redact_before_write

  additional_rules:
    log_retention:
      sensitive_context: shorter retention (1d)
      normal_context: standard retention (7d)

    log_access:
      restricted: true
      audit_log_access: true
```

---

### 衝突 16：自主 (Ch8) vs 方法論 (Ch10)

**衝突描述**：
- Ch10：SDD 流程有嚴格的 phase 順序
- Ch8：高自主等級暗示更少干預

**問題**：AI 可以跳過 spec/test phase 直接寫 code 嗎？

**解決方案**：
```yaml
methodology_autonomy:
  principle: 方法論 phase 是必須的，自主等級影響每個 phase 內的行為

  phase_enforcement:
    spec_phase: required (但 AI 可以起草)
    test_phase: required (但 AI 可以生成)
    impl_phase: required
    verify_phase: required

  autonomy_within_phase:
    L1: AI 建議，人類確認每步
    L2: AI 執行，重要決定確認
    L3: AI 執行，phase 完成時確認
    L4: AI 執行，最終結果確認

  skip_phase_option:
    allowed: only_with_explicit_user_request
    warning: "跳過 {phase} 可能導致品質問題"
```

---

## 衝突解決統一原則

```yaml
conflict_resolution_hierarchy:
  # 當多個章節的規則衝突時，按此順序決定

  1_safety_first:
    description: 安全規則永遠優先
    examples:
      - 安全 > 效率
      - 安全 > 自主
      - 安全 > 成本節省

  2_user_intent_respected:
    description: 用戶明確指示優先於系統預設
    examples:
      - 用戶說「跳過測試」→ 可以跳過
      - 用戶設定預算 → 必須遵守

  3_graceful_degradation:
    description: 資源不足時降級而非失敗
    examples:
      - 預算不足 → 減少驗證層級
      - 模型不可用 → 降級到較弱模型

  4_explicit_over_implicit:
    description: 明確配置優先於推斷
    examples:
      - 用戶設定風險等級 → 使用設定值
      - 沒設定 → 使用推斷值

  5_reversibility_preferred:
    description: 優先選擇可逆的方案
    examples:
      - 先壓縮再刪除記憶
      - 先暫停再終止任務
```

---

## 實作建議

### 統一配置管理

```yaml
# .vibe-engine/config.yaml
vibe_engine:
  # 跨章節協調配置
  coordination:
    max_parallel_agents: 4
    budget_aware_parallelism: true

  resources:
    token_budget: 500000
    cost_budget: 20.00
    memory_injection_limit: 15%

  verification:
    budget_reserved: 20%
    min_layers: [static, unit_test]

  autonomy:
    default_level: L2
    model_capability_binding: true

  security:
    always_enforce: true
    audit_all_operations: true
```

### 衝突檢測器

```typescript
interface ConflictDetector {
  // 在執行前檢查配置是否有衝突
  validateConfig(config: VibeConfig): ConflictReport;

  // 在運行時檢查操作是否有衝突
  checkOperation(
    operation: Operation,
    context: ExecutionContext
  ): ConflictWarning[];
}
```

---

## 參考

各章節的具體解法詳見：
- [01-orchestration.md](01-orchestration.md)
- [02-verification.md](02-verification.md)
- [03-state.md](03-state.md)
- [04-error-recovery.md](04-error-recovery.md)
- [05-memory.md](05-memory.md)
- [06-resources.md](06-resources.md)
- [07-observability.md](07-observability.md)
- [08-autonomy.md](08-autonomy.md)
- [09-security.md](09-security.md)
- [10-methodology.md](10-methodology.md)
