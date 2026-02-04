---
name: verification-protocol
description: ⛔ MANDATORY after ANY implementation phase completes. MUST run verification BEFORE marking task as done. CRITICAL - 未執行驗證禁止標記任務完成。
version: 0.1.0
---

# Verification Protocol

## 用途

執行多層驗證協議，確保代碼變更符合規格、通過測試、無安全問題。這是閉環驗證的核心能力，防止不完整的任務被標記為完成。

## ⛔ MANDATORY: 觸發條件

以下情況 **MUST** 使用此 skill：
- 實作階段完成後
- 用戶說「驗證」、「檢查」、「確認完成」
- 準備提交 PR 或合併前
- 任何代碼變更後

⛔ BLOCK: 未執行驗證就標記任務完成，禁止。

## ⛔ MANDATORY: 驗證完成 Checkpoint

執行驗證後 **MUST** 輸出：
```
[CHECKPOINT] Verification Complete
├─ 驗證層級：minimal | standard | thorough
├─ Static Analysis：PASS | FAIL
├─ Tests：X passed, Y failed
├─ Coverage：Z%
├─ 阻斷問題：N (P0/P1)
└─ 狀態：APPROVED | BLOCKED
```

⛔ BLOCK: 未輸出 verification checkpoint 禁止標記任務完成
⛔ BLOCK: 有 P0 阻斷問題禁止標記任務完成

## 核心流程

1. **選擇驗證層級** - 根據變更類型和預算選擇
2. **執行 Static Analysis** - 語法檢查、lint
3. **執行測試** - 單元測試、整合測試
4. **LLM Judge** - AI 審查代碼品質
5. **生成報告** - 輸出驗證結果

## 驗證層級

### Minimal（快速驗證）

適用：純格式修改、文檔更新、配置變更

```bash
# Layer 1 only
npm run typecheck
npm run lint
```

### Standard（標準驗證）

適用：一般功能開發

```bash
# Layer 1: Static Analysis
npm run typecheck
npm run lint

# Layer 2: Unit Tests
npm run test

# Layer 5: LLM Judge
# (Prompt-based code review)
```

### Thorough（完整驗證）

適用：API 變更、安全相關、架構調整

```bash
# Layer 1-6 全部執行
npm run typecheck
npm run lint
npm run test
npm run test:integration
npm run security:scan
# + LLM Judge
# + Architect Review
```

## 驗證標準優先級

| 等級 | 標準 | 說明 |
|------|------|------|
| P0 | NO_SYNTAX_ERRORS | 必須通過 |
| P0 | CODE_COMPILES | 必須通過 |
| P1 | TESTS_PASS | 應該通過 |
| P1 | LINT_PASS | 應該通過 |
| P2 | COVERAGE > 80% | 最好通過 |

## 預算感知

驗證層級會根據剩餘預算自動調整：

| 剩餘預算 | 驗證層級 |
|----------|----------|
| > 30% | Standard/Thorough |
| 10-30% | Minimal + 關鍵測試 |
| < 10% | Layer 1 only |

## 重要規則

- P0 驗證失敗 → 任務標記為失敗
- P1 驗證失敗 → 警告但可繼續
- 安全相關變更 → 強制 Thorough 驗證
- 驗證預留 20% 預算

## 輸出格式

<!-- TODO: 細化輸出格式 -->

```yaml
verification_report:
  level: "minimal | standard | thorough"
  status: "pass | fail | partial"
  layers:
    static_analysis:
      status: "pass | fail"
      issues: []
    unit_tests:
      status: "pass | fail"
      passed: 42
      failed: 0
      coverage: "85%"
    llm_judge:
      verdict: "approve | concerns"
      notes: ["[觀察]"]
  blocking_issues:
    - "[必須修復的問題]"
  recommendations:
    - "[建議改善的地方]"
```

## 更多資訊

- 驗證層級詳細說明見 [02-verification.md](../../../../docs/research/02-verification.md)
