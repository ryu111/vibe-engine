---
name: auto-fix-loop
description: ⛔ MANDATORY when tests fail OR build errors occur. MUST follow fix-verify-retry cycle with max 3 iterations. CRITICAL - 超過 3 次迭代禁止繼續，MUST escalate to user。
---

# Auto Fix Loop

## Purpose

Implement automated fix-verify-retry cycles when tester or reviewer reports issues, reducing manual intervention.

## ⛔ MANDATORY: 觸發條件

以下情況 **MUST** 使用此 skill：
- 測試失敗
- 構建錯誤
- Lint 錯誤
- Reviewer 報告問題

⛔ BLOCK: 直接忽略失敗而不嘗試修復，禁止標記任務完成。

## ⛔ MANDATORY: 每次迭代 Checkpoint

每次 fix-verify 迭代後 **MUST** 輸出：
```
[CHECKPOINT] Auto-Fix Iteration N/3
├─ 嘗試修復：[description of fix]
├─ 修改檔案：[files changed]
├─ 驗證結果：PASS | FAIL
├─ 剩餘錯誤：X
└─ 下一步：continue | escalate
```

⛔ BLOCK: 未輸出 iteration checkpoint 禁止進入下一迭代
⛔ BLOCK: 達到 3 次迭代 MUST 立即 escalate，禁止繼續嘗試

## Core Flow

```
┌─────────────────────────────────────────────────┐
│               Auto Fix Loop                      │
└─────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ 1. DETECT: Receive failure report               │
│    - Test failures from tester                  │
│    - Build errors from verification-engine      │
│    - Review issues from reviewer                │
└─────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ 2. DIAGNOSE: Analyze with debugger agent        │
│    - Classify error type                        │
│    - Identify root cause                        │
│    - Generate fix suggestion                    │
└─────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ 3. DECIDE: Can auto-fix?                        │
│    ├─ Yes: Delegate to developer                │
│    └─ No: Escalate to user                      │
└─────────────────────────────────────────────────┘
                     │
           ┌────────┴────────┐
           ▼                 ▼
    ┌─────────────┐   ┌─────────────┐
    │ AUTO FIX    │   │ ESCALATE    │
    │             │   │             │
    │ developer   │   │ Report to   │
    │ applies fix │   │ user with   │
    │             │   │ diagnosis   │
    └─────────────┘   └─────────────┘
           │
           ▼
┌─────────────────────────────────────────────────┐
│ 4. VERIFY: Run verification again               │
│    - Re-run failed tests                        │
│    - Re-check build                             │
│    - Re-run lint                                │
└─────────────────────────────────────────────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
  ┌──────┐   ┌──────┐
  │ PASS │   │ FAIL │
  │      │   │      │
  │ Done │   │ Loop │
  │  ✅  │   │ back │
  └──────┘   └──────┘
                 │
                 ▼
        (max 3 iterations)
                 │
                 ▼
        ┌──────────────┐
        │ ESCALATE     │
        │ to user      │
        └──────────────┘
```

## Auto-Fixable Errors

| Error Type | Auto-Fix Strategy | Confidence |
|------------|-------------------|------------|
| Type errors | Add missing types, fix imports | High |
| Lint errors | Auto-format, fix simple rules | High |
| Missing imports | Add import statements | High |
| Undefined variables | Check scope, suggest fixes | Medium |
| Test assertion failures | Analyze expected vs actual | Medium |
| Build config issues | Check tsconfig, package.json | Medium |
| Logic errors | Analyze test expectations | Low |

## Non-Auto-Fixable (Escalate)

| Error Type | Reason | User Action |
|------------|--------|-------------|
| Architectural flaws | Requires design decision | Consult architect |
| Requirements unclear | Cannot infer intent | Clarify requirements |
| External API changes | Need coordination | Update integration |
| Security vulnerabilities | Risk assessment needed | Review and approve |

## Configuration

```yaml
auto_fix_loop:
  max_iterations: 3

  auto_fix_enabled:
    type_errors: true
    lint_errors: true
    import_errors: true
    simple_test_failures: true

  require_approval:
    logic_changes: true
    api_changes: true
    security_related: true

  escalate_after:
    same_error_count: 2
    total_iterations: 3
    time_elapsed_minutes: 10
```

## Loop State Tracking

```yaml
loop_state:
  iteration: 1
  max_iterations: 3
  errors_fixed: []
  errors_remaining: []
  changes_made:
    - file: "src/auth.ts"
      change: "Added missing import"
  verification_results:
    - iteration: 1
      tests_passed: 8
      tests_failed: 2
```

## Escalation Report Format

When escalating to user:

```
╔══════════════════════════════════════════════════╗
║         Auto-Fix Loop Escalation                  ║
╠══════════════════════════════════════════════════╣
║ Status: Unable to auto-fix after 3 attempts      ║
╠══════════════════════════════════════════════════╣
║ Original Issue                                   ║
║ ├─ Test: auth.test.ts:45                        ║
║ ├─ Error: Expected 401, got 500                 ║
║ └─ Root cause: Unhandled exception in handler   ║
╠══════════════════════════════════════════════════╣
║ Attempted Fixes                                  ║
║ ├─ [1] Added try-catch block - partial fix      ║
║ ├─ [2] Fixed error response - wrong status      ║
║ └─ [3] Adjusted validation - still failing      ║
╠══════════════════════════════════════════════════╣
║ Diagnosis                                        ║
║ The error handling logic requires architectural  ║
║ decision about error response format.            ║
╠══════════════════════════════════════════════════╣
║ Your Options                                     ║
║ [1] Provide guidance and continue               ║
║ [2] Fix manually and resume                     ║
║ [3] Accept current state (2 tests failing)      ║
║ [4] Abort task                                  ║
╚══════════════════════════════════════════════════╝
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/auto-fix-coordinator.js` | Main loop coordinator |
| `scripts/fix-applicator.js` | Apply suggested fixes |
| `scripts/loop-state-tracker.js` | Track iteration state |

## Important Rules

- **Never exceed max iterations** (prevent infinite loops)
- **Track all changes** for potential rollback
- **Verify after each fix** (don't batch fixes)
- **Clear escalation path** when auto-fix fails
- **Preserve original error context** for diagnosis
