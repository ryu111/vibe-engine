---
name: spec
description: 生成結構化規格檔案（spec.yaml），作為 SDD+TDD+BDD 開發流程的起點
---

# /spec

## 概述

從自然語言需求生成結構化規格（spec.yaml），定義功能的輸入、輸出、完成標準和測試場景。

## 使用方式

- `/spec` - 啟動互動式規格生成
- `/spec [feature-name]` - 為指定功能生成規格
- `/spec --level 3` - 使用完整規格模板（Level 3）

## 參數

| 參數 | 必要 | 描述 |
|------|------|------|
| `[feature-name]` | 否 | 功能名稱（kebab-case） |
| `--level` | 否 | 規格層級（1=快速, 2=標準, 3=完整） |

## 執行步驟

1. 詢問或確認功能名稱
2. 收集需求描述
3. 識別 inputs 和 outputs
4. 生成測試場景（scenarios）
5. 定義完成標準（done_criteria）
6. 輸出到 `.vibe-engine/specs/{feature-name}.yaml`

## 輸出範例

```yaml
# .vibe-engine/specs/user-login.yaml
spec:
  name: user-login
  description: 用戶登入功能，支援 email/password 認證

  inputs:
    - name: email
      type: string
      constraints: valid email format
    - name: password
      type: string
      constraints: min 8 characters

  outputs:
    - name: token
      type: string
    - name: user
      type: User

  done_criteria:
    - 用戶可以使用有效憑證登入
    - 無效憑證返回適當錯誤
    - 登入成功返回 JWT token

  scenarios:
    - name: successful-login
      given: 用戶存在且密碼正確
      when: 呼叫 login API
      then: 返回 token 和 user 資訊

    - name: invalid-password
      given: 用戶存在但密碼錯誤
      when: 呼叫 login API
      then: 返回 401 錯誤
```

## 相關命令

- `/verify` - 執行驗證協議
- `/status` - 查看系統狀態

## 對應章節

- Ch10 開發方法論
- skill: spec-generator

<!-- TODO: 整合 spec-generator skill -->
