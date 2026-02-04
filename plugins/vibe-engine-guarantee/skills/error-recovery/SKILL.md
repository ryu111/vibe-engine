---
name: error-recovery
description: ⛔ MANDATORY when errors occur during task execution. MUST classify error type and determine recovery strategy BEFORE attempting any retry. CRITICAL - 未執行錯誤分類禁止直接重試。
---

# Error Recovery

## Purpose

Provide systematic error handling with classification, retry strategies, and compensation patterns.

## ⛔ MANDATORY: 觸發條件

以下情況 **MUST** 使用此 skill：
- 任務執行過程中發生錯誤
- 需要重試失敗的操作
- 需要回滾或補償操作

⛔ BLOCK: 發生錯誤後直接重試而未先分類，禁止繼續操作。

## 強制流程

### Phase 1: 錯誤分類

執行完成後 **MUST** 輸出：
```
[CHECKPOINT] Error Classification
├─ 錯誤類型：transient | compensatable | logic | irreversible
├─ 匹配模式：[specific pattern]
├─ 恢復策略：retry | rollback | fix | escalate
└─ 下一步：[specific action]
```

⛔ BLOCK: 未輸出分類 checkpoint 禁止執行恢復策略

### Phase 2: 執行恢復

根據分類執行對應策略後 **MUST** 輸出：
```
[CHECKPOINT] Recovery Execution
├─ 策略：[executed strategy]
├─ 嘗試次數：X/Y
├─ 結果：SUCCESS | FAILED | ESCALATED
└─ 下一步：[continue | retry | escalate]
```

⛔ BLOCK: 超過最大重試次數 MUST 立即 escalate

## Core Flow

1. **Classify**: Identify error type (transient, compensatable, logic, irreversible)
2. **Decide**: Choose recovery strategy based on classification
3. **Execute**: Apply retry, compensation, or escalation
4. **Verify**: Confirm recovery succeeded

## Error Classification

### Transient Errors (Retry with Backoff)

```yaml
patterns:
  - ECONNRESET, ETIMEDOUT, ENOTFOUND
  - HTTP 429, 503, 504
  - "rate_limit_exceeded"
  - "connection refused"

strategy:
  type: exponential_backoff
  base_delay_ms: 1000
  max_delay_ms: 60000
  max_retries: 5
  multiplier: 2
  jitter_factor: 0.2
```

### Compensatable Errors (Rollback + Retry)

```yaml
patterns:
  - "file_write_failed"
  - "partial_commit"
  - git operation failures

strategy:
  type: saga_compensation
  steps:
    - identify_completed_steps
    - execute_compensation_in_reverse
    - verify_rollback_complete
    - retry_from_start
```

### Logic Errors (Fix + Retry)

```yaml
patterns:
  - SyntaxError, TypeError, ReferenceError
  - "invalid_syntax"
  - Build/compile failures
  - Test failures

strategy:
  type: fix_and_retry
  steps:
    - diagnose_with_debugger
    - generate_fix_suggestion
    - delegate_to_developer
    - run_verification
    - retry_if_fixed
```

### Irreversible Errors (Escalate)

```yaml
patterns:
  - "email_sent"
  - "deployed_to_production"
  - "api_key_exposed"
  - External API side effects

strategy:
  type: escalate_to_human
  steps:
    - log_incident
    - notify_user
    - provide_context
    - await_decision
```

## Retry Decision Matrix

| Error Type | Retry? | Strategy | Max Attempts |
|------------|--------|----------|--------------|
| transient | Yes | Backoff | 5 |
| compensatable | Yes | Rollback first | 3 |
| logic | After fix | Fix then retry | 2 |
| irreversible | No | Escalate | 0 |

## Saga Compensation Pattern

For multi-step operations, define compensation for each step:

```yaml
saga_definition:
  steps:
    - name: create_branch
      action: "git checkout -b feature/xxx"
      compensate: "git checkout main && git branch -D feature/xxx"

    - name: modify_files
      action: "apply_changes"
      compensate: "git checkout -- ."

    - name: commit_changes
      action: "git commit -m '...'"
      compensate: "git reset HEAD~1"

  on_failure:
    - execute_compensations_in_reverse_order
    - log_compensation_results
    - report_final_state
```

## Compensation Failure Handling

If compensation also fails:

1. Log detailed state
2. Create incident report
3. Notify user with manual fix instructions
4. Mark system state as "inconsistent"

## Usage

```javascript
// In hook or engine script
const { classifyError, executeRecovery } = require('./error-recovery');

try {
  await riskyOperation();
} catch (error) {
  const classification = classifyError(error, context);
  const result = await executeRecovery(classification, {
    maxRetries: 3,
    onRetry: (attempt) => console.log(`Retry ${attempt}...`),
    onEscalate: (error) => notifyUser(error)
  });
}
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/error-classifier.js` | Classify errors by pattern |
| `scripts/retry-executor.js` | Execute retry with backoff |
| `scripts/saga-coordinator.js` | Manage Saga compensation |

## Important Rules

- **Never retry irreversible errors**
- **Always log before retry**
- **Compensation must be idempotent**
- **Track retry count to prevent infinite loops**
- **Escalate after max retries exceeded**
