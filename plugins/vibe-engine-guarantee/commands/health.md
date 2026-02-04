---
name: health
description: Run code health check and display metrics report
argument-hint: "[path]"
---

# /health Command

Run a comprehensive code health check and display a metrics report.

## Usage

```
/health                  # Check entire project
/health src/            # Check specific directory
/health src/auth.ts     # Check specific file
```

## What This Command Does

1. **Analyze Complexity**
   - Calculate cyclomatic complexity for each function
   - Flag functions with complexity > 10

2. **Detect Duplication**
   - Find duplicate code blocks
   - Report duplication percentage

3. **Check File Sizes**
   - Flag files over 300 lines
   - Suggest splitting large files

4. **Calculate Health Score**
   - Combine all metrics into a 0-100 score
   - Grade: A (90+), B (80-89), C (70-79), D (60-69), F (<60)

## Output

Display a formatted health report with:
- Overall health score and grade
- Individual metric scores
- List of issues found
- Specific recommendations

## Execute

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/health-check/scripts/health-check.js" $ARGUMENTS
```

If the health-check script doesn't exist yet, perform a manual assessment:

1. Use `wc -l` to check file lengths
2. Look for obvious code duplication
3. Check for complex nested logic
4. Report findings in the standard health check format
