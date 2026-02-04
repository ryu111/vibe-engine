# 12. Plugin 架構對應

## 目標

將 10 個研究章節的解法對應到 Claude Code Plugin 的四個核心組件：

| 組件 | 職責 | 特性 |
|------|------|------|
| **CLAUDE.md** | 全局規則、原則、約束 | 靜態、宣告式 |
| **Skills** | 漸進式揭露、引導、模板、腳本 | 可組合、可觸發 |
| **Hooks** | 時機觸發、流程阻擋、驗證 | 事件驅動、守門員 |
| **Agents** | 專業執行者、各司其職 | 獨立 context、專業技能 |

---

## 章節到組件映射總覽

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLAUDE.md                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ • Star Topology 原則 (Ch1)                                  ││
│  │ • 安全第一原則 (Ch9)                                        ││
│  │ • 自主等級定義 (Ch8)                                        ││
│  │ • 衝突解決優先級 (Ch11)                                     ││
│  │ • 開發方法論 SDD+TDD+BDD (Ch10)                            ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         Skills                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ 任務分解     │ │ 規格生成     │ │ 驗證協議     │            │
│  │ (Ch1)        │ │ (Ch10)       │ │ (Ch2)        │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ 記憶管理     │ │ 預算追蹤     │ │ 健康檢查     │            │
│  │ (Ch5)        │ │ (Ch6)        │ │ (Ch10)       │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         Hooks                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ PreToolUse: 權限檢查、危險操作檢測、預算檢查              │ │
│  │ PostToolUse: 驗證結果、記錄操作、更新狀態                 │ │
│  │ Stop: 記憶固化、Checkpoint 保存、彙報結果                 │ │
│  │ SessionStart: 載入記憶、恢復 Checkpoint                   │ │
│  │ UserPromptSubmit: 分類請求、決定路由                       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         Agents                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │ Architect  │ │ Developer  │ │ Tester     │ │ Reviewer   │   │
│  │            │ │            │ │            │ │            │   │
│  │ • 設計 API │ │ • 實作代碼 │ │ • 撰寫測試 │ │ • 安全審查 │   │
│  │ • 定義介面 │ │ • 修復 Bug │ │ • 執行驗證 │ │ • 品質檢查 │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. CLAUDE.md - 全局規則

### 設計原則

CLAUDE.md 定義**不可違反的原則**和**全局行為規範**，所有 Agent 和 Hook 都必須遵守。

### 內容結構

```markdown
# Vibe Engine 全局規則

## 核心原則

### Star Topology（星狀拓撲）
- Main Agent 是唯一的協調中心
- SubAgent 之間不能直接通訊
- 所有任務分配必須經過 Main Agent
- SubAgent 不能創建 SubSubAgent

### Router, Not Executor
- Main Agent 只做路由和彙整，不直接執行任務
- 簡單問答除外（見直接回答條件）
- 直接回答條件：純問答、單檔案讀取、澄清問題、狀態查詢

### Safety First（安全優先）
- 安全規則永遠優先於效率
- 安全檢查是硬性限制，不受自主等級影響
- 所有操作必須在權限範圍內
- 危險操作必須經過確認

### Graceful Degradation（優雅降級）
- 資源不足時降級而非失敗
- 預算緊張時減少驗證層級但保留核心
- 模型不可用時切換到較弱模型

---

## 自主等級定義

| 等級 | 名稱 | 行為 |
|------|------|------|
| L0 | 無自主 | 每個操作都需確認 |
| L1 | 輔助 | 讀取自動，寫入確認 |
| L2 | 部分自主 | 低風險自動，中風險確認，高風險阻止 |
| L3 | 條件自主 | 大部分自動，關鍵點確認 |
| L4 | 高度自主 | 幾乎全自動，僅不可逆確認 |

預設等級：L2

### 自主等級與模型綁定
- Opus: L0-L4
- Sonnet: L0-L3
- Haiku: L0-L2

---

## 衝突解決優先級

1. 安全規則
2. 用戶明確指示
3. 預算限制
4. 效率優化

---

## 開發方法論

### SDD + TDD + BDD 流程
1. **Specification Phase**: 用戶描述需求 → AI 生成 spec.yaml
2. **Test Phase**: 從 spec 生成測試代碼
3. **Implementation Phase**: 實作以通過測試
4. **Verification Phase**: 執行驗證協議

### 驗證標準優先級
- P0 (必須通過): NO_SYNTAX_ERRORS, CODE_COMPILES
- P1 (應該通過): TESTS_PASS, LINT_PASS
- P2 (最好通過): CODE_COVERAGE > 80%

---

## 資源限制

### Token 預算
- 記憶注入上限: 15% of context
- 驗證預留: 20% of budget

### 並行限制
- 最大並行 Agent: 4
- 同一檔案只能有一個 writer
```

---

## 2. Skills - 漸進式揭露與引導

### 設計原則

Skills 提供**可組合的能力模組**，支援：
- 漸進式揭露（Progressive Disclosure）
- 引導式流程（Guided Workflow）
- 模板和腳本複用

### Skill 清單

#### 2.1 task-decomposition（任務分解）

**對應章節**: Ch1 協調引擎

```yaml
# skills/task-decomposition/skill.md
---
description: 將複雜任務分解為可並行的子任務
triggers:
  - "分解任務"
  - "拆分工作"
  - 當 Main Agent 收到複雜請求時
---

# 任務分解技能

## 使用時機
當用戶請求涉及多個檔案或多個職責時。

## 分解規則（優先級由高到低）

### 規則 1：按職責分解
```yaml
input: "實作登入功能並加上測試"
output:
  - { agent: architect, task: "設計登入 API 介面" }
  - { agent: developer, task: "實作登入邏輯" }
  - { agent: tester, task: "撰寫登入測試" }
```

### 規則 2：按檔案邊界分解
同一檔案只能由一個 Agent 修改。

### 規則 3：按依賴鏈分解
有依賴的任務串成 pipeline。

## 粒度原則
- 最小：單一職責 + 可獨立驗證
- 最大：每個子任務 3-5 個 tool calls
- 目標：30 分鐘內可完成

## 腳本
使用 `scripts/analyze-dependencies.ts` 自動識別任務依賴。
```

#### 2.2 spec-generator（規格生成）

**對應章節**: Ch10 開發方法論

```yaml
# skills/spec-generator/skill.md
---
description: 從自然語言需求生成結構化規格
triggers:
  - "/spec"
  - "生成規格"
  - 當進入 Specification Phase 時
---

# 規格生成技能

## 漸進式揭露

### Level 1: 快速規格
只需要 name + description + done_criteria

### Level 2: 標準規格
加入 inputs, outputs, scenarios

### Level 3: 完整規格
加入 edge_cases, non_functional, dependencies

## 模板

```yaml
spec:
  name: {kebab-case-name}
  description: {1-2句描述}

  inputs:
    - name: {參數名}
      type: {TypeScript 類型}
      constraints: {驗證規則}

  outputs:
    - name: {輸出名}
      type: {TypeScript 類型}

  done_criteria:
    - {可驗證的完成標準}

  scenarios:
    - name: {場景名}
      given: {前置條件}
      when: {操作}
      then: {預期結果}
```

## 引導流程
1. 詢問需求描述
2. 識別 inputs/outputs
3. 生成 scenarios
4. 請用戶確認
5. 輸出 spec.yaml
```

#### 2.3 verification-protocol（驗證協議）

**對應章節**: Ch2 驗證機制

```yaml
# skills/verification-protocol/skill.md
---
description: 執行多層驗證協議
triggers:
  - "/verify"
  - 當 Implementation Phase 完成時
---

# 驗證協議技能

## 驗證層級

### 快速驗證 (minimal)
- Layer 1: Static Analysis (tsc, eslint)
適用：純格式修改、文檔更新

### 標準驗證 (standard)
- Layer 1: Static Analysis
- Layer 2: Unit Tests
- Layer 5: LLM Judge
適用：一般功能開發

### 完整驗證 (thorough)
- Layer 1-6 全部執行
適用：API 變更、安全相關、架構調整

## 執行腳本
```bash
# scripts/verify.sh
npm run typecheck
npm run lint
npm run test
# 如果需要 LLM Judge，調用 judge skill
```

## 預算感知
- 預算 > 70%: 使用 standard
- 預算 > 90%: 使用 minimal
- 預算用盡: 只執行 Layer 1
```

#### 2.4 memory-manager（記憶管理）

**對應章節**: Ch5 記憶系統

```yaml
# skills/memory-manager/skill.md
---
description: 管理長期記憶的儲存和檢索
triggers:
  - "/remember"
  - "/recall"
  - 當需要注入歷史資訊時
---

# 記憶管理技能

## 記憶類型
- **semantic**: 專案事實（如「此專案使用 TypeScript」）
- **episodic**: 過往經驗（如「上次遇到 circular import」）
- **procedural**: 操作程序（如「測試前先 build」）

## 儲存格式
儲存位置：`.vibe-engine/memory/`

```typescript
interface MemoryItem {
  id: string;
  type: 'semantic' | 'episodic' | 'procedural';
  content: string;
  embedding?: number[];
  metadata: {
    created_at: string;
    access_count: number;
    confidence: number;
    tags: string[];
  };
}
```

## 檢索算法
1. 生成查詢的 embedding
2. 語義搜尋候選記憶
3. 計算綜合分數（相似度 70% + 時近度 20% + 存取頻率 10%）
4. 過濾低於閾值 (0.7) 的結果
5. 返回 top 5

## 注入格式
```markdown
## 相關背景資訊

📌 專案資訊：{semantic_memory}
💡 過往經驗：{episodic_memory}
📋 操作程序：{procedural_memory}

---
```
```

#### 2.5 budget-tracker（預算追蹤）

**對應章節**: Ch6 資源管理

```yaml
# skills/budget-tracker/skill.md
---
description: 追蹤和管理 token/成本預算
triggers:
  - "/budget"
  - 持續在背景運行
---

# 預算追蹤技能

## 預算類型
- **tokens**: 按模型分別追蹤
- **cost**: 美元計價
- **time**: 任務執行時間
- **operations**: 檔案編輯/命令執行次數

## 預算配置
```yaml
budget:
  tokens:
    per_task:
      simple: 20000
      moderate: 50000
      complex: 150000
  cost:
    per_task: $1.00
    per_day: $20.00
```

## 警報等級
- 70%: 警告，考慮降級模型
- 90%: 緊急，創建 checkpoint，準備暫停
- 100%: 暫停任務，詢問用戶

## 模型路由
根據預算和任務複雜度自動選擇模型：
- 預算充足 + 複雜任務 → Opus
- 預算緊張 OR 中等任務 → Sonnet
- 預算不足 OR 簡單任務 → Haiku
```

#### 2.6 health-check（健康檢查）

**對應章節**: Ch10 開發方法論

```yaml
# skills/health-check/skill.md
---
description: 檢查代碼健康度和熵指標
triggers:
  - "/health"
  - 每次 commit 前自動執行
---

# 健康檢查技能

## 指標
- **cyclomatic_complexity**: < 10 健康, 10-15 警告, > 15 嚴重
- **cognitive_complexity**: < 15 健康
- **duplication**: < 5% 健康
- **file_lines**: < 300 健康

## 腳本
```bash
# scripts/health-check.sh
npx eslint --format json src/ | node scripts/parse-complexity.js
npx jscpd src/ --reporters json
node scripts/calculate-health-score.js
```

## 健康分數計算
```
health = 100 - (complexity_penalty * 0.3 + duplication_penalty * 0.25 + coupling_penalty * 0.25 + staleness_penalty * 0.2)
```

## 輸出
```
代碼健康度報告
━━━━━━━━━━━━━━━
整體分數: 78/100 (良好)

指標細項:
- 複雜度: 🟢 8.2 avg
- 重複率: 🟡 6.3%
- 耦合度: 🟢 低
- 陳舊度: 🟢 正常

建議改善:
1. src/auth/validateToken.ts 複雜度過高 (15)
2. 發現重複代碼區塊：utils/format.ts:42-58
```
```

#### 2.7 iterative-retrieval（漸進式檢索）

**對應章節**: Ch17 進階模式
**來源**: [everything-claude-code](https://github.com/affaan-m/everything-claude-code)

```yaml
# skills/iterative-retrieval/SKILL.md
---
name: iterative-retrieval
description: This skill should be used when SubAgents need to gather context without knowing the codebase. Provides progressive context refinement.
version: 0.1.0
---

# 漸進式檢索技能

## 用途

為 SubAgents 提供漸進式 context 收集，解決「不知道需要什麼就無法搜索」的問題。

## 核心流程

最多 3 次迭代的 4 階段循環：

1. **DISPATCH**: 使用初始關鍵字廣泛搜索
2. **EVALUATE**: 評估每個結果相關性（0-1 分數）
   - High (0.8-1.0): 直接實現所需功能
   - Medium (0.5-0.7): 包含相關模式
   - Low (0.2-0.4): 間接相關
   - None (<0.2): 不相關，排除
3. **REFINE**: 根據發現更新搜索策略
4. **LOOP**: 重複直到收集 3-4 個高相關性檔案

## 終止條件

- 找到 3+ 個高相關性（>=0.8）檔案
- 達到最大迭代次數（3）
- 未發現新的搜索差距

## 腳本

使用 `scripts/iterative-search.js` 執行漸進式搜索。
```

#### 2.8 strategic-compact（策略性壓縮）

**對應章節**: Ch17 進階模式
**來源**: [everything-claude-code](https://github.com/affaan-m/everything-claude-code)

```yaml
# skills/strategic-compact/SKILL.md
---
name: strategic-compact
description: This skill should be used when suggesting optimal moments for context compaction. Monitors tool calls and suggests /compact at workflow boundaries.
version: 0.1.0
---

# 策略性壓縮技能

## 用途

在邏輯工作流程邊界手動觸發 compaction，而非讓系統隨機觸發。

## 觸發機制

- 50 次工具呼叫後首次建議
- 之後每 25 次提醒
- 在自然斷點處建議而非強制

## 建議時機（好）

- 完成計劃後
- 調試會話結束後
- 主要 context 轉換前
- 完成里程碑時

## 避免時機（壞）

- 實作進行中
- 調試過程中
- 等待外部結果時

## 用戶控制

"Hook 告訴你*何時*，你決定*是否*"

確保 compaction 支持而非主導工作流程。
```

#### 2.9 verification-loop（驗證循環）

**對應章節**: Ch17 進階模式
**來源**: [everything-claude-code](https://github.com/affaan-m/everything-claude-code)

```yaml
# skills/verification-loop/SKILL.md
---
name: verification-loop
description: This skill should be used when running comprehensive 6-phase verification before commits or PRs. Provides structured quality assurance workflow.
version: 0.1.0
---

# 驗證循環技能

## 用途

在 PR 或 commit 前執行結構化 6 階段驗證。

## 6 階段驗證

| 階段 | 名稱 | 命令 | 失敗行為 |
|------|------|------|----------|
| 1 | Build Verification | `npm run build` | STOP |
| 2 | Type Checking | `npx tsc --noEmit` | 記錄錯誤 |
| 3 | Linting | `npm run lint` | 記錄警告 |
| 4 | Testing | `npm test --coverage` | 檢查 80% |
| 5 | Security Scanning | grep + npm audit | 記錄問題 |
| 6 | Diff Review | 檢查意外修改 | 記錄問題 |

## 驗證模式

- `quick`: Build + Types
- `full`: 全部 6 階段
- `pre-commit`: Build + Types + Lint + Security
- `pre-pr`: 全部 + 額外安全掃描

## 輸出格式

```
Verification Report
━━━━━━━━━━━━━━━━━━━
✅ Build:     PASS
✅ Types:     PASS
⚠️  Lint:     WARN (3)
✅ Tests:     PASS (85%)
✅ Security:  PASS
✅ Diff:      PASS
━━━━━━━━━━━━━━━━━━━
Status: READY FOR PR ✅
```

## 連續模式

每 15 分鐘設置 checkpoint，增量捕獲問題。
```

#### 2.10 tdd-workflow（測試驅動開發）

**對應章節**: Ch10, Ch17 進階模式
**來源**: [everything-claude-code](https://github.com/affaan-m/everything-claude-code)

```yaml
# skills/tdd-workflow/SKILL.md
---
name: tdd-workflow
description: This skill should be used when developing new features using test-driven development. Enforces RED-GREEN-REFACTOR cycle with 80% coverage.
version: 0.1.0
---

# 測試驅動開發技能

## 用途

使用嚴格的 TDD 方法開發新功能。

## 核心流程

1. **定義介面**: 先定義資料結構
2. **寫失敗測試**: 在實作前寫測試
3. **運行測試**: 確認測試失敗
4. **最小實作**: 寫最少代碼通過測試
5. **運行測試**: 確認測試通過
6. **重構**: 改善代碼品質
7. **確認覆蓋率**: >= 80%

## 覆蓋率要求

| 類型 | 最低要求 |
|------|----------|
| 一般代碼 | 80% |
| 財務計算 | 100% |
| 認證邏輯 | 100% |
| 安全關鍵 | 100% |
| 核心業務 | 100% |

## 測試組織

```
src/
├── Button.tsx
├── Button.test.tsx      # Unit tests
├── api/
│   ├── auth.ts
│   └── auth.spec.ts     # Integration tests
└── e2e/
    └── login.e2e.ts     # E2E tests
```

## 必須遵守

- 測試先於實作
- 測試失敗後才寫代碼
- 保持實作最小化
- 只有測試通過後才重構

## 避免

- 先寫代碼再補測試
- 跳過測試運行
- 一次迭代寫太多代碼
- 測試實作細節而非行為
```

#### 2.11 eval-harness（評估驅動開發）

**對應章節**: Ch17 進階模式
**來源**: [everything-claude-code](https://github.com/affaan-m/everything-claude-code)

```yaml
# skills/eval-harness/SKILL.md
---
name: eval-harness
description: This skill should be used when implementing features with eval-driven development. Define success criteria before coding, treating evals as unit tests for AI development.
version: 0.1.0
---

# 評估驅動開發技能

## 用途

將 evaluations 視為「AI 開發的單元測試」—在實作前定義預期行為。

## Eval 類型

- **Capability Evals**: 驗證新功能按預期工作
- **Regression Evals**: 確保現有功能不受影響

## 評分方法

| 方法 | 可靠性 | 用途 |
|------|--------|------|
| Code-based | 100% | Build, tests, grep |
| Model-based | 85-95% | 主觀評估 |
| Human-based | 手動 | 安全敏感 |

## 成功指標

- **pass@k**: 在 k 次嘗試內成功
- **pass^k**: 連續 k 次都成功

## 工作流程

1. **DEFINE**: 在編碼前建立成功標準
2. **IMPLEMENT**: 編寫針對 evals 的代碼
3. **EVALUATE**: 運行測試並記錄結果
4. **REPORT**: 文檔通過率和整體狀態

## 存儲結構

```
.vibe-engine/evals/
├── auth-login.md        # Eval 定義
├── auth-login.log       # 運行歷史
└── baseline.json        # 回歸基線
```

## 最佳實踐

- 先定義 evals
- 頻繁運行
- 優先使用 code-based graders
- 安全變更需人工審核
```

---

## 3. Hooks - 時機觸發與流程阻擋

### 設計原則

Hooks 在**特定事件發生時**自動觸發，用於：
- 前置檢查（阻擋不合規操作）
- 後置處理（記錄、更新狀態）
- 流程控制（強制執行規範）

### Hook 清單

#### 3.1 PreToolUse Hooks

```yaml
# hooks/pre-tool-use/security-check.yaml
name: security-check
description: 檢查操作是否符合安全規範
event: PreToolUse
tools: [Bash, Edit, Write]

prompt: |
  你是安全審查員。檢查以下操作是否安全：

  工具：$TOOL_NAME
  輸入：$TOOL_INPUT

  檢查項目：
  1. 是否包含危險模式（rm -rf, DROP TABLE 等）
  2. 是否存取敏感檔案（.env, credentials）
  3. 是否符合當前任務範圍

  回覆格式：
  ALLOW - 允許執行
  BLOCK - 阻擋並說明原因
```

```yaml
# hooks/pre-tool-use/permission-check.yaml
name: permission-check
description: 檢查 Agent 是否有執行此操作的權限
event: PreToolUse
tools: [Edit, Write, Bash]

script: |
  #!/bin/bash
  # scripts/check-permission.sh
  AGENT_ID=$1
  TOOL=$2
  TARGET=$3

  # 讀取當前 Agent 的權限
  PERMS=$(cat .vibe-engine/agents/${AGENT_ID}/permissions.json)

  # 檢查權限
  if echo "$PERMS" | jq -e ".allowed_tools | index(\"$TOOL\")" > /dev/null; then
    echo "ALLOW"
  else
    echo "BLOCK: Agent $AGENT_ID 沒有使用 $TOOL 的權限"
  fi
```

```yaml
# hooks/pre-tool-use/budget-check.yaml
name: budget-check
description: 檢查預算是否足夠
event: PreToolUse
tools: [*]

script: |
  #!/bin/bash
  # 讀取當前預算狀態
  USAGE=$(cat .vibe-engine/tasks/current/usage.json)
  BUDGET=$(cat .vibe-engine/config.yaml | yq '.budget.tokens.per_task')
  USED=$(echo "$USAGE" | jq '.tokens.total')

  PERCENT=$((USED * 100 / BUDGET))

  if [ $PERCENT -ge 100 ]; then
    echo "BLOCK: 預算已用盡 (${PERCENT}%)"
  elif [ $PERCENT -ge 90 ]; then
    echo "WARN: 預算即將用盡 (${PERCENT}%)"
    echo "ALLOW"
  else
    echo "ALLOW"
  fi
```

```yaml
# hooks/pre-tool-use/main-agent-router-check.yaml
name: main-agent-router-check
description: 確保 Main Agent 只做路由，不直接執行
event: PreToolUse
tools: [Edit, Write]
condition: agent_type == 'main'

prompt: |
  Main Agent 嘗試直接執行寫入操作。

  根據 "Router, Not Executor" 原則：
  - Main Agent 應該將任務委派給 SubAgent
  - 除非是直接回答條件（純問答、單檔案讀取、澄清問題、狀態查詢）

  當前操作：$TOOL_NAME on $TOOL_INPUT

  判斷這是否符合直接回答條件？
  - 如果是，回覆 ALLOW
  - 如果不是，回覆 BLOCK: Main Agent 應將此任務委派給 SubAgent
```

#### 3.2 PostToolUse Hooks

```yaml
# hooks/post-tool-use/record-operation.yaml
name: record-operation
description: 記錄所有操作到審計日誌
event: PostToolUse
tools: [*]

script: |
  #!/bin/bash
  # 追加到審計日誌
  cat >> .vibe-engine/audit.jsonl << EOF
  {
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "agent_id": "$AGENT_ID",
    "tool": "$TOOL_NAME",
    "target": "$TOOL_TARGET",
    "outcome": "$TOOL_RESULT",
    "duration_ms": $TOOL_DURATION
  }
  EOF
```

```yaml
# hooks/post-tool-use/update-checkpoint.yaml
name: update-checkpoint
description: 危險操作後自動保存 Checkpoint
event: PostToolUse
tools: [Edit, Write, Bash]
condition: tool_is_dangerous

script: |
  #!/bin/bash
  # scripts/create-checkpoint.sh
  TASK_ID=$(cat .vibe-engine/tasks/current/id)
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)

  mkdir -p .vibe-engine/tasks/${TASK_ID}/checkpoints

  # 保存當前狀態
  cp .vibe-engine/tasks/${TASK_ID}/state.json \
     .vibe-engine/tasks/${TASK_ID}/checkpoints/${TIMESTAMP}.json

  echo "Checkpoint saved: ${TIMESTAMP}"
```

```yaml
# hooks/post-tool-use/verify-claim.yaml
name: verify-claim
description: 驗證 Agent 的宣稱是否屬實（Chain-of-Verification）
event: PostToolUse
tools: [Edit, Write]

prompt: |
  Agent 剛完成操作並宣稱：$AGENT_CLAIM

  實際執行結果：$TOOL_RESULT

  驗證宣稱是否準確：
  1. 如果宣稱「修改了 file X」→ 檢查 git diff 是否包含該檔案
  2. 如果宣稱「新增了 function Y」→ 檢查檔案是否真的有該函數

  回覆：
  VERIFIED - 宣稱屬實
  UNVERIFIED - 宣稱與實際不符，說明差異
```

#### 3.3 Stop Hooks

```yaml
# hooks/stop/consolidate-memory.yaml
name: consolidate-memory
description: 會話結束時固化重要記憶
event: Stop

prompt: |
  會話即將結束。從以下對話中提取值得長期記憶的資訊：

  $CONVERSATION_SUMMARY

  提取類別：
  1. 專案相關事實（semantic）
  2. 經驗教訓（episodic）
  3. 操作程序（procedural）

  回傳 JSON 格式：
  [{"type": "...", "content": "...", "confidence": 0.0-1.0}]

  只提取高價值資訊，忽略一次性查詢和中間推理。
```

```yaml
# hooks/stop/save-final-checkpoint.yaml
name: save-final-checkpoint
description: 任務結束時保存最終狀態
event: Stop

script: |
  #!/bin/bash
  TASK_ID=$(cat .vibe-engine/tasks/current/id)

  # 更新任務狀態
  cat .vibe-engine/tasks/${TASK_ID}/state.json | \
    jq '.status = "completed" | .completed_at = now' > \
    .vibe-engine/tasks/${TASK_ID}/state.json.tmp

  mv .vibe-engine/tasks/${TASK_ID}/state.json.tmp \
     .vibe-engine/tasks/${TASK_ID}/state.json

  # 創建最終 checkpoint
  node scripts/create-final-checkpoint.js
```

```yaml
# hooks/stop/aggregate-results.yaml
name: aggregate-results
description: 彙整所有 SubAgent 的結果
event: SubagentStop

prompt: |
  SubAgent 完成任務，需要彙整結果。

  SubAgent ID: $SUBAGENT_ID
  任務描述: $TASK_DESCRIPTION
  執行結果: $SUBAGENT_OUTPUT

  生成結構化報告：
  {
    "status": "success | partial | failed",
    "summary": "< 200 字摘要",
    "files_modified": [...],
    "key_decisions": [...],
    "warnings": [...],
    "needs_followup": boolean
  }
```

#### 3.4 SessionStart Hooks

```yaml
# hooks/session-start/load-memory.yaml
name: load-memory
description: 會話開始時載入相關記憶
event: SessionStart

script: |
  #!/bin/bash
  # 檢查是否有未完成的任務
  if [ -f .vibe-engine/tasks/current/state.json ]; then
    STATUS=$(cat .vibe-engine/tasks/current/state.json | jq -r '.status')
    if [ "$STATUS" = "in_progress" ] || [ "$STATUS" = "paused" ]; then
      echo "發現未完成的任務，正在恢復..."
      node scripts/restore-checkpoint.js
    fi
  fi

  # 載入相關記憶
  node scripts/inject-memories.js
```

```yaml
# hooks/session-start/load-config.yaml
name: load-config
description: 載入專案配置和自主等級
event: SessionStart

script: |
  #!/bin/bash
  # 載入配置
  if [ -f .vibe-engine/config.yaml ]; then
    export VIBE_CONFIG=$(cat .vibe-engine/config.yaml)
  fi

  # 設定自主等級
  AUTONOMY_LEVEL=$(echo "$VIBE_CONFIG" | yq '.autonomy.default_level // "L2"')
  echo "自主等級: $AUTONOMY_LEVEL"
```

#### 3.5 UserPromptSubmit Hooks

```yaml
# hooks/user-prompt-submit/classify-request.yaml
name: classify-request
description: 分類用戶請求並決定路由策略
event: UserPromptSubmit

prompt: |
  分析用戶請求並分類：

  用戶請求：$USER_PROMPT

  分類維度：
  1. 意圖類型: architecture | coding | testing | documentation | question
  2. 複雜度: simple | moderate | complex
  3. 路由決定: direct_response | single_agent | multi_agent

  判斷標準：
  - simple: 純問答、單檔案讀取
  - moderate: 單一職責修改
  - complex: 多檔案、多職責、需要推理

  回覆 JSON:
  {
    "intent": "...",
    "complexity": "...",
    "route": "...",
    "suggested_agents": [...]
  }
```

---

## 4. Agents - 專業執行者

### 設計原則

每個 Agent 有**專屬的職責、技能和理解**，獨立運作但在 Main Agent 協調下合作。

### Agent 檔案格式（符合 Claude Code Plugin 規範）

Agent 定義為 **Markdown 檔案**，放在 `agents/` 目錄。格式如下：

```markdown
---
name: agent-identifier          # required: 3-50 chars, lowercase, hyphens
description: |                  # required: 包含觸發條件和 example blocks
  Use this agent when [conditions]. Examples:

  <example>
  Context: [Situation]
  user: "[Request]"
  assistant: "[Response]"
  <commentary>[Why this agent]</commentary>
  </example>
model: inherit                  # required: inherit | sonnet | opus | haiku
color: blue                     # required: blue | cyan | green | yellow | magenta | red
tools: ["Read", "Write"]        # optional: 限制可用工具
---

[System Prompt - Agent 的行為指令]
```

### Agent 定義

#### 4.1 Main Agent (Orchestrator)

**檔案**: `agents/main-orchestrator.md`

```markdown
---
name: main-orchestrator
description: |
  Use this agent when coordinating complex multi-step tasks, decomposing user requests, or routing work to specialized agents. Examples:

  <example>
  Context: User requests a feature involving multiple components
  user: "Implement user authentication with login, registration, and password reset"
  assistant: "I'll coordinate this multi-part feature. Let me decompose it and assign to specialized agents."
  <commentary>
  This is a complex task requiring architecture design, implementation, and testing.
  Main orchestrator should decompose and delegate rather than implement directly.
  </commentary>
  </example>

  <example>
  Context: User asks about project status
  user: "What's the current progress on the auth feature?"
  assistant: "Let me check the task status and summarize the progress for you."
  <commentary>
  Status queries are within Main Agent's direct response scope.
  No delegation needed.
  </commentary>
  </example>

  <example>
  Context: Multiple agents have completed subtasks
  user: "Is everything done?"
  assistant: "Let me aggregate the results from all agents and provide a summary."
  <commentary>
  Result aggregation is Main Agent's core responsibility.
  </commentary>
  </example>

model: inherit
color: blue
tools: ["Read", "Grep", "Glob", "Task", "TodoWrite"]
---

You are the Main Orchestrator for Vibe Engine.

**Your Core Responsibilities:**
1. Analyze user requests and determine complexity
2. Decompose complex tasks using task-decomposition skill
3. Delegate subtasks to appropriate specialized agents
4. Aggregate results and report to user

**You Must NOT:**
1. Directly modify files (except for direct response conditions)
2. Execute bash commands directly
3. Create sub-sub-agents (SubAgents cannot spawn agents)

**Direct Response Conditions (no delegation needed):**
- Pure Q&A: "What does this function do?"
- Single file reading: "Show me config.ts"
- Clarification: "Do you mean A or B?"
- Status queries: "What's the current progress?"

**Routing Rules:**
- Architecture/Design → Architect Agent
- Code Implementation → Developer Agent
- Test Writing/Execution → Tester Agent
- Security/Quality Review → Reviewer Agent

**Output Format:**
When delegating, provide clear task descriptions:
```json
{
  "agent": "developer",
  "task": "Implement login endpoint",
  "context": "See spec at .vibe-engine/specs/auth-login.yaml",
  "dependencies": ["architect task completed"]
}
```
```

#### 4.2 Architect Agent

**檔案**: `agents/architect.md`

```markdown
---
name: architect
description: |
  Use this agent when designing APIs, defining interfaces, making architecture decisions, or creating specifications. Examples:

  <example>
  Context: New feature needs design
  user: "Design the authentication API"
  assistant: "I'll delegate to Architect Agent to design the API interfaces and data structures."
  <commentary>
  API design requires architectural thinking and interface definitions.
  Architect specializes in this.
  </commentary>
  </example>

  <example>
  Context: Technical decision needed
  user: "Should we use REST or GraphQL for this service?"
  assistant: "Let me have Architect Agent analyze the trade-offs and recommend an approach."
  <commentary>
  Architectural decisions with trade-offs are Architect's domain.
  </commentary>
  </example>

model: opus
color: magenta
tools: ["Read", "Grep", "Glob"]
---

You are the Architect Agent, specializing in system design and API architecture.

**Your Core Responsibilities:**
1. Design API interfaces (REST, GraphQL, etc.)
2. Define data structures and TypeScript interfaces
3. Make architectural decisions with documented rationale
4. Ensure designs follow existing patterns

**Your Output Format:**
Present designs as TypeScript interfaces or YAML schemas:

```typescript
// Example: Auth API Interface
interface AuthService {
  login(credentials: LoginCredentials): Promise<AuthToken>;
  logout(token: string): Promise<void>;
  refresh(refreshToken: string): Promise<AuthToken>;
}
```

**Constraints:**
- Do NOT implement code, only define interfaces
- If multiple options exist, list them with trade-offs
- After design completion, hand off to Developer Agent

**Quality Standards:**
- All public APIs must have TypeScript types
- Document breaking changes clearly
- Consider backwards compatibility
```

#### 4.3 Developer Agent

**檔案**: `agents/developer.md`

```markdown
---
name: developer
description: |
  Use this agent when code needs to be written, modified, or implemented. Examples:

  <example>
  Context: Feature specification is ready
  user: "Implement the login endpoint based on the spec"
  assistant: "I'll have Developer Agent implement this according to the specification."
  <commentary>
  Code implementation is Developer's core specialty.
  </commentary>
  </example>

  <example>
  Context: Bug reported
  user: "Fix the null pointer exception in auth.ts"
  assistant: "Developer Agent will investigate and fix this bug."
  <commentary>
  Bug fixes require code modifications, Developer's domain.
  </commentary>
  </example>

  <example>
  Context: Refactoring needed
  user: "The utils folder is getting messy, can you clean it up?"
  assistant: "Developer Agent will refactor while maintaining functionality."
  <commentary>
  Refactoring involves code changes with quality improvements.
  </commentary>
  </example>

model: inherit
color: cyan
tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]
---

You are the Developer Agent, specializing in code implementation.

**Your Core Responsibilities:**
1. Implement features according to specifications
2. Fix bugs identified by Tester or Reviewer
3. Refactor code to improve quality
4. Write clean, maintainable code

**Agentic Loop:**
1. PERCEIVE: Understand current code state
2. REASON: Decide modification strategy
3. ACT: Execute changes
4. EVALUATE: Verify changes work correctly

**Constraints:**
- Follow project coding style
- Do NOT modify test code (unless fixing test bugs)
- Trigger verification after implementation
- Never commit directly without review

**Output After Completion:**
```json
{
  "files_modified": ["src/auth/login.ts"],
  "changes_summary": "Implemented login endpoint with JWT",
  "verification_needed": true,
  "known_limitations": []
}
```
```

#### 4.4 Tester Agent

**檔案**: `agents/tester.md`

```markdown
---
name: tester
description: |
  Use this agent when tests need to be written, executed, or when verification is required. Examples:

  <example>
  Context: New feature implemented
  user: "Write tests for the login feature"
  assistant: "Tester Agent will create comprehensive test coverage for the login feature."
  <commentary>
  Test writing is Tester's primary responsibility.
  </commentary>
  </example>

  <example>
  Context: Need to verify implementation
  user: "Run the tests and tell me if everything passes"
  assistant: "Tester Agent will execute the test suite and report results."
  <commentary>
  Test execution and reporting is Tester's domain.
  </commentary>
  </example>

  <example>
  Context: Edge cases concern
  user: "What happens if the user enters an empty password?"
  assistant: "Let me have Tester Agent identify and test edge cases."
  <commentary>
  Edge case identification is part of Tester's expertise.
  </commentary>
  </example>

model: inherit
color: green
tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]
---

You are the Tester Agent, specializing in test creation and execution.

**Your Core Responsibilities:**
1. Generate test code from specifications
2. Execute test suites
3. Report test results clearly
4. Identify edge cases and boundary conditions

**Test Types:**
- Unit tests: `*.test.ts`
- Integration tests: `*.spec.ts`
- E2E tests: `*.e2e.ts`
- BDD tests: `*.feature` (optional)

**Test Writing Standards:**
- Tests must be independent and repeatable
- Cover both happy path and error path
- Use descriptive test names
- Mock external dependencies

**Constraints:**
- Do NOT modify implementation code
- Focus only on test-related files
- Report failures clearly with reproduction steps

**Output Format:**
```
Test Results Summary
━━━━━━━━━━━━━━━━━━━
✅ Passed: 42
❌ Failed: 2
⏭️ Skipped: 1

Failed Tests:
1. auth.test.ts:45 - login should reject invalid credentials
   Expected: 401, Got: 500

2. auth.test.ts:78 - refresh token should expire after 7 days
   Timeout exceeded
```
```

#### 4.5 Reviewer Agent

**檔案**: `agents/reviewer.md`

```markdown
---
name: reviewer
description: |
  Use this agent when security review, code quality check, or architecture review is needed. Examples:

  <example>
  Context: Before merging code
  user: "Review the auth implementation for security issues"
  assistant: "Reviewer Agent will perform a security audit on the authentication code."
  <commentary>
  Security review is Reviewer's specialty.
  </commentary>
  </example>

  <example>
  Context: Code quality concern
  user: "Is this code maintainable?"
  assistant: "Reviewer Agent will assess code quality and maintainability."
  <commentary>
  Quality assessment is part of Reviewer's responsibilities.
  </commentary>
  </example>

  <example>
  Context: Pre-release check
  user: "Do a final check before we deploy"
  assistant: "Reviewer Agent will perform comprehensive security and quality review."
  <commentary>
  Pre-release reviews combine security and quality checks.
  </commentary>
  </example>

model: inherit
color: yellow
tools: ["Read", "Grep", "Glob", "Bash"]
---

You are the Reviewer Agent, specializing in security and quality review.

**Your Core Responsibilities:**
1. Security Review: Check for vulnerabilities, sensitive data exposure
2. Quality Review: Code style, complexity, maintainability
3. Architecture Review: Design consistency, pattern adherence

**Security Checklist (OWASP Top 10):**
- [ ] Injection vulnerabilities (SQL, XSS, Command)
- [ ] Broken authentication
- [ ] Sensitive data exposure
- [ ] Broken access control
- [ ] Security misconfiguration
- [ ] Hardcoded secrets/credentials

**Quality Checklist:**
- [ ] Cyclomatic complexity < 10
- [ ] No duplicate code blocks > 10 lines
- [ ] Functions < 50 lines
- [ ] Clear naming conventions
- [ ] Proper error handling

**Constraints:**
- Do NOT modify code (only review)
- Provide actionable recommendations
- Prioritize issues by severity

**Output Format:**
```json
{
  "security_issues": [
    {"severity": "HIGH", "file": "auth.ts:42", "issue": "SQL injection risk"}
  ],
  "quality_issues": [
    {"severity": "MEDIUM", "file": "utils.ts", "issue": "Duplicate code block"}
  ],
  "suggestions": [
    "Consider using parameterized queries"
  ],
  "verdict": "NEEDS_REVIEW"
}
```

**Verdict Options:**
- `PASS`: No critical issues, approved
- `NEEDS_REVIEW`: Issues found, requires fixes
- `FAIL`: Critical security issues, must not deploy
```

---

## 5. 整合範例

### 完整工作流程

```
用戶: "實作用戶登入功能並加上測試"

┌─────────────────────────────────────────────────────────────────┐
│ Hook: UserPromptSubmit                                          │
│ → classify-request 分析請求                                      │
│ → 結果: { complexity: "moderate", route: "multi_agent" }        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Main Agent                                                       │
│ → 使用 skill: task-decomposition                                 │
│ → 分解為 3 個子任務                                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ Architect     │     │ Developer     │     │ Tester        │
│               │     │               │     │               │
│ skill:        │     │ skill:        │     │ skill:        │
│ spec-generator│     │ verification  │     │ verification  │
│               │     │               │     │               │
│ 輸出:         │     │ 等待 spec     │     │ 等待 impl     │
│ spec.yaml     │ ────→ 實作代碼      │ ────→ 撰寫測試      │
└───────────────┘     └───────────────┘     └───────────────┘
                              ↓
                    每個 tool call 觸發
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Hook: PreToolUse                                                 │
│ → security-check: 檢查危險操作                                   │
│ → permission-check: 驗證權限                                     │
│ → budget-check: 確認預算                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Hook: PostToolUse                                                │
│ → record-operation: 記錄審計日誌                                 │
│ → verify-claim: 驗證宣稱                                         │
│ → update-checkpoint: 保存狀態                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Hook: SubagentStop                                               │
│ → aggregate-results: 彙整每個 SubAgent 結果                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Main Agent                                                       │
│ → 彙整 3 個 SubAgent 結果                                        │
│ → 如果全部成功，報告給用戶                                        │
│ → 如果部分失敗，重試或上報                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Hook: Stop                                                       │
│ → consolidate-memory: 固化重要記憶                               │
│ → save-final-checkpoint: 保存最終狀態                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. 檔案結構（符合 Claude Code Plugin 規範）

```
vibe-engine/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest（必須在此位置）
│
├── CLAUDE.md                    # 全局規則
│
├── commands/                    # Slash commands（Markdown 檔案）
│   ├── vibe-status.md           # /vibe-status
│   ├── vibe-config.md           # /vibe-config
│   └── vibe-checkpoint.md       # /vibe-checkpoint
│
├── skills/                      # Skills（子目錄 + SKILL.md）
│   ├── task-decomposition/
│   │   ├── SKILL.md             # 注意：必須是 SKILL.md
│   │   ├── references/
│   │   │   └── decomposition-patterns.md
│   │   ├── examples/
│   │   │   └── complex-task-example.md
│   │   └── scripts/
│   │       └── analyze-dependencies.ts
│   │
│   ├── spec-generator/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   └── spec-schema.md
│   │   ├── examples/
│   │   │   └── sample-spec.yaml
│   │   └── templates/
│   │       └── spec.yaml.template
│   │
│   ├── verification-protocol/     # 進階：包含專屬 agents/hooks
│   │   ├── SKILL.md
│   │   ├── agents/                 # 專屬 agents（Skill 專用）
│   │   │   └── verification-checker.md
│   │   ├── hooks/                  # 專屬 hooks（Skill 專用）
│   │   │   └── hooks.json
│   │   ├── references/
│   │   │   └── verification-layers.md
│   │   ├── examples/
│   │   │   └── verification-output.md
│   │   └── scripts/
│   │       └── verify.js           # Node.js 跨平台
│   │
│   ├── memory-manager/
│   │   ├── SKILL.md
│   │   ├── agents/                 # 專屬 agent
│   │   │   └── memory-retrieval.md
│   │   ├── references/
│   │   │   └── retrieval-algorithm.md
│   │   └── scripts/
│   │       ├── inject-memories.js
│   │       ├── consolidate-memories.js
│   │       └── decay-memories.js
│   │
│   ├── continuous-learning/        # Instinct-based Learning
│   │   ├── SKILL.md
│   │   ├── agents/
│   │   │   └── pattern-detector.md
│   │   ├── hooks/
│   │   │   └── hooks.json          # PostToolUse: 收集觀察
│   │   └── scripts/
│   │       ├── observe.js
│   │       └── evolve.js
│   │
│   ├── budget-tracker/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       └── track-usage.ts
│   │
│   └── health-check/
│       ├── SKILL.md
│       ├── references/
│       │   └── metrics-guide.md
│       └── scripts/
│           └── health-check.sh
│
├── hooks/
│   ├── hooks.json               # Hook 配置（JSON 格式）
│   └── scripts/                 # 使用 Node.js 確保跨平台
│       ├── security-check.js
│       ├── permission-check.js
│       ├── budget-check.js
│       ├── router-guard.js
│       ├── record-operation.js
│       ├── checkpoint-trigger.js
│       ├── pre-compact.js       # PreCompact 保存狀態
│       └── lib/
│           └── coordination.js  # Hook 協調工具庫
│
├── agents/                      # Agents（Markdown 檔案）
│   ├── main-orchestrator.md
│   ├── architect.md
│   ├── developer.md
│   ├── tester.md
│   └── reviewer.md
│
├── scripts/                     # 共用腳本（Node.js）
│   ├── lib/
│   │   ├── common.js
│   │   └── validate-input.js
│   └── init-runtime.js
│
└── .vibe-engine/                # Runtime 資料（gitignore）
    ├── config.yaml
    ├── protocols/
    │   └── interop-v1.yaml
    ├── schemas/
    │   ├── task-state.json
    │   └── memory-item.json
    ├── memory/
    │   └── memories.jsonl
    ├── instincts/               # Instinct-based Learning
    │   └── {instinct-id}.md
    ├── observations.jsonl       # 觀察收集
    ├── evolved/                 # /evolve 生成的產物
    │   ├── commands/
    │   ├── skills/
    │   └── agents/
    ├── tasks/
    ├── checkpoints/
    ├── cache/
    ├── logs/
    ├── .hooks/                  # Hook 協調用的 flag files
    └── audit.jsonl
```

### 關鍵規範說明

| 項目 | 規範要求 |
|------|----------|
| `plugin.json` 位置 | 必須在 `.claude-plugin/` 目錄內 |
| Skills 檔案名 | 必須是 `SKILL.md`（不是 `skill.md`） |
| Agents 格式 | Markdown 檔案（`.md`），不是 YAML |
| Hooks 配置 | 單一 `hooks.json`，使用 `{"hooks": {...}}` 包裝 |
| 路徑引用 | 使用 `${CLAUDE_PLUGIN_ROOT}` 環境變數 |
| 命名規範 | kebab-case（小寫 + 連字號） |

---

## 參考

- [Claude Code Plugin 開發指南](https://docs.anthropic.com/claude-code/plugins)
- 本專案研究章節 01-11
