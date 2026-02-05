---
name: handoff
description: 記錄當前任務狀態，供下次 session 接續
arguments:
  - name: task
    description: 當前/下一步任務描述
    required: false
  - name: pending
    description: 待辦事項（逗號分隔）
    required: false
---

# /handoff

## 概述

記錄當前任務狀態到 `.vibe-engine/task-state.yaml`，讓下次 session 可以無縫接續。

## 使用方式

```bash
/handoff "Phase 2 錯誤注入測試"
/handoff --pending "錯誤注入,dashboard plugin"
/handoff  # 互動模式，自動從對話推斷
```

## 參數

| 參數 | 必要 | 描述 |
|------|------|------|
| task | 否 | 當前/下一步任務 |
| --pending | 否 | 待辦事項（逗號分隔） |

## 執行邏輯

當用戶執行 `/handoff` 時：

### 步驟 1: 收集任務資訊
```javascript
// 如果沒有參數，從對話推斷或詢問用戶
const task = args.task || inferFromConversation() || await askUser("下次要繼續什麼？");
const pending = args.pending ? args.pending.split(',').map(s => s.trim()) : [];
```

### 步驟 2: 獲取上下文資訊
```javascript
// 自動收集
const lastCommit = execSync('git rev-parse --short HEAD').trim();
const recentlyModified = getRecentlyModifiedFiles();  // 從觀察推斷
```

### 步驟 3: 保存到 task-state.yaml
```javascript
const { TaskState } = require('./hooks/scripts/lib/task-state');
const taskState = new TaskState();

taskState.save({
  current_task: task,
  pending: pending,
  completed_recently: recentlyModified,
  resume_hint: `繼續: ${task}`,
  last_commit: lastCommit
});
```

### 步驟 4: 輸出確認
```javascript
return `✅ 任務狀態已記錄

下次 session 開始時會顯示：
📋 Session Handoff
當前任務: ${task}
待辦: ${pending.join(', ') || '(無)'}
Last commit: ${lastCommit}`;
```

## 輸出範例

```
╔══════════════════════════════════════════════════╗
║           Handoff Recorded                       ║
╠══════════════════════════════════════════════════╣
║ 當前任務: Phase 2 錯誤注入測試                     ║
║ 待辦:                                            ║
║   - 錯誤注入測試                                  ║
║   - 建立 dashboard plugin                        ║
║ 最近完成:                                        ║
║   - ✅ Phase 3 記憶密集操作                       ║
║ Last commit: 6e9b1e8                             ║
╠══════════════════════════════════════════════════╣
║ 💾 Saved to .vibe-engine/task-state.yaml         ║
╚══════════════════════════════════════════════════╝
```

## 下次 Session 看到的

```
## 📋 Session Handoff

**當前任務**: Phase 2 錯誤注入測試

**待辦**:
- ⏳ 錯誤注入測試
- ⏳ 建立 dashboard plugin

**最近完成**:
- ✅ Phase 3 記憶密集操作

💡 **建議**: 繼續: Phase 2 錯誤注入測試

📌 Last commit: `6e9b1e8`
```

## 自動 vs 手動

| 機制 | 時機 | 精確度 |
|------|------|--------|
| **自動**（Stop hook） | 每次 session 結束 | 中（從觀察推斷） |
| **手動**（/handoff） | 用戶主動執行 | 高（用戶明確指定） |

建議：在重要斷點時使用 `/handoff` 明確記錄。

## 相關命令

- `/remember` - 儲存知識記憶
- `/checkpoint` - 創建狀態快照
- `/status` - 查看系統狀態

## 對應 Lib

- `hooks/scripts/lib/task-state.js` - TaskState 類別
