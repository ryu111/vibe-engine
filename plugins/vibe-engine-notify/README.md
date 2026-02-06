# vibe-engine-notify

Telegram notification plugin for Vibe Engine. Sends notifications when routing tasks complete or fail.

## Features

- Automatic notifications when tasks complete
- Failure alerts with retry information
- Progress summary with task breakdown
- Non-blocking (notification failures don't affect main workflow)

## Installation

This plugin is included in the Vibe Engine plugin collection. No additional installation required.

## Configuration

### Environment Variables (Recommended)

```bash
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
export TELEGRAM_CHAT_ID="your_chat_id_here"
```

### Setup Guide

Use the `/notify-setup` command for a guided setup process.

## How It Works

1. When a routing task completes in `vibe-engine-core`, it writes state to `.vibe-engine/routing-state.json`
2. This plugin's Stop hook reads that state
3. If the task is completed or failed, it sends a Telegram notification
4. Duplicate notifications are prevented by tracking notified plan IDs

## Notification Examples

### Success
```
✅ Vibe Engine 任務完成

📋 Plan: route-xxx
📁 專案: my-project
📊 進度: 4/4 (100%)

任務摘要:
  ✓ [architect] 設計系統架構
  ✓ [developer] 實作核心功能
  ✓ [tester] 撰寫測試
  ✓ [reviewer] 代碼審查

⏱ 耗時: 5m 23s
```

### Failure
```
❌ Vibe Engine 任務失敗

📋 Plan: route-xxx
📊 進度: 2/4
🔁 重試: 3/3 (已達上限)

未完成:
  ✗ [tester] 測試失敗
  ○ [reviewer] 等待中

⚠️ 需要人工介入
```

## Dependencies

- `vibe-engine-core` - Provides routing state
