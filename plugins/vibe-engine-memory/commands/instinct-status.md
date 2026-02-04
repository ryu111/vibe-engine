---
name: instinct-status
description: 顯示已學習的 Instincts 狀態
arguments:
  - name: domain
    description: 限定顯示的領域（可選）
    required: false
---

# /instinct-status

## 概述

顯示已學習的 Instincts，按 domain 分組，顯示信心分數和證據數量。

## 使用方式

```bash
/instinct-status               # 顯示所有
/instinct-status --domain testing  # 只顯示 testing
```

## 參數

| 參數 | 必要 | 描述 |
|------|------|------|
| --domain | 否 | 限定領域 |

## 執行邏輯

當用戶執行 `/instinct-status` 時：

### 步驟 1: 載入 Instincts
```javascript
const { InstinctManager } = require('./hooks/scripts/lib/instinct-manager');
const manager = new InstinctManager();

const domain = args.domain || null;
const instincts = manager.list({ domain });
```

### 步驟 2: 按 Domain 分組
```javascript
const byDomain = {};
for (const inst of instincts) {
  const d = inst.domain || 'general';
  if (!byDomain[d]) byDomain[d] = [];
  byDomain[d].push(inst);
}
```

### 步驟 3: 格式化輸出
```javascript
const { getConfidenceIcon } = require('./hooks/scripts/lib/confidence');

for (const [domain, items] of Object.entries(byDomain)) {
  console.log(`📁 ${domain} (${items.length})`);

  // 按信心分數排序
  items.sort((a, b) => b.confidence - a.confidence);

  for (const inst of items.slice(0, 5)) {
    const icon = getConfidenceIcon(inst.confidence);
    const evidence = inst.evidence_count || 0;
    console.log(`├─ ${inst.id} ${icon} ${inst.confidence.toFixed(1)} (${evidence} evidence)`);
  }

  if (items.length > 5) {
    console.log(`└─ ... (${items.length - 5} more)`);
  }
}
```

### 步驟 4: 顯示演化就緒的聚類
```javascript
const readyForEvolve = manager.getReadyForEvolve();

if (readyForEvolve.length > 0) {
  console.log(`\n💡 ${readyForEvolve.length} clusters ready for /evolve`);
}
```

## 輸出範例

```
╔══════════════════════════════════════════════════╗
║           Instinct Status                        ║
╠══════════════════════════════════════════════════╣
║ Total: 15 instincts across 4 domains             ║
╠══════════════════════════════════════════════════╣
║ 📁 code-style (4)                                ║
║ ├─ prefer-functional-style    ⭐ 0.8 (5 evidence)║
║ ├─ use-const-over-let         ⭐ 0.7 (3 evidence)║
║ ├─ avoid-any-type             ⭐ 0.6 (2 evidence)║
║ └─ single-quotes              ⭐ 0.5 (2 evidence)║
║                                                  ║
║ 📁 testing (5)                                   ║
║ ├─ test-before-commit         ⭐ 0.9 (8 evidence)║
║ ├─ mock-external-apis         ⭐ 0.7 (4 evidence)║
║ └─ ... (3 more)                                  ║
║                                                  ║
║ 📁 workflow (3)                                  ║
║ └─ ...                                           ║
║                                                  ║
║ 📁 error-handling (3)                            ║
║ └─ ...                                           ║
╠══════════════════════════════════════════════════╣
║ 💡 3 clusters ready for /evolve                  ║
╚══════════════════════════════════════════════════╝
```

## 信心等級圖示

| 等級 | 分數 | 圖示 |
|------|------|------|
| near_certain | 0.9-1.0 | ⭐⭐ |
| strong | 0.7-0.8 | ⭐ |
| moderate | 0.5-0.6 | ○ |
| tentative | 0.3-0.4 | · |

## 無 Instincts 時的輸出

```
╔══════════════════════════════════════════════════╗
║           Instinct Status                        ║
╠══════════════════════════════════════════════════╣
║ Total: 0 instincts                               ║
╠══════════════════════════════════════════════════╣
║ 💡 Instincts are learned from repeated patterns  ║
║    during your coding sessions.                  ║
║                                                  ║
║    Keep working and Claude will learn your       ║
║    preferences automatically!                    ║
╚══════════════════════════════════════════════════╝
```

## 相關命令

- `/evolve` - 演化 Instincts
- `/remember` - 儲存記憶
- `/recall` - 檢索記憶

## 對應 Lib

- `hooks/scripts/lib/instinct-manager.js` - InstinctManager.list()
- `hooks/scripts/lib/instinct-manager.js` - InstinctManager.getReadyForEvolve()
- `hooks/scripts/lib/confidence.js` - getConfidenceIcon()
