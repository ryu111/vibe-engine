# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

Vibe Engine 是一個 **Claude Code Plugin**，目標是實現全自動化 AI 開發工作流（Vibe Engineering）。目前處於**規劃/研究階段**，尚無實際代碼實作。

**核心理念**：把 AI 當作工程流程的一級成員，像管理團隊一樣管理 AI agents。

## 架構原則

### Star Topology（星狀拓撲）
```
SubAgent ←→ Main Agent ←→ SubAgent
              ↑
            User
```
- Main Agent 是唯一協調中心
- SubAgents 之間**禁止直接通訊**
- 所有任務分配必須經過 Main Agent

### Router, Not Executor
- Main Agent 只做路由和彙整，不直接執行任務
- 例外：純問答、單檔案讀取、澄清問題、狀態查詢

### 四大核心模組

| 模組 | 職責 |
|------|------|
| **Plugin** | 模組容器，打包發布單位 |
| **Agent** | 專門化的執行者（Architect、Developer、Tester、Reviewer 等） |
| **Hook** | 事件攔截（PreToolUse、PostToolUse、Stop、SessionStart） |
| **Skill** | 可複用的原子能力 |

## 文檔結構

```
docs/
├── SPEC.md                    # 規格書（核心設計）
├── research/                  # 19 章深度研究
│   ├── index.md              # 章節總覽
│   ├── 01-orchestration.md   # 協調引擎（核心）
│   ├── 02-verification.md    # 閉環驗證
│   ├── 05-memory.md          # 記憶系統（含 Instinct Learning）
│   ├── 12-plugin-architecture.md  # Plugin 架構對應
│   ├── 17-advanced-patterns.md    # 進階模式
│   └── ...
├── templates/                 # 組件模板
│   ├── agent-template.md     # Agent 格式（簡化版 A / 完整版 B）
│   ├── skill-template.md     # Skill 格式（含子組件）
│   ├── command-template.md   # Command 格式
│   └── hook-config-template.json  # Hook 配置
└── protocols/
    └── interop-v1.yaml       # Plugin 互通協議
```

## 運行時目錄

實作後，所有 plugins 共享 `.vibe-engine/` 目錄：

```
.vibe-engine/
├── config.yaml      # 全局配置
├── tasks/           # 任務狀態
├── checkpoints/     # 狀態快照
├── memory/          # 長期記憶
├── logs/            # 操作日誌
├── specs/           # 規格檔案
└── instincts/       # 學習到的 Instincts
```

## 開發時的關鍵參考

| 需求 | 參考文檔 |
|------|----------|
| 理解整體設計 | [SPEC.md](docs/SPEC.md) |
| 創建 Agent | [agent-template.md](docs/templates/agent-template.md)（注意 Tools 最小權限） |
| 創建 Skill | [skill-template.md](docs/templates/skill-template.md)（含 agents/hooks 子組件） |
| 創建 Hook | [hook-config-template.json](docs/templates/hook-config-template.json)（用 Node.js 確保跨平台） |
| 理解記憶系統 | [05-memory.md](docs/research/05-memory.md)（含 Confidence Scoring、Instinct Learning） |
| 理解驗證流程 | [02-verification.md](docs/research/02-verification.md) |

## 設計規範

### Agent Tools 最小權限
| 角色 | 允許的 Tools |
|------|--------------|
| Architect/Reviewer | `["Read", "Grep", "Glob"]`（唯讀） |
| Developer/Tester | `["Read", "Write", "Edit", "Grep", "Glob", "Bash"]` |

### Hook 腳本語言
- 所有 command hooks 使用 **Node.js**（跨平台）
- 使用 `${CLAUDE_PLUGIN_ROOT}` 確保路徑可移植

### 驗證優先級
- P0（必須通過）: NO_SYNTAX_ERRORS, CODE_COMPILES
- P1（應該通過）: TESTS_PASS, LINT_PASS
- P2（最好通過）: CODE_COVERAGE > 80%

## 自主等級

| 等級 | 行為 |
|------|------|
| L2（預設） | 低風險自動，中風險確認，高風險阻止 |
| L3 | 大部分自動，關鍵點確認 |
| L4 | 幾乎全自動，僅不可逆確認 |

## 外部最佳實踐來源

本專案整合了 [everything-claude-code](https://github.com/affaan-m/everything-claude-code) 的最佳實踐，詳見：
- [16-external-best-practices.md](docs/research/16-external-best-practices.md)（採納追蹤）
- [17-advanced-patterns.md](docs/research/17-advanced-patterns.md)（Iterative Retrieval、Verification Loop）
- [18-comprehensive-patterns.md](docs/research/18-comprehensive-patterns.md)（MCP、Hooks、語言 Skills）
- [19-commands-contexts-guide.md](docs/research/19-commands-contexts-guide.md)（Commands、Contexts）
