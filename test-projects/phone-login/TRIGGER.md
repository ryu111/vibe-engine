# 測試觸發詞

> 用於驗證 Vibe Engine 完整工作流（prompt-classifier → task-decomposition → agent-router → verification）

## 觸發指令

```
幫我在 test-projects/phone-login 專案中加入忘記密碼功能，要有 UI 和驗證邏輯
```

## 預期工作流

1. `prompt-classifier` 辨識為 `implement` 類型任務
2. `spec-generator` 自動觸發，生成 spec.yaml
3. `task-decomposition` 自動分解任務，分配 agents
4. `agent-router` 路由給 Architect → Developer → Tester → Reviewer
5. `verification-protocol` 自動驗證實作結果
6. `health-check` 報告代碼品質

## 驗收標準

- [ ] 全程無需用戶手動觸發任何 mandatory skill
- [ ] Agent 分工正確（Main Agent 不直接寫代碼）
- [ ] 驗證閉環自動執行
- [ ] 測試通過（12 原有 + 新增測試）
