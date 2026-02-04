---
name: verify
description: 執行驗證協議，確保代碼變更符合規格並通過測試
---

# /verify

## 概述

執行多層驗證協議，確保代碼變更符合規格、通過測試、無安全問題。支援不同驗證層級以平衡速度和完整性。

## 使用方式

- `/verify` - 執行標準驗證
- `/verify minimal` - 只執行靜態分析
- `/verify thorough` - 執行完整驗證（包含架構審查）
- `/verify [spec-name]` - 驗證特定規格的實作

## 參數

| 參數 | 必要 | 描述 |
|------|------|------|
| `[level]` | 否 | 驗證層級：minimal, standard, thorough |
| `[spec-name]` | 否 | 要驗證的規格名稱 |

## 驗證層級

| 層級 | 內容 | 適用場景 |
|------|------|----------|
| minimal | 靜態分析 | 文檔/配置變更 |
| standard | 靜態分析 + 測試 + LLM Judge | 一般功能開發 |
| thorough | 全部 + 架構審查 | API 變更、安全相關 |

## 執行步驟

1. 確定驗證層級（根據參數或自動判斷）
2. 執行 Layer 1: 靜態分析（typecheck, lint）
3. 執行 Layer 2: 單元測試
4. 執行 Layer 3: 整合測試（如適用）
5. 執行 Layer 5: LLM Judge
6. 執行 Layer 6: 架構審查（如 thorough）
7. 生成驗證報告

## 輸出範例

```
╔══════════════════════════════════════════════════╗
║           Verification Report                    ║
╠══════════════════════════════════════════════════╣
║ Level: standard                                  ║
║ Status: ✅ PASS                                  ║
╠══════════════════════════════════════════════════╣
║ Layer 1: Static Analysis                         ║
║ ├─ TypeCheck: ✅ Pass                            ║
║ └─ Lint: ✅ Pass (0 errors, 2 warnings)          ║
╠══════════════════════════════════════════════════╣
║ Layer 2: Unit Tests                              ║
║ ├─ Tests: 42 passed, 0 failed                    ║
║ └─ Coverage: 85%                                 ║
╠══════════════════════════════════════════════════╣
║ Layer 5: LLM Judge                               ║
║ └─ Verdict: ✅ Approved                          ║
║   └─ Notes: Code is clean and follows patterns   ║
╚══════════════════════════════════════════════════╝
```

## 相關命令

- `/spec` - 生成規格
- `/status` - 查看系統狀態

## 對應章節

- Ch2 閉環驗證
- skill: verification-protocol

<!-- TODO: 整合 verification-protocol skill -->
