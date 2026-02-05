# vibe-engine-guarantee

Vibe Engine 保障模組 - 錯誤恢復、自動修復循環、健康檢查、熔斷器

## 依賴

**必須先安裝 [vibe-engine-core](../vibe-engine-core)**

```bash
# 先安裝 core
claude /install /Users/sbu/projects/vibe-engine/plugins/vibe-engine-core

# 再安裝 guarantee
claude /install /Users/sbu/projects/vibe-engine/plugins/vibe-engine-guarantee
```

## 功能

### Agents

| Agent | 用途 |
|-------|------|
| debugger | 錯誤診斷與修復建議 |

### Skills

| Skill | 說明 |
|-------|------|
| error-recovery | 錯誤分類與恢復策略 |
| auto-fix-loop | 自動修復迭代（最多 3 次） |
| health-check | 代碼健康度檢查 |

### Hooks

| Hook | 事件 | 功能 |
|------|------|------|
| circuit-breaker | PreToolUse, Stop | 連續失敗熔斷保護 |
| error-handler | SubagentStop | 錯誤偵測與自動修復觸發 |
| health-check | Stop | 代碼健康度檢查 |

## 與 vibe-engine-core 的協作

```
用戶請求
    ↓
[core] task-decomposition → 分解任務
    ↓
[core] agent-router → 分派到 agents
    ↓
[guarantee] circuit-breaker → 檢查是否熔斷
    ↓
執行任務
    ↓
[guarantee] error-handler → 偵測錯誤
    ↓
[guarantee] auto-fix-loop → 嘗試自動修復
    ↓
[core] verification-engine → 驗證結果
```

## 版本

- 當前版本：0.6.5
- 最低 vibe-engine-core 版本：0.6.0
