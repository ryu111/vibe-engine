---
name: evolve
description: 將累積的 Instincts 演化成 Skills/Commands/Agents
arguments:
  - name: domain
    description: 限定演化的領域（可選）
    required: false
  - name: dry-run
    description: 預覽模式，不實際生成
    required: false
  - name: threshold
    description: 聚類閾值（預設 3）
    required: false
---

# /evolve

## 概述

分析累積的 Instincts，聚類後演化成更高級的產物（Skills、Commands、Agents、Rules）。

## 使用方式

```bash
/evolve                    # 演化所有 domain
/evolve --domain testing   # 只演化 testing domain
/evolve --dry-run          # 預覽模式
/evolve --threshold 5      # 需要 5+ instincts 才聚類
```

## 參數

| 參數 | 必要 | 描述 |
|------|------|------|
| --domain | 否 | 限定領域 |
| --dry-run | 否 | 預覽不執行 |
| --threshold | 否 | 聚類閾值（預設 3） |

## 演化流程

### 1. Cluster
識別相關 Instincts 群組（閾值：3+）

### 2. Analyze
決定演化方向：
- **Command**: 可重複的工作流
- **Skill**: 領域知識集合
- **Agent**: 複雜多步驟流程
- **Rule**: 必須遵守的約束

### 3. Preview
顯示將要生成的內容

### 4. Execute
生成並保存到 `.vibe-engine/evolved/`

## 輸出範例

```
╔══════════════════════════════════════════════════╗
║           Instinct Evolution                     ║
╠══════════════════════════════════════════════════╣
║ Analyzed: 15 instincts                           ║
║ Clusters found: 3                                ║
╠══════════════════════════════════════════════════╣
║ Cluster 1: testing (5 instincts)                 ║
║ → Evolve to: Skill "test-best-practices"         ║
║                                                  ║
║ Cluster 2: code-style (4 instincts)              ║
║ → Evolve to: Rule "code-style-preferences"       ║
║                                                  ║
║ Cluster 3: workflow (3 instincts)                ║
║ → Evolve to: Command "pre-commit-checks"         ║
╠══════════════════════════════════════════════════╣
║ [Execute] or [Preview] or [Cancel]?              ║
╚══════════════════════════════════════════════════╝
```

## 相關命令

- `/instinct-status` - 查看 Instincts

<!-- TODO: 實作完整 /evolve 邏輯 -->
