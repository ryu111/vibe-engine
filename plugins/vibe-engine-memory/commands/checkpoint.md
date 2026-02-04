---
name: checkpoint
description: 管理狀態快照（建立、驗證、列出、清理）
arguments:
  - name: action
    description: 操作類型 (create/verify/list/clear)
    required: true
  - name: name
    description: 快照名稱（create/verify 時需要）
    required: false
---

# /checkpoint

## 概述

管理狀態快照，支援建立、驗證、列出和清理操作。

## 使用方式

```bash
/checkpoint create feature-start
/checkpoint verify feature-start
/checkpoint list
/checkpoint clear
```

## 參數

| 參數 | 必要 | 描述 |
|------|------|------|
| action | 是 | create/verify/list/clear |
| name | 否 | 快照名稱 |

## 操作說明

### create
建立新快照，記錄：
- Git SHA
- 檔案數量
- 測試覆蓋率
- 時間戳

### verify
對比當前狀態與快照：
- 檔案差異
- 測試結果變化
- 覆蓋率變化

### list
列出所有快照

### clear
清理舊快照，保留最近 5 個

## 輸出範例

### create
```
╔══════════════════════════════════════════════════╗
║           Checkpoint Created                     ║
╠══════════════════════════════════════════════════╣
║ Name: feature-start                              ║
║ SHA: abc1234                                     ║
║ Files: 42                                        ║
║ Coverage: 78%                                    ║
║ Time: 2026-02-04T10:30:00Z                       ║
╚══════════════════════════════════════════════════╝
```

### verify
```
╔══════════════════════════════════════════════════╗
║           Checkpoint Verification                ║
╠══════════════════════════════════════════════════╣
║ Comparing: feature-start → current               ║
╠══════════════════════════════════════════════════╣
║ Files: +3 added, -1 removed, ~5 modified         ║
║ Tests: 120 → 125 (+5)                            ║
║ Coverage: 78% → 82% (+4%)                        ║
║ Status: ✅ Improved                              ║
╚══════════════════════════════════════════════════╝
```

## 相關命令

- `/status` - 系統狀態
- `/verify` - 執行驗證

<!-- TODO: 實作完整 /checkpoint 邏輯 -->
