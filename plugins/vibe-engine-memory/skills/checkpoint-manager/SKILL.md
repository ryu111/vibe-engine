---
name: checkpoint-manager
version: 0.1.0
description: ⛔ MANDATORY for state snapshot operations. Manages creation, verification, and cleanup of checkpoints. MUST use when preserving state before risky operations or validating changes.
triggers:
  - "create checkpoint"
  - "verify checkpoint"
  - "restore state"
---

# Checkpoint Manager Skill

## 概述

管理狀態快照的建立、驗證和清理。

## 觸發條件

⛔ MANDATORY when:
- 執行高風險操作前
- 驗證變更是否符合預期
- 需要回滾到之前狀態
- 定期狀態備份

## 操作

### 建立快照
```bash
/checkpoint create [name]
```

記錄：
- Git SHA
- 檔案數量
- 測試覆蓋率
- 時間戳

### 驗證快照
```bash
/checkpoint verify [name]
```

對比：
- 檔案差異
- 測試結果變化
- 覆蓋率變化

### 列出快照
```bash
/checkpoint list
```

### 清理快照
```bash
/checkpoint clear
```

保留最近 5 個快照。

## 存儲格式

```
.vibe-engine/
├── checkpoints/
│   └── {name}/
│       ├── state.json
│       └── files.txt
└── checkpoints.log
```

## Checkpoint 輸出

```
[CHECKPOINT] Checkpoint Created
├─ Name: {name}
├─ SHA: {git_sha}
├─ Files: {count}
└─ Coverage: {percentage}%
```

<!-- TODO: 實作完整 checkpoint 邏輯 -->
