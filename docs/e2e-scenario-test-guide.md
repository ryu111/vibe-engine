# 端到端情境測試指南

> 版本: v0.6.0
> 目的: 在 vibe-test 專案中模擬真實開發流程，驗證完整工作流

## 測試原則

1. **真實模擬** - 實際創建功能代碼，而非只測試命令
2. **完整流程** - 需求 → 規格 → 設計 → 實作 → 測試 → 審查 → 驗證
3. **可清理** - 測試完成後可完全刪除，不留痕跡
4. **可重複** - 每次測試產生一致的結果

---

## 情境 A：健康檢查 API

### 需求描述

```
「建立一個 /api/health 端點，返回服務狀態和版本資訊。
要求：
- 返回 JSON 格式
- 包含 status、version、timestamp 欄位
- 有對應的單元測試
- TypeScript 實作」
```

### 預期流程與驗證點

| 階段 | 觸發 | 驗證點 |
|------|------|--------|
| 1. 需求分析 | `prompt-classifier.js` | 識別為 `action` + `newFeature` |
| 2. 任務分解 | `task-decomposition-engine.js` | 生成 3-5 個子任務 |
| 3. 規格生成 | `/spec health-api` | `.vibe-engine/specs/health-api.yaml` |
| 4. 架構設計 | `architect` agent | 輸出 API 結構設計 |
| 5. 實作 | `developer` agent | 創建 `src/api/health.ts` |
| 6. 測試 | `tester` agent | 創建 `tests/health.test.ts` |
| 7. 審查 | `reviewer` agent | 輸出審查意見 |
| 8. 驗證 | `/verify` | 報告顯示 PASS |

### 產出檔案

```
src/
└── api/
    └── health.ts          # 主程式

tests/
└── health.test.ts         # 測試檔案

.vibe-engine/
├── specs/
│   └── health-api.yaml    # 規格
├── tasks/
│   └── health-api/        # 任務記錄
└── verification/
    └── health-api.json    # 驗證報告
```

### 清理指令

```bash
rm -rf src/api/health.ts tests/health.test.ts
rm -rf .vibe-engine/specs/health-api.yaml
rm -rf .vibe-engine/tasks/health-api/
```

---

## 情境 B：設定頁面組件

### 需求描述

```
「建立一個 React 設定頁面組件 SettingsPage，包含：
- 用戶偏好設定表單
- 主題切換（亮/暗）
- 語言選擇下拉選單
- 儲存按鈕
需要有 TypeScript 類型定義和基本測試」
```

### 預期流程與驗證點

| 階段 | 驗證點 |
|------|--------|
| 規格 | 包含 inputs (formData)、outputs (onSave callback) |
| 設計 | 定義 Props interface、state 結構 |
| 實作 | 創建 TSX 組件 + CSS/Styles |
| 測試 | 渲染測試 + 互動測試 |
| 審查 | 無安全問題、符合 React 最佳實踐 |

### 產出檔案

```
src/
└── components/
    └── SettingsPage/
        ├── index.tsx
        ├── SettingsPage.tsx
        ├── SettingsPage.styles.ts
        └── types.ts

tests/
└── components/
    └── SettingsPage.test.tsx
```

### 清理指令

```bash
rm -rf src/components/SettingsPage/
rm -rf tests/components/SettingsPage.test.tsx
```

---

## 情境 C：資料處理工具

### 需求描述

```
「建立一個 CSV 解析工具函式庫，功能：
- 解析 CSV 字串為物件陣列
- 支援自訂分隔符
- 處理引號包圍的欄位
- 錯誤處理（格式錯誤）
需要完整的 JSDoc 文件和測試覆蓋」
```

### 產出檔案

```
src/
└── utils/
    └── csv-parser/
        ├── index.ts
        ├── parser.ts
        └── types.ts

tests/
└── utils/
    └── csv-parser.test.ts
```

---

## 情境 D：錯誤修復流程

### 需求描述

```
「修復以下 TypeScript 錯誤：
src/api/users.ts:42 - Type 'string' is not assignable to type 'number'
src/api/users.ts:56 - Property 'email' does not exist on type 'User'
」
```

### 預期流程

| 階段 | 驗證點 |
|------|--------|
| 錯誤分類 | `error-handler.js` 識別為 `typescript_error` |
| 診斷 | `debugger` agent 分析根本原因 |
| 修復 | `developer` agent 修正類型 |
| 驗證 | `tsc --noEmit` 通過 |

### 觸發 Auto-Fix Loop

故意引入 3+ 錯誤，測試：
1. 迭代 1: 修復 → 仍有錯誤 → 繼續
2. 迭代 2: 修復 → 仍有錯誤 → 繼續
3. 迭代 3: 修復 → 仍有錯誤 → **ESCALATE**

---

## 執行步驟

### 準備環境

```bash
# 1. 進入測試專案
cd ~/projects/vibe-test

# 2. 確保乾淨狀態
rm -rf .vibe-engine/
git status  # 確認無未提交變更

# 3. 初始化專案結構（如需要）
mkdir -p src/api src/components src/utils tests
```

### 執行情境 A

```
# 步驟 1: 提交需求
「建立一個 /api/health 端點...」（完整需求）

# 步驟 2: 觀察 hooks 輸出
- prompt-classifier 分類結果
- task-decomposition 任務分解

# 步驟 3: 執行規格生成
/spec health-api

# 步驟 4: 確認 agent 被正確調度
- architect → developer → tester → reviewer

# 步驟 5: 驗證
/verify

# 步驟 6: 檢查產出
ls -la src/api/
cat src/api/health.ts

# 步驟 7: 記錄結果
# 填寫測試報告

# 步驟 8: 清理
rm -rf src/api/health.ts tests/health.test.ts
```

---

## 測試報告模板

```markdown
# E2E 情境測試報告

**日期**: YYYY-MM-DD
**測試專案**: vibe-test
**情境**: A/B/C/D

---

## 流程驗證

| 階段 | Hook/Agent | 觸發 | 輸出正確 |
|------|------------|------|----------|
| 需求分析 | prompt-classifier | ✅/❌ | ✅/❌ |
| 任務分解 | task-decomposition | ✅/❌ | ✅/❌ |
| 規格生成 | /spec | ✅/❌ | ✅/❌ |
| 架構設計 | architect | ✅/❌ | ✅/❌ |
| 實作 | developer | ✅/❌ | ✅/❌ |
| 測試 | tester | ✅/❌ | ✅/❌ |
| 審查 | reviewer | ✅/❌ | ✅/❌ |
| 驗證 | /verify | ✅/❌ | ✅/❌ |

---

## 產出檔案

| 檔案 | 存在 | 內容正確 |
|------|------|----------|
| src/api/health.ts | ✅/❌ | ✅/❌ |
| tests/health.test.ts | ✅/❌ | ✅/❌ |
| .vibe-engine/specs/health-api.yaml | ✅/❌ | ✅/❌ |

---

## 記憶系統驗證

| 項目 | 結果 |
|------|------|
| observation-collector 收集 | X 筆 |
| memory-consolidation 整合 | X 新 / X 更新 |
| /recall 可檢索 | ✅/❌ |

---

## 問題與觀察

1. ...
2. ...

---

## 清理確認

- [ ] 所有測試產出檔案已刪除
- [ ] .vibe-engine/ 狀態已清理
- [ ] git status 顯示乾淨
```

---

## 驗證清單總表

### Hooks 觸發驗證

| Hook | 事件 | 情境 A | 情境 B | 情境 C | 情境 D |
|------|------|--------|--------|--------|--------|
| session-init | SessionStart | ✅ | ✅ | ✅ | ✅ |
| prompt-classifier | UserPromptSubmit | ✅ | ✅ | ✅ | ✅ |
| task-decomposition | UserPromptSubmit | ✅ | ✅ | ✅ | - |
| budget-tracker | Pre/PostToolUse | ✅ | ✅ | ✅ | ✅ |
| observation-collector | PostToolUse | ✅ | ✅ | ✅ | ✅ |
| memory-consolidation | Stop | ✅ | ✅ | ✅ | ✅ |
| error-handler | SubagentStop | - | - | - | ✅ |

### Agents 調度驗證

| Agent | 情境 A | 情境 B | 情境 C | 情境 D |
|-------|--------|--------|--------|--------|
| explorer | - | - | - | ✅ |
| architect | ✅ | ✅ | ✅ | - |
| developer | ✅ | ✅ | ✅ | ✅ |
| tester | ✅ | ✅ | ✅ | - |
| reviewer | ✅ | ✅ | ✅ | - |
| debugger | - | - | - | ✅ |

---

## 最佳情境選擇

| 需求 | 建議情境 |
|------|----------|
| 快速驗證基本流程 | 情境 A（最簡單） |
| 驗證前端組件流程 | 情境 B |
| 驗證工具函式開發 | 情境 C |
| 驗證錯誤恢復機制 | 情境 D |
| 完整 E2E 驗證 | 依序執行 A → B → D |
