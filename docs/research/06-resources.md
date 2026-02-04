# 6. 資源管理

## 問題定義

如何控制 Token 消耗、執行時間和成本，避免資源失控？

---

## 子問題拆解

### 6.1 多維度預算

**問題**：需要追蹤哪些資源維度？

**現有認知**：
```yaml
budget:
  tokens:
    per_task: 100000
    per_session: 500000
    by_model:
      opus: 50000
      sonnet: 200000
      haiku: 500000

  time:
    per_task: 30m
    per_agent_call: 5m

  cost:
    per_task: $1.00
    per_day: $20.00

  operations:
    max_file_edits: 50
    max_bash_commands: 100
```

**待解決**：
- [ ] 預算數值如何設定才合理？
- [ ] 不同任務類型是否需要不同預算？
- [ ] 預算如何跨會話累積？

---

### 6.2 預算追蹤

**問題**：如何即時追蹤資源使用情況？

**現有認知**：
- 每次 API 調用記錄 token 使用
- 累加計算總消耗
- 與預算比較

**待解決**：
- [ ] Token 計數的準確性如何保證？
- [ ] 如何預測「還能做多少」？
- [ ] 追蹤資訊儲存在哪裡？

---

### 6.3 預算警報與處理

**問題**：預算快用完時如何處理？

**現有認知**：
```yaml
alerts:
  thresholds:
    - level: warning, at: 70%, action: log_warning
    - level: critical, at: 90%, action: notify_user
    - level: exceeded, at: 100%, action: pause_task
```

**待解決**：
- [ ] 暫停後如何讓用戶決定是否繼續？
- [ ] 是否允許「透支」？
- [ ] 如何避免在關鍵操作中途停止？

---

### 6.4 智能模型路由

**問題**：如何根據任務選擇最經濟的模型？

**現有認知**：
```
簡單任務 → Haiku ($)
一般任務 → Sonnet ($$)
複雜任務 → Opus ($$$)

效果：成本減少 30-50%
```

**待解決**：
- [ ] 如何判斷任務複雜度？
- [ ] 選錯模型時如何補救？
- [ ] 預算緊張時是否強制降級？

---

### 6.5 資源競爭協調

**問題**：多個 Agent 同時運行時，如何分配 API quota？

**現有認知**：
```yaml
allocation:
  strategy: priority_with_fairness
  priorities:
    critical_path: 3
    normal: 2
    background: 1
  fairness:
    min_share: 10%
    max_share: 50%
```

**待解決**：
- [ ] 優先級如何動態調整？
- [ ] 死鎖如何檢測和解決？
- [ ] 排隊等待的 Agent 如何處理？

---

### 6.6 模型降級處理

**問題**：高級模型不可用時如何處理？

**現有認知**：
```yaml
model_capability:
  task_routing:
    - task_type: architecture
      preferred: opus
      fallback: sonnet

degradation:
  on_model_unavailable:
    action: use_next_tier
    notify: true
```

**待解決**：
- [ ] 降級後如何保證品質？
- [ ] 是否需要重新規劃任務？
- [ ] 如何檢測模型是否恢復？

---

## 現有方案

### Kong
- Token rate-limiting
- Tiered access control

### Portkey
- Budget limits and alerts
- Multi-provider routing

### TrueFoundry
- Rate limiting in AI Gateway
- Cost tracking dashboard

---

## 我們的解法

### 6.1 解法：多維度預算

**預算數值設定依據**：
```yaml
budget_guidelines:
  tokens:
    per_task:
      simple: 20000    # 單一檔案修改、簡單問答
      moderate: 50000  # 多檔案修改、需要推理
      complex: 150000  # 大型重構、架構設計
      auto_detect: based_on_task_classification

    per_session:
      default: 500000
      rationale: |
        平均每個任務 50K tokens × 最多 10 個任務
        + 額外緩衝 for retries

    by_model:
      opus:
        max: 50000
        reason: 最貴，僅用於複雜推理
      sonnet:
        max: 200000
        reason: 性價比最佳，主力模型
      haiku:
        max: 500000
        reason: 最便宜，大量簡單任務

  time:
    per_task:
      default: 30m
      simple: 5m
      complex: 60m
    per_agent_call:
      default: 5m
      rationale: 防止單個 Agent 卡住

  cost:
    per_task:
      default: $1.00
      warning_at: $0.70
    per_day:
      default: $20.00
      weekend: $5.00  # 自動降低

  operations:
    file_edits:
      per_task: 50
      rationale: 防止無限重寫同一檔案
    bash_commands:
      per_task: 100
      dangerous_commands: 10  # 有副作用的命令
```

**任務類型的預算差異**：
```yaml
task_budgets:
  mapping:
    question_answering:
      tokens: 10000
      time: 2m
      cost: $0.10
    code_modification:
      tokens: 50000
      time: 15m
      cost: $0.50
    bug_fix:
      tokens: 80000
      time: 30m
      cost: $0.80
    feature_implementation:
      tokens: 150000
      time: 60m
      cost: $1.50
    architecture_design:
      tokens: 100000
      time: 30m
      cost: $1.00
      model: prefer_opus

  detection:
    method: keyword_and_complexity_analysis
    override: user_can_specify
```

---

### 6.2 解法：預算追蹤

**Token 計數準確性**：
```typescript
interface TokenCounter {
  // 使用 tiktoken 精確計數
  countTokens(text: string, model: string): number;

  // API 回傳的實際使用量
  recordActual(usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
  }): void;
}

class BudgetTracker {
  private usage: UsageRecord = {
    tokens: { prompt: 0, completion: 0, cached: 0 },
    cost: 0,
    time: 0,
    operations: { file_edits: 0, bash_commands: 0 },
  };

  private budget: Budget;

  // 預估剩餘可執行量
  estimateRemaining(): RemainingBudget {
    const tokensLeft = this.budget.tokens.total - this.totalTokens();
    const avgTokensPerAction = this.totalTokens() / this.actionCount();

    return {
      tokens: tokensLeft,
      estimated_actions: Math.floor(tokensLeft / avgTokensPerAction),
      cost_remaining: this.budget.cost.total - this.usage.cost,
      time_remaining_ms: this.budget.time.total - this.usage.time,
    };
  }

  // 追蹤資訊儲存位置
  persist(): void {
    const path = `.vibe-engine/tasks/${this.taskId}/usage.json`;
    writeJSON(path, {
      usage: this.usage,
      budget: this.budget,
      timestamp: new Date().toISOString(),
    });
  }
}
```

**Token 計數方式**：
```yaml
token_counting:
  estimation:
    when: before_api_call
    method: tiktoken (cl100k_base for Claude)
    include:
      - system_prompt
      - injected_context
      - user_message
      - tool_definitions

  actual:
    when: after_api_response
    source: response.usage
    reconciliation:
      if: abs(estimated - actual) > 10%
      action: log_discrepancy_for_calibration

  caching_aware:
    track_separately:
      - cache_read_tokens (discounted)
      - cache_creation_tokens (full price first time)
    cost_calculation:
      cached: token_count * price * 0.1  # 90% discount
      uncached: token_count * price
```

---

### 6.3 解法：預算警報與處理

**警報處理流程**：
```yaml
alerts:
  levels:
    warning:
      at: 70%
      actions:
        - log: "Budget at 70%, consider wrapping up"
        - ui: show_warning_indicator
        - strategy: switch_to_cheaper_model

    critical:
      at: 90%
      actions:
        - notify_user: |
            ⚠️ 預算即將用盡 (90%)
            剩餘：{remaining_tokens} tokens / ${remaining_cost}
            建議：完成當前步驟後暫停
        - strategy: aggressive_cost_reduction
        - checkpoint: force_create

    exceeded:
      at: 100%
      actions:
        - pause_task: true
        - prompt_user:
            message: |
              🛑 預算已用盡
              已使用：{used_tokens} tokens / ${used_cost}
              選項：
              1. 增加預算繼續
              2. 保存進度並結束
              3. 查看已完成的工作
            options:
              - add_budget: "+50000 tokens"
              - finish: "save and stop"
              - review: "show progress"
```

**透支控制**：
```yaml
overdraft:
  policy: limited_grace
  grace_period:
    tokens: 5000  # 允許超出 5K tokens 完成當前操作
    cost: $0.10

  conditions:
    allow_overdraft_if:
      - in_middle_of_file_write
      - in_middle_of_critical_operation
    deny_overdraft_if:
      - already_used_grace
      - previous_overdraft_unpaid

  critical_operation_protection:
    identify_critical:
      - file_write_in_progress
      - git_commit_in_progress
      - external_api_call_pending
    action: complete_before_pause
```

---

### 6.4 解法：智能模型路由

**任務複雜度判斷**：
```yaml
complexity_assessment:
  factors:
    token_estimate:
      simple: < 5000 tokens output
      moderate: 5000-20000 tokens
      complex: > 20000 tokens

    reasoning_depth:
      simple: direct_answer, single_step
      moderate: multi_step, some_reasoning
      complex: architecture, trade-off_analysis

    task_type:
      simple: [formatting, simple_refactor, doc_update]
      moderate: [bug_fix, feature_add, test_write]
      complex: [architecture_design, security_review, optimization]

  scoring:
    simple: 0-3 points → Haiku
    moderate: 4-6 points → Sonnet
    complex: 7+ points → Opus
```

**模型選擇邏輯**：
```typescript
function selectModel(task: Task, budgetState: BudgetState): ModelSelection {
  // 1. 基於任務複雜度的初步選擇
  const complexity = assessComplexity(task);
  let preferredModel = complexityToModel(complexity);

  // 2. 預算壓力調整
  if (budgetState.percentUsed > 70) {
    preferredModel = downgradeModel(preferredModel);
  }

  // 3. 檢查模型可用性
  if (!isModelAvailable(preferredModel)) {
    preferredModel = getFallbackModel(preferredModel);
  }

  // 4. 任務類型覆寫
  if (task.requires_high_capability) {
    preferredModel = Math.max(preferredModel, Model.Sonnet);
  }

  return {
    model: preferredModel,
    reason: `Complexity: ${complexity}, Budget: ${budgetState.percentUsed}%`,
    fallback: getNextTierDown(preferredModel),
  };
}

const MODEL_CAPABILITY: Record<Model, number> = {
  [Model.Haiku]: 1,
  [Model.Sonnet]: 2,
  [Model.Opus]: 3,
};
```

**選錯模型的補救**：
```yaml
model_correction:
  detection:
    signals:
      - output_quality_low: LLM-as-Judge score < 0.5
      - task_failed: after model completed
      - output_incomplete: missing required parts

  correction:
    upgrade_trigger:
      - haiku_failed_twice
      - quality_score < 0.5
    action:
      - log: "Upgrading from {old} to {new} due to quality issues"
      - retry_with: next_tier_model
      - adjust_future_routing: increase_complexity_score_for_similar_tasks
```

---

### 6.5 解法：資源競爭協調

**優先級動態調整**：
```yaml
priority_management:
  initial_priority:
    critical_path: 3  # 阻塞其他任務的
    user_waiting: 3   # 用戶正在等待結果
    normal: 2
    background: 1

  dynamic_adjustment:
    waiting_too_long:
      condition: wait_time > 30s
      action: priority += 1

    consuming_too_much:
      condition: token_usage > budget * 0.5
      action: priority -= 1

    blocking_others:
      condition: other_tasks_waiting_for_result
      action: priority = max(priority, 3)
```

**資源分配策略**：
```typescript
class ResourceAllocator {
  private quota: ResourceQuota;
  private activeAgents: Map<string, AgentAllocation> = new Map();

  allocate(agent: Agent): Allocation | WaitResult {
    const priority = this.calculatePriority(agent);
    const requested = agent.estimatedResources;

    // 檢查是否超過最大份額
    if (requested > this.quota.maxShare) {
      return { wait: true, reason: 'exceeds_max_share' };
    }

    // 檢查是否違反最小份額保證
    const currentUsage = this.getCurrentUsage();
    const othersMinShare = this.calculateOthersMinShare();

    if (currentUsage + requested > this.quota.total - othersMinShare) {
      // 需要等待
      return {
        wait: true,
        estimatedWait: this.estimateWaitTime(requested),
        queuePosition: this.getQueuePosition(priority),
      };
    }

    // 分配資源
    const allocation = {
      tokens: Math.min(requested.tokens, this.quota.maxShare.tokens),
      apiCalls: Math.min(requested.apiCalls, this.quota.maxShare.apiCalls),
      expiresAt: Date.now() + 5 * 60 * 1000,  // 5 分鐘有效期
    };

    this.activeAgents.set(agent.id, allocation);
    return { allocated: allocation };
  }
}
```

**死鎖檢測與解決**：
```yaml
deadlock_handling:
  detection:
    check_interval: 10s
    condition:
      - agent_A waiting_for agent_B's file
      - agent_B waiting_for agent_A's file
    method: build_wait_graph_and_detect_cycle

  resolution:
    strategy: victim_selection
    criteria:
      - lowest_priority_first
      - least_work_done_first
      - newest_task_first
    action:
      - abort_victim_agent
      - release_its_resources
      - requeue_victim_task
      - notify: "Agent {victim} yielded due to deadlock"
```

---

### 6.6 解法：模型降級處理

**降級後的品質保證**：
```yaml
quality_assurance:
  when_degraded:
    strategies:
      - decompose_task: 把複雜任務拆成更小的部分
      - add_verification: 增加額外的驗證步驟
      - limit_scope: 減少單次操作的範圍

    example:
      original_task: "重構整個 auth 模組"
      degraded_approach:
        - task_1: "重構 login.ts"
        - task_2: "重構 logout.ts"
        - task_3: "重構 token.ts"
        - each: 使用 Haiku 但更多驗證

  quality_monitoring:
    track:
      - success_rate_per_model
      - retry_rate_per_model
      - user_satisfaction_signals
```

**恢復檢測**：
```yaml
recovery_detection:
  health_check:
    interval: 60s
    method:
      - api_ping: simple completion request
      - latency_check: response_time < 2s
      - error_rate_check: recent_errors < 10%

  gradual_restoration:
    process:
      1. 檢測到模型恢復
      2. 先用於低優先級任務測試
      3. 連續成功 3 次 → 恢復正常路由
      4. 通知用戶模型已恢復

  notification:
    on_degradation: |
      ⚠️ {model} 暫時不可用
      自動切換到 {fallback_model}
      功能可能有所限制

    on_recovery: |
      ✅ {model} 已恢復正常
      已切回最佳配置
```

**任務重規劃**：
```yaml
task_replanning:
  trigger:
    - preferred_model_unavailable
    - budget_insufficient_for_preferred

  strategies:
    break_down:
      description: 拆分成更小的任務
      when: complex_task + only_haiku_available

    defer:
      description: 延後執行複雜部分
      when: opus_temporarily_unavailable
      action: queue_for_later + notify_user

    simplify:
      description: 簡化任務範圍
      when: budget_critical
      example: "只修改關鍵部分，其餘手動處理"
```

---

## 參考資源

- [Token Rate-Limiting - Kong](https://konghq.com/blog/engineering/token-rate-limiting-and-tiered-access-for-ai-usage)
- [Budget Limits in LLM Apps - Portkey](https://portkey.ai/blog/budget-limits-and-alerts-in-llm-apps/)
- [Rate Limiting in AI Gateway - TrueFoundry](https://www.truefoundry.com/blog/rate-limiting-in-llm-gateway)
- [Multi-Agent Coordination Strategies - Galileo](https://galileo.ai/blog/multi-agent-coordination-strategies)
