# Vibe Engine

> 從 Vibe Coding 進化到 Vibe Engineering 的基礎設施

## 願景

**Vibe Engineering** = 把 AI 當作工程流程的一級成員，從隨機的 prompt-answer 轉變為**系統化、可重現、生產級**的 AI 工作流。

Vibe Engine 讓你像管理團隊一樣管理 AI agents，並行處理多個任務，同時保持品質和可追蹤性。

## 核心特點

- **Plugin 形式發布** - 跨電腦快速安裝使用
- **星型代理架構** - Main Agent 作為中央協調者，SubAgents 不能直接通訊
- **層層增強機制** - Plugins 可以互相組合增強
- **全域 + 專案技能** - 全域通用技能 + 專案專屬技能擴充

## 四大核心模組

| 模組 | 職責 | 類比 |
|------|------|------|
| **Plugin** | 模組容器，打包發布單位 | npm package |
| **Agent** | 專門化的執行者 | 專業員工 |
| **Hook** | 事件攔截點，可修改/增強行為 | Middleware |
| **Skill** | 可複用的原子能力 | 函數庫 |

## 參考專案

- [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) - 多代理編排系統
- [OpenClaw](https://github.com/openclaw/openclaw) - 本地優先 AI 助手平台

## 文檔

- [規格書](docs/SPEC.md) - 願景、架構、模組規劃
- [深度研究](docs/research/index.md) - 10 個章節的獨立研究

## 狀態

🚧 規劃階段
