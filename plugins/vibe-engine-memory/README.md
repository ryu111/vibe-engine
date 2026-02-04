# vibe-engine-memory

Vibe Engine 記憶模組 - 實現 Ch5 記憶系統。

## 功能

### 三層記憶架構
- **短期記憶**: In-memory circular buffer（50 messages / 20,000 tokens）
- **長期記憶**: JSONL 儲存（semantic/episodic/procedural）
- **歸檔記憶**: 壓縮 JSONL（很少存取的歷史）

### Confidence Scoring
- 分級系統（0.3-1.0）
- 自動衰減機制
- 應用閾值控制

### Instinct Learning
- 觀察收集（PostToolUse hook）
- 模式檢測（Haiku agent）
- /evolve 演化成 Skills

## 組件

| 類別 | 數量 |
|------|------|
| Agents | 2 |
| Skills | 3 |
| Commands | 5 |
| Hooks | 3 |

## Commands

- `/remember [content]` - 儲存記憶
- `/recall [query]` - 檢索記憶
- `/checkpoint [create/verify/list/clear]` - 狀態快照
- `/evolve` - Instinct 演化
- `/instinct-status` - 查看 Instincts

## 依賴

- vibe-engine-core（協調）
- vibe-engine-guarantee（錯誤恢復）

## 對應章節

- Ch5 記憶系統
- Ch3 狀態管理（Checkpoint）

## 版本

- 當前：0.5.3（骨架）
- 目標：0.6.0（功能完整）
