# Vibe Engine Plugins

此目錄包含 Vibe Engine 的所有 Claude Code Plugins。

## Plugin 清單

| Plugin | 優先級 | 狀態 | 說明 |
|--------|--------|------|------|
| [vibe-engine-core](vibe-engine-core/) | P0 | 🔲 建構中 | 核心協調引擎 |
| vibe-engine-guarantee | P1 | ⬜ 待建 | 驗證擴展 |
| vibe-engine-memory | P1 | ⬜ 待建 | 記憶系統擴展 |
| vibe-engine-learning | P2 | ⬜ 待建 | 持續學習擴展 |

## 依賴關係

```
vibe-engine-core (必需)
        ↑
        ├── vibe-engine-guarantee (依賴 core)
        ├── vibe-engine-memory (依賴 core)
        └── vibe-engine-learning (依賴 core + memory)
```

## 安裝方式

### 本地開發

```bash
# 在其他專案中載入
claude --plugin-dir /path/to/vibe-engine/plugins/vibe-engine-core
```

### 全域安裝

```bash
# 複製到 Claude plugins 目錄
cp -r vibe-engine-core ~/.claude/plugins/
```

## 開發指南

- 每個 plugin 必須有 `.claude-plugin/plugin.json` 和 `marketplace.json`
- 所有 hook 腳本使用 Node.js（跨平台）
- 所有路徑使用 `${CLAUDE_PLUGIN_ROOT}`
