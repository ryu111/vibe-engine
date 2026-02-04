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

## 執行邏輯

當用戶執行 `/evolve` 時：

### 步驟 1: 解析參數
```javascript
const domain = args.domain || null;
const dryRun = args['dry-run'] === true;
const threshold = parseInt(args.threshold) || 3;
```

### 步驟 2: 查找聚類
```javascript
const { InstinctManager } = require('./hooks/scripts/lib/instinct-manager');
const manager = new InstinctManager();

const clusters = manager.findClusters(threshold, { domain });
```

### 步驟 3: 分析演化方向
```javascript
const EVOLUTION_RULES = {
  workflow: {
    targetType: 'command',
    minInstincts: 3,
    description: '可重複的工作流程'
  },
  'code-style': {
    targetType: 'rule',
    minInstincts: 2,
    description: '代碼風格偏好'
  },
  testing: {
    targetType: 'skill',
    minInstincts: 3,
    description: '測試最佳實踐'
  },
  'error-handling': {
    targetType: 'skill',
    minInstincts: 3,
    description: '錯誤處理模式'
  }
};

function determineEvolutionTarget(cluster) {
  const rule = EVOLUTION_RULES[cluster.domain];
  if (rule && cluster.count >= rule.minInstincts) {
    return rule.targetType;
  }

  // 預設邏輯
  if (cluster.count >= 5) return 'skill';
  if (cluster.avgConfidence >= 0.8) return 'rule';
  return 'command';
}
```

### 步驟 4: 預覽或執行
```javascript
if (dryRun) {
  // 只顯示預覽
  for (const cluster of clusters) {
    const target = determineEvolutionTarget(cluster);
    console.log(`Cluster: ${cluster.domain} (${cluster.count} instincts)`);
    console.log(`→ Would evolve to: ${target}`);
  }
  return;
}

// 實際執行演化
for (const cluster of clusters) {
  const result = manager.evolve(cluster);
  console.log(`✅ Created ${result.type}: ${result.name}`);
}
```

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

## 演化產物格式

### Command 產物
```yaml
# .vibe-engine/evolved/commands/{name}.md
---
name: pre-commit-checks
description: 自動化提交前檢查
evolved_from:
  - instinct-1
  - instinct-2
  - instinct-3
evolved_at: 2026-02-01T10:00:00Z
---

執行步驟：
1. 運行 lint
2. 運行 tests
3. 檢查 coverage
```

### Rule 產物
```yaml
# .vibe-engine/evolved/rules/{name}.yaml
name: code-style-preferences
confidence: 0.85
rules:
  - prefer functional over class
  - use const over let
  - avoid any type
evolved_from: [instinct-1, instinct-2]
```

### Skill 產物
```markdown
# .vibe-engine/evolved/skills/{name}/SKILL.md
---
name: test-best-practices
description: 測試最佳實踐集合
evolved_from: [instinct-1, ...]
---

## 核心原則
- 測試前先 build
- Mock 外部 API
- ...
```

## 無可演化聚類時

```
╔══════════════════════════════════════════════════╗
║           Instinct Evolution                     ║
╠══════════════════════════════════════════════════╣
║ Analyzed: 8 instincts                            ║
║ Clusters found: 0                                ║
╠══════════════════════════════════════════════════╣
║ 💡 No clusters meet the threshold (3+ instincts) ║
║                                                  ║
║    Try:                                          ║
║    - /evolve --threshold 2                       ║
║    - Continue working to accumulate patterns     ║
╚══════════════════════════════════════════════════╝
```

## 相關命令

- `/instinct-status` - 查看 Instincts
- `/remember` - 儲存記憶

## 對應 Lib

- `hooks/scripts/lib/instinct-manager.js` - InstinctManager.findClusters()
- `hooks/scripts/lib/instinct-manager.js` - InstinctManager.evolve()
