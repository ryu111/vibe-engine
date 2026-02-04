---
name: remember
description: 儲存記憶到長期記憶系統
arguments:
  - name: content
    description: 要記住的內容（可選，若未提供則進入互動模式）
    required: false
---

# /remember

## 概述

儲存資訊到長期記憶系統。

## 使用方式

```bash
/remember "此專案使用 TypeScript + React"
/remember  # 進入互動模式
```

## 參數

| 參數 | 必要 | 描述 |
|------|------|------|
| content | 否 | 要記住的內容 |

## 執行步驟

1. 解析內容
2. 自動分類（semantic/episodic/procedural）
3. 檢查重複
4. 分配信心分數
5. 儲存到 `.vibe-engine/memory/`

## 輸出範例

```
╔══════════════════════════════════════════════════╗
║           Memory Stored                          ║
╠══════════════════════════════════════════════════╣
║ Type: semantic                                   ║
║ Content: 此專案使用 TypeScript + React            ║
║ Confidence: 0.9 (explicit user statement)        ║
║ ID: mem-abc123                                   ║
╚══════════════════════════════════════════════════╝
```

## 相關命令

- `/recall` - 檢索記憶
- `/instinct-status` - 查看 Instincts

<!-- TODO: 實作完整 /remember 邏輯 -->
