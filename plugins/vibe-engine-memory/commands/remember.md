---
name: remember
description: 儲存記憶到長期記憶系統
arguments:
  - name: content
    description: 要記住的內容（可選，若未提供則進入互動模式）
    required: false
  - name: type
    description: 記憶類型 (semantic/episodic/procedural)
    required: false
  - name: tags
    description: 標籤（逗號分隔）
    required: false
---

# /remember

## 概述

儲存資訊到長期記憶系統，支援三種記憶類型和信心分數。

## 使用方式

```bash
/remember "此專案使用 TypeScript + React"
/remember "上次 auth.ts 有循環依賴" --type episodic
/remember "測試前要先 build" --type procedural --tags testing,workflow
/remember  # 進入互動模式
```

## 參數

| 參數 | 必要 | 描述 |
|------|------|------|
| content | 否 | 要記住的內容 |
| --type | 否 | 記憶類型（預設自動分類） |
| --tags | 否 | 標籤，逗號分隔 |

## 記憶類型

| 類型 | 用途 | 範例 |
|------|------|------|
| semantic | 事實知識 | 專案使用的技術、配置 |
| episodic | 過往經驗 | 遇到的問題、解決方案 |
| procedural | 操作程序 | 如何執行特定任務 |

## 執行邏輯

當用戶執行 `/remember` 時：

### 步驟 1: 解析內容
```javascript
// 從參數或互動獲取內容
const content = args.content || await askUser("請輸入要記住的內容:");
```

### 步驟 2: 自動分類（如未指定 type）
```javascript
// 使用關鍵字判斷類型
function classifyMemory(content) {
  const lower = content.toLowerCase();

  // Procedural: 步驟性描述
  if (lower.includes('先') || lower.includes('然後') ||
      lower.includes('before') || lower.includes('after')) {
    return 'procedural';
  }

  // Episodic: 過去經驗
  if (lower.includes('上次') || lower.includes('遇到') ||
      lower.includes('曾經') || lower.includes('yesterday')) {
    return 'episodic';
  }

  // Default: Semantic
  return 'semantic';
}
```

### 步驟 3: 儲存到 MemoryStore
```javascript
const { MemoryStore } = require('./hooks/scripts/lib/memory-store');
const store = new MemoryStore();

const result = store.store(type, content, {
  confidence: 0.9,  // 用戶明確說的 = 高信心
  source: 'user',
  tags: parseTags(args.tags)
});
```

### 步驟 4: 輸出結果
```javascript
if (result.success) {
  if (result.duplicate) {
    return `✅ 更新現有記憶 (ID: ${result.item.id})`;
  }
  return `✅ 記憶已儲存 (ID: ${result.item.id}, Type: ${type})`;
}
```

## 輸出範例

```
╔══════════════════════════════════════════════════╗
║           Memory Stored                          ║
╠══════════════════════════════════════════════════╣
║ Type: semantic                                   ║
║ Content: 此專案使用 TypeScript + React            ║
║ Confidence: 0.9 ⭐⭐ (user statement)             ║
║ ID: mem-ml8d2k4f-x9j2k1                          ║
║ Tags: typescript, react                          ║
╠══════════════════════════════════════════════════╣
║ 💾 Stored in .vibe-engine/memory/semantic.jsonl  ║
╚══════════════════════════════════════════════════╝
```

## 信心分數規則

| 來源 | 初始信心 |
|------|---------|
| 用戶明確說的 | 0.9 |
| 從代碼推斷 | 0.6 |
| 單次觀察 | 0.3 |

## 去重邏輯

如果偵測到相似記憶（相似度 >= 80%）：
- 不會創建新記憶
- 更新現有記憶的 access_count
- 可能調整信心分數

## 相關命令

- `/recall` - 檢索記憶
- `/instinct-status` - 查看 Instincts

## 對應 Lib

- `hooks/scripts/lib/memory-store.js` - MemoryStore.store()
- `hooks/scripts/lib/memory-item.js` - createMemoryItem()
- `hooks/scripts/lib/confidence.js` - INITIAL_CONFIDENCE
