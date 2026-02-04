---
name: memory-manager
version: 0.1.0
description: ⛔ MANDATORY for memory read/write operations. Provides CRUD operations for three-layer memory architecture (short-term, long-term, archival). MUST use this skill when storing or retrieving memories.
triggers:
  - "store memory"
  - "retrieve memory"
  - "recall"
  - "remember"
---

# Memory Manager Skill

## 概述

管理三層記憶架構的讀寫操作。

## 觸發條件

⛔ MANDATORY when:
- 需要儲存新記憶
- 需要檢索相關記憶
- 需要更新記憶信心分數
- 需要記憶去重

## 記憶格式

```typescript
interface MemoryItem {
  id: string;
  type: 'semantic' | 'episodic' | 'procedural';
  content: string;
  metadata: {
    created_at: string;
    updated_at: string;
    access_count: number;
    confidence: number;
    source: 'user' | 'agent' | 'system';
    tags: string[];
  };
}
```

## 操作

### 儲存記憶
```
Store: {type} memory with confidence {score}
Content: {content}
```

### 檢索記憶
```
Retrieve: memories related to "{query}"
Threshold: {confidence_threshold}
```

## Checkpoint 輸出

```
[CHECKPOINT] Memory Operation
├─ Operation: store|retrieve|update|delete
├─ Type: semantic|episodic|procedural
├─ Items: N
└─ Status: success|failure
```

<!-- TODO: 實作完整記憶管理邏輯 -->
