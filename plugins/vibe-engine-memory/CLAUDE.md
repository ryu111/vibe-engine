# vibe-engine-memory 規則

## 記憶類型

| 類型 | 用途 | 範例 |
|------|------|------|
| semantic | 事實知識 | "此專案使用 TypeScript + React" |
| episodic | 過往經驗 | "上次修改 auth.ts 遇到 circular import" |
| procedural | 操作程序 | "測試前先執行 npm run build" |

## Confidence Scoring

| 等級 | 分數 | 行為 |
|------|------|------|
| tentative | 0.3-0.4 | 建議但不強制 |
| moderate | 0.5-0.6 | 相關時應用 |
| strong | 0.7-0.8 | 自動應用 |
| near_certain | 0.9-1.0 | 視為規則 |

**閾值**：
- `inject_threshold: 0.5` - 低於不注入
- `auto_apply_threshold: 0.7` - 高於自動應用

## Instinct 規則

1. Instinct 是原子學習單位（單一 trigger + 單一 action）
2. 需要 3+ 個相關 instincts 才能 /evolve
3. 演化產物存放在 `.vibe-engine/evolved/`

## 運行時目錄

```
.vibe-engine/
├── memory/
│   ├── semantic.jsonl
│   ├── episodic.jsonl
│   └── procedural.jsonl
├── instincts/
│   └── {id}.md
└── observations.jsonl
```
