---
name: recall
description: 從記憶系統檢索相關資訊
arguments:
  - name: query
    description: 搜尋關鍵字或問題
    required: true
  - name: type
    description: 限定記憶類型 (semantic/episodic/procedural/all)
    required: false
  - name: limit
    description: 最大返回數量
    required: false
---

# /recall

## 概述

從長期記憶系統檢索相關資訊，支援關鍵字搜尋和信心過濾。

## 使用方式

```bash
/recall "TypeScript 配置"
/recall "上次遇到的錯誤" --type episodic
/recall "測試" --limit 5
/recall "auth" --type all
```

## 參數

| 參數 | 必要 | 描述 |
|------|------|------|
| query | 是 | 搜尋關鍵字或問題 |
| --type | 否 | 限定類型（預設搜尋全部） |
| --limit | 否 | 最大返回數量（預設 10） |

## 執行邏輯

當用戶執行 `/recall` 時：

### 步驟 1: 解析查詢
```javascript
const query = args.query;
const types = args.type === 'all' ? ['semantic', 'episodic', 'procedural']
            : args.type ? [args.type]
            : ['semantic', 'episodic', 'procedural'];
const limit = parseInt(args.limit) || 10;
```

### 步驟 2: 執行檢索
```javascript
const { MemoryStore } = require('./hooks/scripts/lib/memory-store');
const store = new MemoryStore();

const results = store.retrieve(query, {
  types,
  minConfidence: 0.5,  // 過濾低信心
  limit
});
```

### 步驟 3: 格式化輸出
```javascript
for (const mem of results) {
  const icon = getTypeIcon(mem.type);
  const stars = getConfidenceIcon(mem.metadata.confidence);
  console.log(`${icon} ${mem.content} ${stars}`);
}
```

## 檢索演算法

### 相關性計算
```javascript
function calculateRelevance(memory, query) {
  const contentLower = memory.content.toLowerCase();
  const queryLower = query.toLowerCase();

  // 1. 完全匹配
  if (contentLower.includes(queryLower)) return 1.0;

  // 2. 詞彙匹配
  const queryWords = queryLower.split(/\s+/);
  const matched = queryWords.filter(w => contentLower.includes(w));
  let score = matched.length / queryWords.length;

  // 3. 標籤匹配加分
  if (memory.metadata.tags?.some(t => t.includes(queryLower))) {
    score = Math.max(score, 0.8);
  }

  return score;
}
```

### 綜合排序
```javascript
// 綜合分數 = 相關性 * 0.6 + 信心 * 0.4
const combinedScore = relevance * 0.6 + confidence * 0.4;
```

## 輸出範例

```
╔══════════════════════════════════════════════════╗
║           Memory Recall                          ║
╠══════════════════════════════════════════════════╣
║ Query: "TypeScript 配置"                         ║
║ Found: 3 memories (filtered 2 low-confidence)    ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║ 📌 [semantic] ⭐⭐ 90%                            ║
║    此專案使用 TypeScript + React                  ║
║    Tags: typescript, react                       ║
║                                                  ║
║ 📋 [procedural] ⭐ 70%                           ║
║    tsconfig.json 在專案根目錄                     ║
║    Tags: config, typescript                      ║
║                                                  ║
║ 💡 [episodic] ○ 60%                             ║
║    上次改 strict mode 導致錯誤                    ║
║    Date: 2026-02-01                              ║
║                                                  ║
╚══════════════════════════════════════════════════╝
```

## 類型圖示

| 類型 | 圖示 | 描述 |
|------|------|------|
| semantic | 📌 | 事實知識 |
| episodic | 💡 | 過往經驗 |
| procedural | 📋 | 操作程序 |

## 信心等級圖示

| 等級 | 分數 | 圖示 |
|------|------|------|
| near_certain | 0.9-1.0 | ⭐⭐ |
| strong | 0.7-0.8 | ⭐ |
| moderate | 0.5-0.6 | ○ |
| tentative | 0.3-0.4 | · |

## 無結果處理

```
╔══════════════════════════════════════════════════╗
║           Memory Recall                          ║
╠══════════════════════════════════════════════════╣
║ Query: "xxx"                                     ║
║ Found: 0 memories                                ║
╠══════════════════════════════════════════════════╣
║ 💡 Tip: Use /remember to store new memories      ║
╚══════════════════════════════════════════════════╝
```

## 相關命令

- `/remember` - 儲存記憶
- `/instinct-status` - 查看 Instincts

## 對應 Lib

- `hooks/scripts/lib/memory-store.js` - MemoryStore.retrieve()
- `hooks/scripts/lib/confidence.js` - getConfidenceIcon()
- `hooks/scripts/lib/memory-item.js` - formatMemoryItem()
