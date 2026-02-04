---
name: recall
description: 從記憶系統檢索相關資訊
arguments:
  - name: query
    description: 搜尋關鍵字或問題
    required: true
---

# /recall

## 概述

從長期記憶系統檢索相關資訊。

## 使用方式

```bash
/recall "TypeScript 配置"
/recall "上次遇到的錯誤"
```

## 參數

| 參數 | 必要 | 描述 |
|------|------|------|
| query | 是 | 搜尋關鍵字或問題 |

## 執行步驟

1. 解析查詢意圖
2. 搜尋三類記憶（semantic/episodic/procedural）
3. 計算相關性分數
4. 過濾低信心記憶（< 0.5）
5. 返回排序後的結果

## 輸出範例

```
╔══════════════════════════════════════════════════╗
║           Memory Recall                          ║
╠══════════════════════════════════════════════════╣
║ Query: "TypeScript 配置"                         ║
║ Found: 3 memories                                ║
╠══════════════════════════════════════════════════╣
║ 1. [semantic] 此專案使用 TypeScript + React       ║
║    Confidence: 0.9 | Relevance: 0.95             ║
║                                                  ║
║ 2. [procedural] tsconfig.json 在專案根目錄        ║
║    Confidence: 0.7 | Relevance: 0.82             ║
║                                                  ║
║ 3. [episodic] 上次改 strict mode 導致錯誤         ║
║    Confidence: 0.6 | Relevance: 0.71             ║
╚══════════════════════════════════════════════════╝
```

## 相關命令

- `/remember` - 儲存記憶

<!-- TODO: 實作完整 /recall 邏輯 -->
