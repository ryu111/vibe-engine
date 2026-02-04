---
name: health-check
description: ⛔ MANDATORY before creating PR OR when health_score drops below 70. MUST run health check and report metrics. CRITICAL - health score < 60 禁止提交 PR。
version: 0.1.0
---

# Health Check

## Purpose

Measure and report code health metrics to identify potential quality issues before they become problems.

## ⛔ MANDATORY: 觸發條件

以下情況 **MUST** 使用此 skill：
- 準備提交 PR 前
- 大型重構後
- 用戶說「檢查健康度」、「代碼品質」
- 定期維護檢查

⛔ BLOCK: Health score < 60 禁止提交 PR（需要先修復 critical issues）

## ⛔ MANDATORY: 健康檢查 Checkpoint

執行健康檢查後 **MUST** 輸出：
```
[CHECKPOINT] Health Check Complete
├─ Overall Score：X/100 (Grade: A-F)
├─ Complexity：🟢|🟡|🔴 (avg: X)
├─ Duplication：🟢|🟡|🔴 (X%)
├─ Critical Issues：N
└─ 狀態：HEALTHY | WARNING | CRITICAL
```

⛔ BLOCK: 未輸出 health check checkpoint 禁止標記檢查完成
⛔ BLOCK: 狀態為 CRITICAL 禁止提交 PR

## Core Metrics

### 1. Cyclomatic Complexity

| Score | Status | Meaning |
|-------|--------|---------|
| < 10 | 🟢 Healthy | Easy to test and maintain |
| 10-15 | 🟡 Warning | Consider refactoring |
| > 15 | 🔴 Critical | Must refactor |

### 2. Cognitive Complexity

| Score | Status | Meaning |
|-------|--------|---------|
| < 15 | 🟢 Healthy | Easy to understand |
| 15-25 | 🟡 Warning | Getting hard to follow |
| > 25 | 🔴 Critical | Too complex |

### 3. Code Duplication

| Percentage | Status | Meaning |
|------------|--------|---------|
| < 5% | 🟢 Healthy | Minimal duplication |
| 5-10% | 🟡 Warning | Some refactoring needed |
| > 10% | 🔴 Critical | Extract common code |

### 4. File Length

| Lines | Status | Meaning |
|-------|--------|---------|
| < 300 | 🟢 Healthy | Focused responsibility |
| 300-500 | 🟡 Warning | Consider splitting |
| > 500 | 🔴 Critical | Must split |

## Health Score Calculation

```
health_score = 100 - (
  complexity_penalty * 0.30 +
  duplication_penalty * 0.25 +
  coupling_penalty * 0.25 +
  staleness_penalty * 0.20
)
```

**Score Interpretation:**

| Score | Grade | Action |
|-------|-------|--------|
| 90-100 | A | Excellent, maintain |
| 80-89 | B | Good, minor improvements |
| 70-79 | C | Acceptable, plan refactoring |
| 60-69 | D | Poor, refactor soon |
| < 60 | F | Critical, immediate action |

## Quick Check Commands

```bash
# Run full health check
node "${CLAUDE_PLUGIN_ROOT}/skills/health-check/scripts/health-check.js"

# Check specific file
node "${CLAUDE_PLUGIN_ROOT}/skills/health-check/scripts/health-check.js" src/auth.ts

# Check specific metric
node "${CLAUDE_PLUGIN_ROOT}/skills/health-check/scripts/health-check.js" --metric complexity
```

## Output Format

```
╔══════════════════════════════════════════════════╗
║           Code Health Report                      ║
╠══════════════════════════════════════════════════╣
║ Overall Score: 78/100 (Grade: C)                 ║
╠══════════════════════════════════════════════════╣
║ Metrics                                          ║
║ ├─ 🟢 Complexity:   8.2 avg (< 10)              ║
║ ├─ 🟡 Duplication:  6.3% (5-10%)                ║
║ ├─ 🟢 Coupling:     Low                          ║
║ └─ 🟢 Staleness:    Normal                       ║
╠══════════════════════════════════════════════════╣
║ Issues Found                                     ║
║ ├─ src/auth/validateToken.ts (complexity: 15)   ║
║ ├─ src/utils/format.ts:42-58 (duplicate block)  ║
║ └─ src/api/handlers.ts (512 lines)              ║
╠══════════════════════════════════════════════════╣
║ Recommendations                                  ║
║ ├─ Extract validation logic from validateToken  ║
║ ├─ Create shared formatter utility              ║
║ └─ Split handlers.ts by resource type           ║
╚══════════════════════════════════════════════════╝
```

## Integration with Workflow

### Pre-commit Check

```yaml
trigger: before_commit
check:
  - complexity_score < 15
  - no_new_duplication
  - file_length < 500
action_on_fail: warn_and_suggest
```

### Pre-PR Check

```yaml
trigger: before_pr
check:
  - overall_health >= 70
  - no_critical_issues
action_on_fail: block_with_report
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/health-check.js` | Run full health analysis |
| `scripts/complexity-analyzer.js` | Analyze cyclomatic complexity |
| `scripts/duplication-detector.js` | Find duplicate code blocks |

## Important Rules

- **Health check is advisory, not blocking** (unless in pre-PR mode)
- **Focus on trends, not absolute numbers**
- **Prioritize critical issues first**
- **Don't chase 100/100 - diminishing returns**
