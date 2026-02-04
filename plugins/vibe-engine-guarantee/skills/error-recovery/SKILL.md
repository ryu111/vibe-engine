---
name: error-recovery
description: This skill should be used when an error occurs, when a task fails, when retry logic is needed, or when rollback/compensation is required. Provides error classification, retry strategies, and Saga compensation patterns.
---

# Error Recovery

## Purpose

Provide systematic error handling with classification, retry strategies, and compensation patterns.

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
