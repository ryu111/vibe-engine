# vibe-engine-notify

Telegram notification plugin for Vibe Engine task completion.

## Plugin Overview

This plugin sends Telegram notifications when routing tasks complete or fail. It works by reading the routing state from `vibe-engine-core` and sending formatted messages.

## Configuration

Requires environment variables:
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `TELEGRAM_CHAT_ID` - Your Telegram chat ID

Use `/notify-setup` for guided configuration.

## Architecture

```
vibe-engine-core                    vibe-engine-notify
────────────────                    ──────────────────
routing-completion-validator.js
        │
        ▼
.vibe-engine/routing-state.json
        │
        └──────────────────────────▶ notify-on-complete.js (Stop hook)
                                            │
                                            ▼
                                    Telegram API
                                            │
                                            ▼
                                    📱 User notification
```

## Files

| File | Purpose |
|------|---------|
| `hooks/scripts/notify-on-complete.js` | Stop hook - main entry point |
| `hooks/scripts/lib/telegram.js` | Telegram API wrapper |
| `commands/notify-setup.md` | Configuration guide |
