# 4. 錯誤恢復

## 問題定義

Agent 執行失敗後，如何安全地回滾已執行的操作並恢復到穩定狀態？

---

## 子問題拆解

### 4.1 錯誤分類

**問題**：不同類型的錯誤應該如何處理？

**現有認知**：
```
可重試錯誤 (Transient)
├── API timeout
├── Rate limiting
├── Network glitch
└── → 策略：指數退避重試

可補償錯誤 (Compensatable)
├── 文件修改錯誤
├── 配置變更錯誤
└── → 策略：執行補償操作

不可逆錯誤 (Irreversible)
├── 已發送的郵件
├── 已執行的部署
└── → 策略：人類介入 + 審計

邏輯錯誤 (Logic)
├── AI 理解錯誤
├── 需求澄清
└── → 策略：上升給人類
```

**待解決**：
- [ ] 如何自動識別錯誤類型？
- [ ] 錯誤分類的邊界情況？
- [ ] 混合型錯誤如何處理？

---

### 4.2 重試策略

**問題**：可重試錯誤應該如何重試？

**現有認知**：
- 指數退避（Exponential Backoff）
- 最大重試次數限制
- Jitter 防止雷同

**待解決**：
- [ ] 指數退避的具體參數？
- [ ] 如何判斷「值得重試」vs「不要浪費時間」？
- [ ] 重試時是否需要修改策略？

---

### 4.3 Saga 補償模式

**問題**：如何為每個步驟定義反向操作？

**現有認知**：
```yaml
saga:
  steps:
    - name: create_branch
      action: git checkout -b feature/xxx
      compensate: git checkout main && git branch -D feature/xxx

    - name: modify_files
      action: apply_changes
      compensate: git checkout -- .

    - name: commit_changes
      action: git commit -m "..."
      compensate: git reset HEAD~1
```

**待解決**：
- [ ] 哪些操作需要定義補償？
- [ ] 補償失敗時怎麼辦？
- [ ] 如何測試補償邏輯的正確性？

---

### 4.4 分層降級策略

**問題**：系統不穩定時，如何逐級降低功能保持可用？

**現有認知**：
```
Level 1: full_functionality (全部功能)
Level 2: core_functionality (禁用外部 API)
Level 3: basic_mode (單一 Agent)
Level 4: read_only (只讀分析)
```

**待解決**：
- [ ] 降級的觸發條件？
- [ ] 如何檢測系統是否恢復？
- [ ] 降級期間的用戶體驗？

---

### 4.5 Circuit Breaker

**問題**：如何防止持續失敗導致資源耗盡？

**現有認知**：
```
Closed (正常) → 失敗累積 → Open (拒絕請求)
                              ↓
                        等待冷卻
                              ↓
                         Half-Open (試探)
                              ↓
                        成功 → Closed
                        失敗 → Open
```

**待解決**：
- [ ] 失敗閾值設多少合適？
- [ ] 冷卻時間設多久？
- [ ] 不同操作是否需要獨立的 Circuit Breaker？

---

## 現有方案

### 微服務領域
- Saga Pattern（分布式事務）
- Circuit Breaker Pattern
- Bulkhead Pattern

### AI Agent 領域
- Graceful degradation
- Retry with backoff
- Human escalation

---

## 我們的解法

### 4.1 解法：錯誤分類

**自動錯誤分類器**：
```typescript
interface ErrorClassification {
  type: 'transient' | 'compensatable' | 'irreversible' | 'logic';
  confidence: number;
  suggestedAction: ErrorAction;
}

function classifyError(error: Error, context: ExecutionContext): ErrorClassification {
  // 1. 模式匹配已知錯誤
  const knownPattern = matchKnownPatterns(error);
  if (knownPattern) return knownPattern;

  // 2. 基於錯誤特徵推斷
  const features = extractErrorFeatures(error, context);
  return inferClassification(features);
}

const ERROR_PATTERNS: Record<string, ErrorClassification> = {
  // Transient errors - 可重試
  'ECONNRESET': { type: 'transient', confidence: 0.95, suggestedAction: 'retry' },
  'ETIMEDOUT': { type: 'transient', confidence: 0.95, suggestedAction: 'retry' },
  'rate_limit_exceeded': { type: 'transient', confidence: 0.99, suggestedAction: 'backoff_retry' },
  '503': { type: 'transient', confidence: 0.9, suggestedAction: 'retry' },
  '429': { type: 'transient', confidence: 0.99, suggestedAction: 'backoff_retry' },

  // Compensatable errors - 可補償
  'file_write_failed': { type: 'compensatable', confidence: 0.8, suggestedAction: 'compensate' },
  'partial_commit': { type: 'compensatable', confidence: 0.9, suggestedAction: 'rollback' },

  // Irreversible errors - 不可逆
  'email_sent': { type: 'irreversible', confidence: 0.99, suggestedAction: 'audit_log' },
  'api_key_exposed': { type: 'irreversible', confidence: 0.99, suggestedAction: 'escalate' },

  // Logic errors - 邏輯錯誤
  'invalid_syntax': { type: 'logic', confidence: 0.95, suggestedAction: 'fix_and_retry' },
  'type_error': { type: 'logic', confidence: 0.9, suggestedAction: 'fix_and_retry' },
};
```

**錯誤特徵提取**：
```yaml
error_features:
  source_analysis:
    - is_network_related: error.code in ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
    - is_api_error: error.response?.status >= 400
    - is_file_system: error.code in ['ENOENT', 'EACCES', 'ENOSPC']
    - is_code_error: error instanceof SyntaxError || TypeError

  context_analysis:
    - operation_type: 'read' | 'write' | 'execute' | 'network'
    - has_side_effects: boolean
    - is_reversible: boolean
    - affects_external_systems: boolean

  history_analysis:
    - same_error_before: count
    - successful_retries_rate: percentage
```

**混合型錯誤處理**：
```yaml
hybrid_error_handling:
  example: "API 超時但已部分寫入檔案"

  decomposition:
    - component_1: { error: 'timeout', type: 'transient' }
    - component_2: { error: 'partial_write', type: 'compensatable' }

  resolution_order:
    1. 先處理 compensatable 部分（回滾部分寫入）
    2. 再處理 transient 部分（重試 API 調用）
    3. 驗證整體一致性
```

---

### 4.2 解法：重試策略

**指數退避參數**：
```typescript
interface RetryConfig {
  baseDelayMs: number;      // 基礎延遲
  maxDelayMs: number;       // 最大延遲
  maxRetries: number;       // 最大重試次數
  multiplier: number;       // 指數倍率
  jitterFactor: number;     // 隨機抖動比例
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  baseDelayMs: 1000,        // 1 秒
  maxDelayMs: 60000,        // 60 秒
  maxRetries: 5,
  multiplier: 2,
  jitterFactor: 0.2,        // ±20% 抖動
};

function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

// 重試序列範例：
// Attempt 0: 1000ms ± 200ms
// Attempt 1: 2000ms ± 400ms
// Attempt 2: 4000ms ± 800ms
// Attempt 3: 8000ms ± 1600ms
// Attempt 4: 16000ms ± 3200ms
```

**「值得重試」判斷**：
```yaml
retry_worthiness:
  should_retry:
    - error_type: transient
    - attempts_remaining: > 0
    - not_user_cancelled: true
    - progress_possible: true

  should_not_retry:
    - error_type: irreversible OR logic
    - same_error_repeated: >= 3  # 連續相同錯誤
    - no_state_change: after_last_retry
    - budget_exhausted: true

  adaptive_retry:
    description: 根據錯誤類型調整策略
    rules:
      rate_limit:
        strategy: respect_retry_after_header
        fallback: longer_backoff (5x multiplier)

      server_error_5xx:
        strategy: standard_backoff

      network_error:
        strategy: quick_retry_then_backoff
        first_retry_delay: 100ms
```

**策略修改機制**：
```yaml
strategy_modification:
  on_repeated_failure:
    after_3_failures:
      actions:
        - increase_timeout: 2x
        - try_alternative_endpoint: if available
        - reduce_request_size: if applicable

  on_partial_success:
    actions:
      - checkpoint_progress
      - retry_only_failed_parts
      - merge_results

  escalation:
    after_max_retries:
      - log_detailed_diagnostics
      - notify_user_with_options:
          - retry_with_different_approach
          - skip_and_continue
          - abort_task
```

---

### 4.3 解法：Saga 補償模式

**需要補償的操作清單**：
```yaml
compensatable_operations:
  file_system:
    - create_file:
        compensate: delete_file
    - modify_file:
        compensate: restore_from_backup
    - delete_file:
        compensate: restore_from_backup  # 需要先備份

  git_operations:
    - create_branch:
        compensate: delete_branch
    - commit:
        compensate: reset_head
    - checkout:
        compensate: checkout_previous

  configuration:
    - update_config:
        compensate: restore_previous_config
    - add_dependency:
        compensate: remove_dependency

  not_compensatable:
    - send_email
    - publish_package
    - deploy_to_production
    - external_api_with_side_effects
```

**Saga 實作**：
```typescript
interface SagaStep {
  name: string;
  execute: () => Promise<void>;
  compensate: () => Promise<void>;
  executed: boolean;
}

class Saga {
  private steps: SagaStep[] = [];
  private executedSteps: SagaStep[] = [];

  addStep(step: SagaStep): void {
    this.steps.push(step);
  }

  async execute(): Promise<SagaResult> {
    for (const step of this.steps) {
      try {
        // 執行前備份狀態
        await this.backupBeforeStep(step);

        await step.execute();
        step.executed = true;
        this.executedSteps.push(step);
      } catch (error) {
        // 執行失敗，開始補償
        return await this.compensate(error);
      }
    }
    return { success: true };
  }

  private async compensate(originalError: Error): Promise<SagaResult> {
    const compensationErrors: Error[] = [];

    // 逆序補償已執行的步驟
    for (const step of this.executedSteps.reverse()) {
      try {
        await step.compensate();
      } catch (compError) {
        compensationErrors.push(compError);
        // 繼續嘗試補償其他步驟
      }
    }

    return {
      success: false,
      originalError,
      compensationErrors,
      requiresManualIntervention: compensationErrors.length > 0,
    };
  }
}
```

**補償失敗處理**：
```yaml
compensation_failure:
  strategies:
    retry_compensation:
      max_attempts: 3
      description: 重試補償操作

    manual_intervention:
      trigger_when: compensation_retries_exhausted
      actions:
        - create_incident_report
        - notify_user
        - provide_manual_fix_instructions

    partial_rollback:
      description: 如果某些補償失敗，記錄並繼續
      output:
        - successful_compensations: []
        - failed_compensations: []
        - system_state: inconsistent
        - required_actions: []

  testing:
    chaos_engineering:
      - simulate_compensation_failures
      - verify_incident_reporting
      - validate_manual_instructions
```

---

### 4.4 解法：分層降級策略

**降級觸發條件**：
```yaml
degradation_triggers:
  to_core_functionality:  # Level 1 → Level 2
    conditions:
      - external_api_failure_rate > 50%
      - external_api_latency > 10s
    actions:
      - disable: external_api_calls
      - fallback: cached_responses OR local_alternatives

  to_basic_mode:  # Level 2 → Level 3
    conditions:
      - multi_agent_coordination_failing
      - model_api_degraded
    actions:
      - switch_to: single_agent_mode
      - use_model: fastest_available (Haiku)

  to_read_only:  # Level 3 → Level 4
    conditions:
      - write_operations_failing
      - file_system_issues
    actions:
      - disable: all_write_operations
      - allow: read_and_analysis_only
```

**恢復檢測**：
```yaml
recovery_detection:
  health_check:
    interval: 30s
    probes:
      - api_ping: check API availability
      - model_test: simple completion test
      - file_test: create and delete temp file

  recovery_conditions:
    from_read_only:  # Level 4 → Level 3
      - file_operations_success: 3 consecutive
      - no_write_errors: for 2 minutes

    from_basic_mode:  # Level 3 → Level 2
      - model_api_healthy: 5 consecutive checks
      - coordination_test_pass: true

    from_core_functionality:  # Level 2 → Level 1
      - external_apis_healthy: all critical APIs
      - latency_normal: < 2s
      - error_rate: < 5%

  gradual_recovery:
    description: 逐步恢復，不要一次跳回最高等級
    cool_down_between_levels: 60s
```

**降級期間的用戶體驗**：
```yaml
degraded_ux:
  notification:
    on_degradation: |
      ⚠️ 系統進入降級模式
      原因：{reason}
      影響：{disabled_features}
      預計恢復：{eta_if_known}

    on_recovery: |
      ✅ 系統已恢復正常
      已啟用：{restored_features}

  feature_availability:
    show_disabled_features: true
    explain_why_disabled: true
    offer_alternatives: when_available

  graceful_handling:
    if_user_requests_disabled_feature:
      response: |
        此功能目前不可用（{reason}）。
        替代方案：{alternatives}
        是否要等待恢復？
```

---

### 4.5 解法：Circuit Breaker

**Circuit Breaker 實作**：
```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;     // 失敗次數閾值
  successThreshold: number;     // Half-Open 時需要的成功次數
  timeout: number;              // Open 狀態持續時間 (ms)
  monitorInterval: number;      // 監控視窗 (ms)
}

const DEFAULT_CIRCUIT_CONFIG: Record<string, CircuitBreakerConfig> = {
  'anthropic_api': {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000,      // 1 分鐘
    monitorInterval: 30000,
  },
  'file_operations': {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,      // 30 秒
    monitorInterval: 10000,
  },
  'external_tools': {
    failureThreshold: 10,
    successThreshold: 5,
    timeout: 120000,     // 2 分鐘
    monitorInterval: 60000,
  },
};

class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.config.timeout) {
        this.state = 'half-open';
      } else {
        throw new CircuitOpenError('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.reset();
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.successes = 0;
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  private reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
  }
}
```

**獨立 Circuit Breaker 設計**：
```yaml
circuit_breaker_isolation:
  principle: 每個外部依賴獨立的 Circuit Breaker

  instances:
    - name: anthropic_api
      scope: 所有 Anthropic API 調用

    - name: file_system
      scope: 檔案讀寫操作

    - name: git_operations
      scope: git 命令

    - name: npm_registry
      scope: npm install / publish

    - name: external_tools
      scope: 第三方工具調用

  coordination:
    when_multiple_open:
      - 優先恢復核心功能
      - 通知用戶整體狀態
      - 考慮進入降級模式
```

**監控與警報**：
```yaml
circuit_monitoring:
  metrics:
    - circuit_state: current state per circuit
    - failure_rate: failures / total in window
    - trip_count: how many times circuit opened
    - recovery_time: time spent in open state

  alerts:
    circuit_opened:
      severity: warning
      message: "Circuit {name} opened after {failures} failures"

    circuit_stuck_open:
      trigger: open_duration > 10 minutes
      severity: critical
      message: "Circuit {name} stuck open, manual intervention may be needed"

  dashboard:
    show:
      - all_circuit_states
      - recent_trips
      - failure_trends
```

---

## 參考資源

- [Error Recovery in AI Agent Development - Gocodeo](https://www.gocodeo.com/post/error-recovery-and-fallback-strategies-in-ai-agent-development)
- [Error Handling in Agentic Systems - Agents Arcade](https://agentsarcade.com/blog/error-handling-agentic-systems-retries-rollbacks-graceful-failure)
- [Multi-Agent Failure Recovery - Galileo](https://galileo.ai/blog/multi-agent-ai-system-failure-recovery)
