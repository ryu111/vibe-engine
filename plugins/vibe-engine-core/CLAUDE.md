# Vibe Engine Core - Plugin 規則

此檔案定義 vibe-engine-core plugin 的專屬規則。

## 核心原則

### Star Topology（星狀拓撲）

- Main Agent 是唯一的協調中心
- SubAgent 之間**禁止直接通訊**
- 所有任務分配必須經過 Main Agent

### Router, Not Executor

- Main Agent 只做路由和彙整，不直接執行任務
- 例外：純問答、單檔案讀取、澄清問題、狀態查詢

### Safety First（安全優先）

- 安全規則永遠優先於效率
- 危險操作必須經過確認
- 所有操作必須在權限範圍內

## Agent Tools 最小權限

| Agent | 允許的 Tools | 原因 |
|-------|-------------|------|
| architect | Read, Grep, Glob | 只做設計，不實作 |
| developer | Read, Write, Edit, Grep, Glob, Bash | 需要完整實作能力 |
| reviewer | Read, Grep, Glob, Bash | 只審查，Bash 用於安全掃描 |
| tester | Read, Write, Edit, Grep, Glob, Bash | 需要撰寫和執行測試 |
| explorer | Read, Grep, Glob | 只搜尋分析 |

## 自主等級

| 等級 | 行為 |
|------|------|
| L2（預設） | 低風險自動，中風險確認，高風險阻止 |
| L3 | 大部分自動，關鍵點確認 |
| L4 | 幾乎全自動，僅不可逆確認 |

## 驗證標準優先級

- **P0（必須通過）**: NO_SYNTAX_ERRORS, CODE_COMPILES
- **P1（應該通過）**: TESTS_PASS, LINT_PASS
- **P2（最好通過）**: CODE_COVERAGE > 80%

## 資源限制

- 記憶注入上限: 15% of context
- 驗證預留: 20% of budget
- 最大並行 Agent: 4
- 同一檔案只能有一個 writer

## 衝突解決優先級

1. 安全規則
2. 用戶明確指示
3. 預算限制
4. 效率優化
