# 壓力測試情境：全模組極限測試

> 版本: v0.6.0
> 目的: 最大限度觸發 vibe-engine-core、guarantee、memory 三個模組的所有功能

---

## 測試目標

### 觸發矩陣

| 模組 | 組件類型 | 數量 | 目標觸發率 |
|------|----------|------|-----------|
| **vibe-engine-core** | 5 Agents + 10 Hooks + 4 Commands | 19 | 100% |
| **vibe-engine-guarantee** | 1 Agent + 2 Hooks + 3 Skills | 6 | 100% |
| **vibe-engine-memory** | 2 Agents + 3 Hooks + 5 Commands | 10 | 100% |
| **總計** | | **35** | **100%** |

---

## 壓力測試情境：用戶認證系統

### 情境設計

這是一個**故意設計得複雜且包含錯誤**的任務，目的是觸發所有模組功能。

### Phase 1: 複雜需求（觸發 Core 分解引擎）

```
「建立完整的用戶認證系統，包含：

1. 後端 API：
   - POST /api/auth/register - 用戶註冊
   - POST /api/auth/login - 用戶登入
   - POST /api/auth/logout - 用戶登出
   - GET /api/auth/me - 取得當前用戶
   - POST /api/auth/refresh - 更新 token

2. 資料模型：
   - User: id, email, passwordHash, createdAt, updatedAt
   - Session: id, userId, token, expiresAt

3. 安全要求：
   - 密碼使用 bcrypt 加密
   - JWT token 驗證
   - Rate limiting

4. 測試要求：
   - 單元測試覆蓋率 > 80%
   - 整合測試
   - 安全測試

使用 TypeScript + Express + Jest」
```

### 預期觸發

| 組件 | 觸發原因 |
|------|----------|
| `prompt-classifier` | 複雜請求分類 |
| `task-decomposition-engine` | 分解為 10+ 子任務 |
| `agent-router` | 路由到多個 agents |
| `architect` | API 設計、資料模型設計 |
| `developer` | 實作 5 個 API + 2 個模型 |
| `tester` | 撰寫測試案例 |
| `reviewer` | 安全審查 |
| `budget-tracker-engine` | 大量 token 消耗 |
| `observation-collector` | 收集 50+ 操作 |

---

### Phase 2: 故意引入錯誤（觸發 Guarantee）

在 Phase 1 完成後，故意引入以下錯誤：

```typescript
// src/api/auth/register.ts - 故意引入的錯誤

// 錯誤 1: TypeScript 類型錯誤
const userId: number = "not-a-number";  // Type error

// 錯誤 2: 未定義變數
console.log(undefinedVar);  // Reference error

// 錯誤 3: 測試失敗
test('should register user', () => {
  expect(1).toBe(2);  // Will fail
});

// 錯誤 4: 安全問題（故意）
const query = `SELECT * FROM users WHERE email = '${email}'`;  // SQL injection
```

### 預期觸發

| 組件 | 觸發原因 |
|------|----------|
| `error-handler` | 偵測 TypeScript 錯誤 |
| `debugger` | 診斷錯誤根因 |
| `auto-fix-loop` | 迭代修復（最多 3 次） |
| `circuit-breaker` | 連續失敗後開路 |
| `saga-compensation` | 回滾失敗的變更 |

#### 觸發 Circuit Breaker

```
操作序列：
1. 修復 → 編譯失敗 → failures=1
2. 修復 → 測試失敗 → failures=2
3. 修復 → 編譯失敗 → failures=3
4. 修復 → 測試失敗 → failures=4
5. 修復 → 編譯失敗 → failures=5 → OPEN ⛔
```

---

### Phase 3: 記憶密集操作（觸發 Memory）

在開發過程中，執行大量記憶相關操作：

```
# 儲存多筆記憶
/remember "認證系統使用 JWT + bcrypt"
/remember "User 模型包含 email, passwordHash"
/remember "API 使用 Express Router"
/remember "測試使用 Jest + Supertest"
/remember "Rate limiting 使用 express-rate-limit"

# 儲存程序性記憶
/remember procedural "修復 TypeScript 錯誤時先檢查類型定義"
/remember procedural "JWT 過期時間設為 15 分鐘"

# 儲存經驗性記憶
/remember episodic "bcrypt 選擇 saltRounds=10 平衡安全與效能"

# 檢索記憶
/recall "JWT"
/recall "認證"
/recall "bcrypt"

# Checkpoint 操作
/checkpoint create auth-phase1
/checkpoint create auth-phase2-errors
/checkpoint create auth-phase3-fixed
/checkpoint list
/checkpoint verify auth-phase1

# Instinct 操作
/instinct-status
/evolve --dry-run
```

### 預期觸發

| 組件 | 觸發原因 |
|------|----------|
| `memory-init` | 會話開始載入記憶 |
| `observation-collector` | 收集 100+ 操作 |
| `memory-consolidation` | 整合觀察為記憶 |
| `memory-curator` | 整理重複記憶 |
| `pattern-detector` | 偵測開發模式 |
| `/remember` | 10+ 次儲存 |
| `/recall` | 5+ 次檢索 |
| `/checkpoint` | 5+ 次操作 |
| `/evolve` | 分析聚類 |

---

## 完整執行腳本

### 準備

```bash
# 1. 進入測試專案
cd ~/projects/vibe-test

# 2. 清理舊狀態
rm -rf .vibe-engine/ src/ tests/
mkdir -p src/api/auth src/models tests/api tests/models

# 3. 初始化 TypeScript 專案
npm init -y
npm install typescript express bcrypt jsonwebtoken express-rate-limit
npm install -D @types/node @types/express @types/bcrypt @types/jsonwebtoken jest ts-jest @types/jest supertest
npx tsc --init
```

### Phase 1 執行

```
# 提交完整需求（見上方）
# 觀察以下輸出：
# - [Prompt Classifier] 分類結果
# - [Task Decomposition] 子任務列表
# - [Agent Router] 執行計劃

# 執行規格生成
/spec auth-system

# 確認規格
cat .vibe-engine/specs/auth-system.yaml

# 創建 Checkpoint
/checkpoint create auth-spec-done

# 觀察 Agent 調度
# architect → developer → tester → reviewer

# 驗證
/verify
```

### Phase 2 執行

```bash
# 故意引入錯誤到 src/api/auth/register.ts
cat > src/api/auth/register.ts << 'EOF'
// 故意引入的錯誤
const userId: number = "not-a-number";
console.log(undefinedVar);
const query = `SELECT * FROM users WHERE email = '${email}'`;
EOF
```

```
# 觸發錯誤處理
「請修復 register.ts 中的所有錯誤」

# 觀察：
# - error-handler 偵測錯誤
# - debugger 診斷
# - auto-fix-loop 迭代
# - 如果 3 次仍失敗 → ESCALATE

# 故意連續失敗 5 次觸發 circuit-breaker
# 觀察 state: CLOSED → OPEN
```

### Phase 3 執行

```
# 儲存記憶
/remember "認證系統使用 JWT + bcrypt"
/remember "User 模型包含 email, passwordHash, createdAt"
/remember procedural "TypeScript 錯誤先檢查 tsconfig.json"
/remember episodic "第一次實作認證時遇到 token 過期問題"

# 檢索
/recall "JWT"
/recall "認證"

# Checkpoint
/checkpoint create stress-test-complete
/checkpoint list

# Instinct
/instinct-status
/evolve --dry-run

# 呼叫 memory agents
「整理目前的記憶，刪除重複項目」  # 觸發 memory-curator
「分析這次開發過程的模式」       # 觸發 pattern-detector

# 最終驗證
/verify thorough
/status
/budget
```

---

## 驗證清單

### vibe-engine-core (19 項)

#### Agents (5)
| Agent | 觸發 | 輸出正確 |
|-------|------|----------|
| architect | ☐ | ☐ |
| developer | ☐ | ☐ |
| explorer | ☐ | ☐ |
| reviewer | ☐ | ☐ |
| tester | ☐ | ☐ |

#### Hooks (10)
| Hook | 事件 | 觸發 |
|------|------|------|
| session-init | SessionStart | ☐ |
| prompt-classifier | UserPromptSubmit | ☐ |
| task-decomposition-engine | UserPromptSubmit | ☐ |
| agent-router | UserPromptSubmit | ☐ |
| budget-tracker-engine | PreToolUse | ☐ |
| permission-guard | PreToolUse | ☐ |
| observation-collector | PostToolUse | ☐ |
| result-logger | PostToolUse | ☐ |
| verification-engine | Stop | ☐ |
| state-saver | PreCompact | ☐ |

#### Commands (4)
| Command | 執行 | 輸出正確 |
|---------|------|----------|
| /status | ☐ | ☐ |
| /budget | ☐ | ☐ |
| /spec | ☐ | ☐ |
| /verify | ☐ | ☐ |

### vibe-engine-guarantee (6 項)

#### Agent (1)
| Agent | 觸發 | 輸出正確 |
|-------|------|----------|
| debugger | ☐ | ☐ |

#### Hooks (2)
| Hook | 事件 | 觸發 |
|------|------|------|
| error-handler | SubagentStop | ☐ |
| circuit-breaker | PreToolUse | ☐ |

#### Skills (3)
| Skill | 觸發 | 行為正確 |
|-------|------|----------|
| auto-fix-loop | ☐ | ☐ |
| error-recovery | ☐ | ☐ |
| saga-compensation | ☐ | ☐ |

### vibe-engine-memory (10 項)

#### Agents (2)
| Agent | 觸發 | 輸出正確 |
|-------|------|----------|
| memory-curator | ☐ | ☐ |
| pattern-detector | ☐ | ☐ |

#### Hooks (3)
| Hook | 事件 | 觸發 |
|------|------|------|
| memory-init | SessionStart | ☐ |
| observation-collector | PostToolUse | ☐ |
| memory-consolidation | Stop | ☐ |

#### Commands (5)
| Command | 執行 | 輸出正確 |
|---------|------|----------|
| /remember | ☐ | ☐ |
| /recall | ☐ | ☐ |
| /checkpoint | ☐ | ☐ |
| /instinct-status | ☐ | ☐ |
| /evolve | ☐ | ☐ |

---

## 效能指標收集

| 指標 | 目標 | 實際 |
|------|------|------|
| 總 Tool Calls | 100+ | |
| 總 Token 消耗 | 200K+ | |
| Agent 調用次數 | 20+ | |
| 記憶儲存數量 | 10+ | |
| 觀察收集數量 | 50+ | |
| Checkpoint 數量 | 3+ | |
| 錯誤修復迭代 | 3+ | |
| 熔斷器狀態變化 | 2+ | |

---

## 測試報告模板

```markdown
# 壓力測試報告

**日期**: YYYY-MM-DD
**測試專案**: vibe-test
**vibe-engine 版本**: v0.6.0

---

## 觸發率統計

| 模組 | 總組件 | 已觸發 | 觸發率 |
|------|--------|--------|--------|
| vibe-engine-core | 19 | X | X% |
| vibe-engine-guarantee | 6 | X | X% |
| vibe-engine-memory | 10 | X | X% |
| **總計** | **35** | **X** | **X%** |

---

## 效能數據

| 指標 | 數值 |
|------|------|
| 總執行時間 | Xm Xs |
| 總 Token 消耗 | X tokens |
| 總成本 | $X.XX |
| Agent 平均回應時間 | Xs |

---

## 問題發現

### 嚴重 (P0)
1. ...

### 一般 (P1)
1. ...

### 輕微 (P2)
1. ...

---

## 結論

☐ 通過 - 35/35 組件觸發 (100%)
☐ 部分通過 - X/35 組件觸發 (X%)
☐ 失敗 - 關鍵功能未觸發
```

---

## 清理

```bash
# 完整清理
rm -rf src/ tests/ node_modules/ package*.json tsconfig.json
rm -rf .vibe-engine/

# 或保留 .vibe-engine 用於分析
rm -rf src/ tests/ node_modules/ package*.json tsconfig.json
```
