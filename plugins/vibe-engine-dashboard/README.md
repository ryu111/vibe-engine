# vibe-engine-dashboard

Vibe Engine Dashboard plugin - 實現 Ch7 TUI 可觀測性面板。

## 功能

### TUI Dashboard
- Agent 狀態監控（Completed/Working/Waiting/Pending）
- 資源使用儀表板（Token、Cost、Time）
- 最近活動日誌
- 系統健康狀態

### 指標收集
- 工具執行時間追蹤
- 成功/失敗統計
- Session 摘要報告

## 組件

| 類別 | 數量 |
|------|------|
| Agents | 1 |
| Commands | 2 |
| Skills | 1 |
| Hooks | 1 |

## Commands

- `/dashboard` - 顯示即時系統狀態面板
- `/metrics` - 顯示 session 指標摘要

## 依賴

- vibe-engine-core（基礎設施）
- vibe-engine-memory（任務狀態）

## 對應章節

- Ch7 可觀測性

## 版本

- 當前：0.6.4
