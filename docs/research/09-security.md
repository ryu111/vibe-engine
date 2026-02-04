# 9. 安全權限

## 問題定義

如何防止 Agent 執行未授權的操作，同時不過度限制其能力？

---

## 子問題拆解

### 9.1 Zero Trust 原則

**問題**：如何將 Zero Trust 應用到 AI Agent？

**現有認知**：
```yaml
zero_trust:
  principles:
    - never_trust_always_verify
    - least_privilege
    - assume_breach

  controls:
    - verify_identity
    - enforce_permissions
    - detect_anomalies
    - observe_behavior
```

**待解決**：
- [ ] Agent 的「身份」如何定義和驗證？
- [ ] 「最小權限」在 Agent 場景如何實施？
- [ ] 異常行為的判斷標準？

---

### 9.2 權限模型

**問題**：Agent 的權限應該如何定義？

**現有認知**：
```yaml
permission_model:
  type: zero_trust
  default: deny

  allow_list:
    - tool: Read
      scope: project_files
    - tool: Grep
      scope: project_files
    - tool: Bash
      scope: safe_commands

  dangerous_operations:
    - pattern: "rm -rf"
      action: block
    - pattern: "*.env"
      action: require_approval
```

**待解決**：
- [ ] 權限粒度應該多細？
- [ ] 如何處理權限繼承（SubAgent 繼承 Main Agent）？
- [ ] 權限如何動態調整？

---

### 9.3 多層安全架構

**問題**：需要哪些安全層？每層做什麼？

**現有認知**：
```
Layer 1: Gateway
├── 集中路由、政策執行
├── 身份驗證、權限檢查
└── 異常檢測、行為監控

Layer 2: Validation Agent
├── 專門 Agent 審查安全問題
└── 代碼安全掃描

Layer 3: Execution Sandbox
├── Docker 容器隔離
├── 無網路存取
└── 最小系統權限

Layer 4: Static Analysis
├── 漏洞掃描
└── 執行前檢查
```

**待解決**：
- [ ] 每層的具體實作方式？
- [ ] 層之間如何通訊？
- [ ] 哪些層是必須的、哪些可選？

---

### 9.4 危險操作檢測

**問題**：如何識別和阻擋危險操作？

**現有認知**：
- 模式匹配（rm -rf, DROP TABLE）
- 敏感文件檢測（.env, credentials）
- 網路請求監控

**待解決**：
- [ ] 模式匹配的完整清單？
- [ ] 如何處理間接危險（組合起來才危險）？
- [ ] 誤判時如何處理？

---

### 9.5 Sandbox 的侷限

**問題**：Sandbox 不能解決什麼問題？

**現有認知**：
```
Sandbox 能做的：
✅ 隔離執行環境
✅ 限制文件系統存取
✅ 防止影響主機

Sandbox 不能做的：
❌ 判斷行動是否適當
❌ 限制跨系統的能力
❌ 驗證意圖
```

**待解決**：
- [ ] 如何補充 Sandbox 的不足？
- [ ] 意圖驗證如何實現？
- [ ] 跨系統能力的控制方式？

---

### 9.6 授權繞過風險

**問題**：如何防止用戶透過 Agent 存取未授權資源？

**現有認知**：
```
傳統模型：
User (權限 A) → System → 只能存取 A

AI Agent 模型：
User (權限 A) → Agent (權限 A+B+C) → 可能存取 B, C
                    ↑
                授權繞過風險
```

**待解決**：
- [ ] Agent 的權限如何與用戶權限關聯？
- [ ] 如何實現「Agent 權限 ≤ 用戶權限」？
- [ ] 審計如何追蹤？

---

## 現有方案

### Microsoft
- AI Agent 適用 Zero Trust 原則
- Web Bot Authentication

### OWASP
- AI Agent Security Top 10
- 系統性的安全風險清單

### Arcade
- "Sandboxes aren't enough for agent safety"
- 需要意圖驗證層

---

## 我們的解法

### 9.1 解法：Zero Trust 原則

**Agent 身份定義與驗證**：
```yaml
agent_identity:
  definition:
    agent_id: unique identifier
    agent_type: main | subagent | tool
    created_at: timestamp
    created_by: parent_agent_id | system
    permissions: PermissionSet

  verification:
    method: capability_based
    implementation:
      - agent 創建時分配唯一 token
      - 每次操作驗證 token 有效性
      - token 包含權限範圍

  token_structure:
    format: JWT-like
    payload:
      agent_id: string
      permissions: string[]
      expires_at: timestamp
      scope: task_id
    signed_by: orchestrator
```

**最小權限實施**：
```yaml
least_privilege:
  principle: agent 只獲得完成當前任務所需的最小權限

  implementation:
    static_permissions:
      - 基於 agent 類型的基礎權限
      - 在 agent 定義時設定

    dynamic_permissions:
      - 根據具體任務動態授予
      - 任務完成後自動撤銷

  example:
    developer_agent:
      static:
        - read: project_files
        - execute: safe_commands
      dynamic:
        for_task_123:
          - write: ["src/auth.ts", "src/user.ts"]
          - execute: ["npm test", "npm run build"]
```

**異常行為判斷標準**：
```yaml
anomaly_detection:
  behavioral_baselines:
    normal_developer:
      file_edits_per_task: 5-20
      bash_commands_per_task: 10-30
      api_calls_per_minute: 1-5

  anomaly_signals:
    high_severity:
      - accessing_env_files: without explicit permission
      - executing_network_commands: curl, wget to unknown hosts
      - bulk_file_deletion: > 10 files

    medium_severity:
      - file_edits_spike: > 3x baseline
      - accessing_unrelated_files: outside task scope
      - repeated_permission_denials: > 5

  response:
    high_severity:
      - block_immediately
      - alert_user
      - create_incident_log
    medium_severity:
      - increase_monitoring
      - request_confirmation
```

---

### 9.2 解法：權限模型

**權限粒度**：
```yaml
permission_granularity:
  levels:
    tool_level:
      example: "can use Edit tool"
      granularity: coarse

    scope_level:
      example: "can use Edit on src/**"
      granularity: medium

    operation_level:
      example: "can Edit src/auth.ts, add only, no delete"
      granularity: fine

  recommended: scope_level
  rationale: |
    - 太粗：無法限制危險操作
    - 太細：管理成本過高，Agent 頻繁被阻擋
    - 適中：平衡安全性和可用性
```

**權限繼承**：
```yaml
permission_inheritance:
  rule: SubAgent 權限 ⊆ Main Agent 權限

  implementation:
    on_subagent_creation:
      1. Main Agent 請求創建 SubAgent
      2. 指定 SubAgent 需要的權限
      3. Orchestrator 驗證：requested ⊆ main_agent.permissions
      4. 如果驗證通過，創建 SubAgent
      5. 否則，拒絕並說明缺少哪些權限

  escalation:
    subagent_needs_more:
      action: 回報給 Main Agent
      main_can: request_from_user (如果在允許範圍內)
```

**權限動態調整**：
```yaml
dynamic_permissions:
  expansion:
    trigger:
      - user_grants_permission
      - task_requires_new_capability
    process:
      1. Agent 請求額外權限
      2. 顯示請求給用戶（如果需要）
      3. 用戶批准/拒絕
      4. 更新 Agent 的權限集

  contraction:
    trigger:
      - task_completion
      - timeout
      - security_incident
    process:
      - 自動撤銷動態授予的權限
      - 保留靜態基礎權限

  audit_trail:
    log_all_permission_changes: true
    fields:
      - timestamp
      - agent_id
      - permission
      - action: grant | revoke
      - reason
```

---

### 9.3 解法：多層安全架構

**各層實作方式**：
```yaml
security_layers:
  layer_1_gateway:
    responsibility:
      - 集中路由所有請求
      - 政策執行點
      - 異常檢測
    implementation:
      class: SecurityGateway
      methods:
        - validateRequest(request): ValidationResult
        - enforcePolicy(action): boolean
        - logAccess(request, result): void

  layer_2_validation_agent:
    responsibility:
      - 審查代碼安全問題
      - 檢測敏感資料洩漏
    implementation:
      type: specialized_agent
      model: sonnet (security-focused prompt)
      trigger:
        - before_file_write
        - before_commit
      check_for:
        - hardcoded_secrets
        - sql_injection
        - xss_vulnerabilities

  layer_3_sandbox:
    responsibility:
      - 隔離執行環境
      - 限制系統存取
    implementation:
      method: docker_container (optional)
      restrictions:
        - read_only_root_filesystem
        - no_network (by default)
        - limited_memory: 512MB
        - limited_cpu: 1 core
      alternative: process_sandboxing
        - restricted_syscalls
        - chroot (if available)

  layer_4_static_analysis:
    responsibility:
      - 執行前漏洞掃描
      - 依賴安全檢查
    implementation:
      tools:
        - semgrep: code patterns
        - npm_audit: dependencies
        - trivy: container images
      timing: before_commit
```

**層間通訊**：
```yaml
layer_communication:
  pattern: chain_of_responsibility

  flow:
    request
      → Layer 1 (Gateway): validate credentials & policy
      → Layer 2 (Validation Agent): security review
      → Layer 3 (Sandbox): isolated execution
      → Layer 4 (Static Analysis): final check
      → result

  short_circuit:
    any_layer_fails: abort and report
    no_need_all_layers: low_risk can skip Layer 2, 4
```

**必要 vs 可選層**：
```yaml
layer_requirements:
  always_required:
    - Layer 1 (Gateway): 基本安全不可跳過

  conditionally_required:
    - Layer 2 (Validation): 涉及安全相關代碼時
    - Layer 4 (Static Analysis): 修改代碼時

  optional_enhanced:
    - Layer 3 (Sandbox): 用戶選擇啟用
      rationale: 增加延遲和複雜度
```

---

### 9.4 解法：危險操作檢測

**完整模式清單**：
```yaml
dangerous_patterns:
  file_system:
    critical:
      - "rm -rf /"
      - "rm -rf ~"
      - "rm -rf *"
      - "> /dev/sda"
    dangerous:
      - "rm -rf" (any)
      - "chmod 777"
      - "chown root"

  database:
    critical:
      - "DROP DATABASE"
      - "DROP TABLE" (without WHERE)
      - "TRUNCATE"
    dangerous:
      - "DELETE FROM" (without WHERE)
      - "UPDATE" (without WHERE)

  network:
    suspicious:
      - "curl" to unknown hosts
      - "wget"
      - "nc -l" (netcat listen)
      - reverse_shell_patterns

  secrets:
    never_allowed:
      - reading .env files without permission
      - outputting API keys
      - committing credentials
```

**間接危險檢測**：
```yaml
indirect_danger:
  examples:
    - "echo 'rm -rf /' > script.sh && bash script.sh"
    - "base64 encoded malicious commands"
    - "downloading and executing scripts"

  detection:
    method: semantic_analysis + simulation
    implementation:
      1. 解析命令語義
      2. 追蹤資料流
      3. 評估最終影響
      4. 如果不確定 → 請求確認

  compound_commands:
    track: command chains (&&, ||, ;, |)
    evaluate: combined effect
```

**誤判處理**：
```yaml
false_positive_handling:
  when_blocked:
    show_reason: "此操作被阻擋因為：{reason}"
    options:
      - override: user can force execute (with confirmation)
      - whitelist: add to allowed_patterns for this project
      - report: flag as false positive

  override_flow:
    1. 用戶請求覆寫
    2. 顯示風險警告
    3. 要求明確確認 (type YES to confirm)
    4. 記錄到審計日誌
    5. 執行操作

  whitelist_management:
    location: .vibe-engine/security-whitelist.yaml
    format:
      patterns:
        - pattern: "npm run deploy"
          reason: "project's standard deploy command"
          added_by: user
          added_at: timestamp
```

---

### 9.5 解法：Sandbox 的侷限

**補充 Sandbox 不足**：
```yaml
sandbox_supplements:
  action_appropriateness:
    method: intent_verification
    implementation:
      before_execution:
        prompt: |
          你即將執行：{action}
          這個操作是否符合用戶的原始請求：{original_request}？

          回答：YES (符合) 或 NO (不符合)，並說明理由。

      on_no:
        action: block_and_report

  cross_system_control:
    method: egress_monitoring
    implementation:
      - 監控所有對外請求
      - 白名單允許的外部服務
      - 未知目標 → 請求確認

  intent_verification:
    multi_step:
      1. 解析用戶請求的意圖
      2. 將 Agent 的行動與意圖對比
      3. 識別意圖外的行動
    challenge:
      - 意圖可能模糊
      - Agent 可能「創意解讀」
    mitigation:
      - 要求 Agent 說明為何此行動符合意圖
      - 人類確認模糊案例
```

---

### 9.6 解法：授權繞過風險

**Agent 權限與用戶權限關聯**：
```yaml
permission_binding:
  principle: Agent 權限 ≤ 用戶權限

  implementation:
    at_session_start:
      1. 獲取用戶的權限範圍
      2. 設定 Agent 的最大權限 = 用戶權限
      3. 任何超出的請求自動拒絕

    runtime_check:
      before_each_action:
        if action.required_permission > user.permissions:
          reject("權限不足")

  inheritance_model:
    user_permissions:
      - read: all project files
      - write: src/**
      - execute: npm commands

    agent_max_permissions: same as user

    subagent_permissions:
      ≤ agent_permissions ≤ user_permissions
```

**審計追蹤**：
```yaml
audit_trail:
  log_location: .vibe-engine/audit.jsonl

  logged_events:
    - all_file_accesses
    - all_command_executions
    - permission_requests
    - permission_grants_denials
    - security_blocks

  log_format:
    timestamp: ISO8601
    user_id: anonymized_or_actual
    agent_id: string
    action: string
    resource: string
    outcome: allowed | denied | blocked
    reason: string

  retention: 90 days

  analysis:
    automated:
      - unusual_access_patterns
      - permission_escalation_attempts
      - repeated_denials
    alerts:
      - email_on_critical
      - log_on_all
```

---

## 參考資源

- [AI Agent Security 2026 - Microsoft](https://www.microsoft.com/en-us/security/blog/2026/01/20/four-priorities-for-ai-powered-identity-and-network-access-security-in-2026/)
- [OWASP AI Agent Security Top 10](https://medium.com/@oracle_43885/owasps-ai-agent-security-top-10-agent-security-risks-2026-fc5c435e86eb)
- [Docker Sandboxes Aren't Enough - Arcade](https://blog.arcade.dev/docker-sandboxes-arent-enough-for-agent-safety)
- [AI Agents and Identity Risks - CyberArk](https://www.cyberark.com/resources/blog/ai-agents-and-identity-risks-how-security-will-shift-in-2026)
