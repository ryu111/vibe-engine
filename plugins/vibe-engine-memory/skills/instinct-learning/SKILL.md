---
name: instinct-learning
version: 0.1.0
description: ⛔ MANDATORY for pattern detection and instinct generation. Analyzes observations to identify repeating patterns and generates atomic instincts. MUST be triggered when observation count reaches threshold.
triggers:
  - "detect patterns"
  - "generate instincts"
  - "evolve instincts"
---

# Instinct Learning Skill

## 概述

從觀察中識別模式，生成原子 Instincts，支援演化成高級產物。

## 觸發條件

⛔ MANDATORY when:
- 觀察數量達到閾值（20+）
- 會話結束時
- 用戶執行 /evolve 命令

## Instinct 格式

```yaml
# .vibe-engine/instincts/{id}.md
---
id: {unique-id}
trigger: "when condition"
confidence: 0.3-1.0
domain: "code-style|testing|workflow|..."
evidence_count: N
created_at: "ISO timestamp"
---

# {Title}

## Action
{What to do}

## Evidence
- {date}: {observation}
```

## 流程

### 1. 觀察收集
- PostToolUse hook 收集到 observations.jsonl
- 記錄 tool_name, input, output, user_correction

### 2. 模式檢測
- 分析重複模式
- 識別用戶糾正
- 計算信心分數

### 3. Instinct 生成
- 需要 2+ 相關觀察
- 初始 confidence 基於證據強度

### 4. 演化 (/evolve)
- 聚類相關 instincts（3+）
- 決定演化方向（Command/Skill/Agent/Rule）
- 生成高級產物

## Checkpoint 輸出

```
[CHECKPOINT] Instinct Learning
├─ Observations analyzed: N
├─ Patterns detected: M
├─ Instincts generated: K
└─ Ready for evolve: yes|no
```

<!-- TODO: 實作完整 instinct learning 邏輯 -->
