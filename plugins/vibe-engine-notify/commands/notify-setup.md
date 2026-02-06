---
name: notify-setup
description: Configure Telegram notifications for Vibe Engine
---

# Telegram Notification Setup

Help the user configure Telegram notifications for Vibe Engine task completion.

## Setup Steps

### Step 1: Check Current Configuration

First, check if Telegram is already configured:

```bash
echo "TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:+configured}"
echo "TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID:+configured}"
```

### Step 2: If Not Configured, Guide the User

If not configured, provide these instructions:

**1. Create a Telegram Bot:**
- Open Telegram and search for `@BotFather`
- Send `/newbot` and follow the prompts
- Copy the Bot Token (looks like `123456:ABC-DEF...`)

**2. Get Your Chat ID:**
- Start a chat with your new bot (send any message)
- Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
- Find your `chat.id` in the response

**3. Set Environment Variables:**

For the current session:
```bash
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
export TELEGRAM_CHAT_ID="your_chat_id_here"
```

For permanent setup, add to `~/.zshrc` or `~/.bashrc`:
```bash
echo 'export TELEGRAM_BOT_TOKEN="your_bot_token_here"' >> ~/.zshrc
echo 'export TELEGRAM_CHAT_ID="your_chat_id_here"' >> ~/.zshrc
```

### Step 3: Test the Configuration

After setting up, test by sending a message:

```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${TELEGRAM_CHAT_ID}\", \"text\": \"Vibe Engine Notify configured successfully!\"}"
```

### Step 4: Verify

If the test message was received, the setup is complete!

The plugin will now automatically send notifications when:
- A routing task completes successfully
- A routing task fails after max retries

## Troubleshooting

- **No notification received**: Check that both environment variables are set
- **401 Unauthorized**: Bot token is invalid
- **400 Bad Request**: Chat ID is invalid - make sure you've sent a message to the bot first
