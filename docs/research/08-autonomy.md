# 8. 自主等級

## 問題定義

如何讓 Agent 在低風險任務自動執行，高風險任務需要人類批准？

---

## 子問題拆解

### 8.1 自主等級定義

**問題**：應該有幾個等級？每個等級的邊界是什麼？

**現有認知**：
```
L0 無自主    - 人類完全控制
L1 輔助      - AI 建議，人類決定
L2 部分自主  - AI 執行低風險任務
L3 條件自主  - AI 執行，人類批准關鍵點
L4 高度自主  - AI 主導，人類監控
L5 完全自主  - AI 完全自主
```

**待解決**：
- [ ] 每個等級的具體行為規範？
- [ ] Vibe Engine 應該支援到哪個等級？
- [ ] 預設應該是哪個等級？

---

### 8.2 風險分類

**問題**：如何判斷一個操作的風險等級？

**現有認知**：
```yaml
risk_classification:
  high:
    - pattern: "*.migration.*"
    - pattern: "*security*"
    - pattern: "*auth*"
    - pattern: "rm -rf"
    - pattern: "DROP TABLE"

  low:
    - pattern: "*.test.*"
    - pattern: "*.md"
    - pattern: "*.css"
```

**待解決**：
- [ ] Pattern 匹配是否足夠？需要語義理解嗎？
- [ ] 如何處理未知風險？
- [ ] 風險分類如何自定義？

---

### 8.3 Human-in-the-Loop 設計

**問題**：需要人類介入時，如何設計互動流程？

**現有認知**：
- 暫停執行
- 顯示上下文和選項
- 等待用戶決定
- 根據決定繼續或終止

**待解決**：
- [ ] 暫停點如何選擇？
- [ ] 提供給用戶的資訊應該有多詳細？
- [ ] 用戶不回應時如何處理？

---

### 8.4 批准流程

**問題**：批准流程應該如何設計？

**現有認知**：
```yaml
approval:
  require_for:
    - architecture_changes
    - security_code
    - database_migration
    - production_deployment

  options:
    - approve: 繼續執行
    - reject: 終止任務
    - modify: 修改後重試
```

**待解決**：
- [ ] 如何展示「待批准」的變更？
- [ ] 批准是否需要記錄？
- [ ] 批量批准是否允許？

---

### 8.5 自動升降級

**問題**：何時自動調整自主等級？

**現有認知**：
- 連續成功 → 考慮升級
- 連續失敗 → 考慮降級
- 風險變化 → 即時調整

**待解決**：
- [ ] 升降級的具體觸發條件？
- [ ] 升降級是否需要用戶確認？
- [ ] 如何避免頻繁切換？

---

## 現有方案

### Thoughtworks 實驗
- 發現 AI 會「即使測試失敗也宣稱成功」
- 結論：人類監督仍然必要

### Martin Fowler
- "Autonomy is a dial, not a switch"
- 風險基礎的自主控制

### 業界共識
- "AI agents are powerful teammates, not autonomous committers"
- "AI agents can propose code, never own it"

---

## 我們的解法

### 8.1 解法：自主等級定義

**等級行為規範**：
```yaml
autonomy_levels:
  L0_none:
    name: 無自主
    behavior:
      - 每個操作都需要用戶確認
      - 僅提供建議，不執行
    use_case: 學習模式、敏感環境
    ui: 每步都顯示 "確認執行？[Y/n]"

  L1_assist:
    name: 輔助
    behavior:
      - 讀取操作自動執行
      - 寫入操作需要確認
      - 提供詳細說明
    use_case: 新用戶、不熟悉的專案

  L2_partial:
    name: 部分自主
    behavior:
      - 低風險操作自動執行
      - 中風險操作需要確認
      - 高風險操作阻止並說明
    use_case: 一般日常開發（預設）

  L3_conditional:
    name: 條件自主
    behavior:
      - 大部分操作自動執行
      - 僅關鍵點需要確認
      - 定期報告進度
    use_case: 熟悉的專案、信任的任務

  L4_high:
    name: 高度自主
    behavior:
      - 幾乎所有操作自動執行
      - 僅不可逆操作需確認
      - 完成後彙報
    use_case: 批次處理、CI/CD 環境

  L5_full:
    name: 完全自主
    behavior:
      - 所有操作自動執行
      - 無人工介入
    use_case: 不建議用於生產
    warning: 可能導致不可預期的結果
```

**Vibe Engine 支援範圍**：
```yaml
supported_levels:
  implemented: [L0, L1, L2, L3]
  experimental: [L4]
  not_supported: [L5]

  default: L2

  rationale: |
    L5 完全自主目前風險太高，因為：
    - AI 可能「宣稱成功但實際失敗」(Thoughtworks 研究)
    - 無法保證所有邊界情況都處理正確
    - 不可逆操作可能造成損失
```

---

### 8.2 解法：風險分類

**風險評估方法**：
```yaml
risk_assessment:
  method: pattern_matching + semantic_analysis

  pattern_matching:
    high_risk_patterns:
      files:
        - "**/auth/**"
        - "**/security/**"
        - "**/*.env*"
        - "**/credentials*"
        - "**/migration*"
      commands:
        - "rm -rf"
        - "DROP TABLE"
        - "DELETE FROM"
        - "git push --force"
        - "npm publish"

    low_risk_patterns:
      files:
        - "**/*.test.*"
        - "**/*.spec.*"
        - "**/*.md"
        - "**/*.css"
        - "**/*.json" (non-config)
      operations:
        - read_only
        - formatting
        - comment_changes

  semantic_analysis:
    enabled: true
    use_when: pattern_not_decisive
    prompt: |
      評估以下操作的風險等級：
      操作：{operation}
      上下文：{context}

      風險等級：LOW / MEDIUM / HIGH
      理由：{reason}
```

**未知風險處理**：
```yaml
unknown_risk_handling:
  default: MEDIUM

  escalation_rules:
    - involves_external_systems: HIGH
    - modifies_multiple_files: MEDIUM
    - first_time_operation: ask_user

  learning:
    track: user_responses_to_approvals
    adjust: if user always approves X, consider lowering risk
```

**自定義風險分類**：
```yaml
custom_risk_config:
  location: .vibe-engine/risk-config.yaml

  schema:
    high_risk:
      files: string[]
      patterns: string[]
      operations: string[]

    low_risk:
      files: string[]
      patterns: string[]

    overrides:
      - match: "specific/path"
        risk: LOW | MEDIUM | HIGH

  example:
    high_risk:
      files:
        - "src/billing/**"  # 專案特定的敏感區域
      operations:
        - "npm run deploy"

    low_risk:
      files:
        - "src/components/ui/**"  # 專案特定的安全區域
```

---

### 8.3 解法：Human-in-the-Loop 設計

**暫停點選擇**：
```yaml
pause_points:
  automatic:
    - before_high_risk_operation
    - after_n_consecutive_failures: 3
    - when_confidence_low: < 0.5
    - at_decision_branch: multiple_valid_options

  configurable:
    - before_every_file_write: L0, L1
    - before_external_api_call: L0, L1, L2
    - after_each_agent_completion: L0

  smart_pause:
    description: 自動識別好的暫停時機
    criteria:
      - 階段性完成點
      - 有意義的決定點
      - 用戶可能想檢視的時機
```

**用戶資訊呈現**：
```yaml
approval_prompt:
  format:
    summary: 1-2 句摘要
    detail: 可展開的詳細資訊
    risk: 風險標示
    options: 清晰的選項

  example: |
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    🔒 需要確認：修改安全相關檔案

    將修改 src/auth/validateToken.ts
    ├── 新增 token 過期檢查
    └── 更新錯誤處理邏輯

    風險：🟡 中等 (涉及認證邏輯)

    [A]pprove  [V]iew diff  [R]eject  [M]odify
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  detail_on_demand:
    V: 顯示完整 diff
    ?: 解釋為什麼需要這個變更
```

**無回應處理**：
```yaml
no_response_handling:
  timeout:
    interactive: 5m  # 互動模式
    background: 30m  # 背景模式

  actions:
    on_timeout:
      low_risk:
        action: proceed_with_warning
        log: "Auto-approved after timeout"

      medium_risk:
        action: pause_and_notify
        notification: "任務等待您的確認"

      high_risk:
        action: abort_operation
        save: checkpoint
        message: "高風險操作已因超時取消"

  notification_channels:
    - terminal_bell
    - system_notification (if available)
    - log_file
```

---

### 8.4 解法：批准流程

**變更展示方式**：
```yaml
change_presentation:
  summary_view:
    show:
      - files_affected: count and names
      - change_type: add | modify | delete
      - risk_level: with color coding
      - estimated_impact: brief description

  diff_view:
    format: unified_diff
    context_lines: 3
    syntax_highlighting: true
    additions: green
    deletions: red

  explanation_view:
    show:
      - why_this_change: AI 的推理
      - alternatives_considered: 其他選項
      - potential_risks: 可能的問題
```

**批准記錄**：
```yaml
approval_logging:
  enabled: true
  location: .vibe-engine/approvals.jsonl

  record_fields:
    - timestamp
    - task_id
    - operation
    - risk_level
    - user_decision: approve | reject | modify
    - response_time_ms
    - context: what was shown to user

  analytics:
    track:
      - approval_rate_by_risk_level
      - average_response_time
      - common_rejection_reasons
```

**批量批准**：
```yaml
batch_approval:
  enabled: true
  conditions:
    - same_risk_level
    - same_operation_type
    - within_same_task

  presentation: |
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    📦 批量確認：5 個類似操作

    1. 修改 src/components/Button.tsx
    2. 修改 src/components/Input.tsx
    3. 修改 src/components/Select.tsx
    4. 修改 src/components/Checkbox.tsx
    5. 修改 src/components/Radio.tsx

    變更類型：新增 TypeScript 類型定義
    風險：🟢 低

    [A]pprove all  [1-5] Review individually  [R]eject all
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  safety:
    max_batch_size: 10
    exclude_high_risk: true
```

---

### 8.5 解法：自動升降級

**升級觸發條件**：
```yaml
upgrade_triggers:
  from_L1_to_L2:
    conditions:
      - consecutive_approvals: 10
      - no_rejections_in: 20 operations
      - session_duration: > 30m

  from_L2_to_L3:
    conditions:
      - consecutive_successful_tasks: 5
      - user_explicitly_trusts: true
      - project_familiarity: high

  implementation:
    prompt_user: true
    message: |
      建議提升自主等級：L{current} → L{proposed}

      原因：
      - 連續 {n} 次操作都獲得批准
      - 本次會話無拒絕記錄

      是否同意？[Y/n]
```

**降級觸發條件**：
```yaml
downgrade_triggers:
  immediate_downgrade:
    - user_rejects_operation
    - critical_error_occurred
    - security_violation_detected

  gradual_downgrade:
    - failure_rate: > 30% in last 10 operations
    - user_modifies_output: > 50% of time
    - repeated_same_error: 3 times

  implementation:
    auto_downgrade: true
    notify_user: true
    message: |
      ⚠️ 自主等級已降低：L{old} → L{new}

      原因：{reason}

      這意味著更多操作將需要您的確認。
```

**防止頻繁切換**：
```yaml
level_stability:
  minimum_duration_per_level: 10 operations

  hysteresis:
    upgrade_threshold: high (need strong signal)
    downgrade_threshold: low (quick to protect)

  cooling_period:
    after_downgrade: 20 operations before considering upgrade
    after_upgrade: 10 operations before considering downgrade

  manual_override:
    user_can_set_level: true
    user_can_lock_level: true
    locked_level_duration: session | permanent
```

---

## 參考資源

- [The 5 Levels of AI Autonomy - Turian](https://www.turian.ai/blog/the-5-levels-of-ai-autonomy)
- [HITL vs Autonomous - ISHIR](https://www.ishir.com/blog/312060/human-in-the-loop-vs-autonomous-development-for-enterprise-software.htm)
- [Pushing AI Autonomy - Martin Fowler](https://martinfowler.com/articles/pushing-ai-autonomy.html)
