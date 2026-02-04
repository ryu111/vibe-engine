# 7. 可觀測性

## 問題定義

如何讓用戶即時了解 Agent 在做什麼，同時不讓 Log 膨脹失控？

---

## 子問題拆解

### 7.1 結構化 Log 設計

**問題**：Log 應該包含什麼資訊？格式是什麼？

**現有認知**：
```json
{
  "timestamp": "2026-02-04T10:30:00.123Z",
  "level": "INFO",
  "component": "agent.developer",
  "action": "tool_call",
  "tool": "Edit",
  "file": "src/auth.ts",
  "duration_ms": 150,
  "trace_id": "abc123",
  "span_id": "def456",
  "context": {
    "task_id": "task-001",
    "iteration": 3,
    "tokens_used": 256
  }
}
```

**待解決**：
- [ ] 必要欄位 vs 可選欄位？
- [ ] 如何避免敏感資訊進入 Log？
- [ ] Log 的儲存格式（JSON / JSONL / 其他）？

---

### 7.2 Log 分級與保留

**問題**：不同級別的 Log 應該保留多久？

**現有認知**：
```yaml
levels:
  ERROR:
    retention: 90d
    sample_rate: 1.0
  WARN:
    retention: 30d
    sample_rate: 1.0
  INFO:
    retention: 7d
    sample_rate: 1.0
  DEBUG:
    retention: 1d
    sample_rate: 0.1  # 只保留 10%
  TRACE:
    retention: 1h
    sample_rate: 0.01
```

**待解決**：
- [ ] 什麼情況該用哪個級別？
- [ ] Sample rate 如何實作？
- [ ] 如何在需要時獲取完整 DEBUG log？

---

### 7.3 Log 輪轉與壓縮

**問題**：如何防止 Log 佔用過多空間？

**現有認知**：
```yaml
rotation:
  size_based:
    max_size: 100MB
    max_files: 5
  time_based:
    frequency: daily
  compression:
    enabled: true
    format: gzip
    delay: 1h
```

**待解決**：
- [ ] 輪轉時正在寫入怎麼辦？
- [ ] 壓縮對查詢效能的影響？
- [ ] 遠端歸檔的策略？

---

### 7.4 進度事件流

**問題**：如何讓用戶即時看到 Agent 的工作進度？

**現有認知**：
```yaml
# AG-UI 事件類型
events:
  - RUN_STARTED
  - AGENT_ACTIVATED
  - THINKING
  - TOOL_CALL_START
  - TOOL_CALL_END
  - TEXT_MESSAGE_CONTENT
  - PROGRESS_UPDATE
  - ERROR_OCCURRED
  - RUN_FINISHED
```

**待解決**：
- [ ] 事件的傳輸機制（WebSocket / SSE / 輪詢）？
- [ ] 事件的節流策略？
- [ ] 斷線重連時如何補發遺漏事件？

---

### 7.5 OpenTelemetry 整合

**問題**：如何整合標準的可觀測性框架？

**現有認知**：
```yaml
observability:
  tracing:
    enabled: true
    exporter: otlp
    endpoint: http://collector:4317
  metrics:
    interval: 60s
    include:
      - agent_task_duration
      - tool_call_count
      - token_consumption
```

**待解決**：
- [ ] AI Agent 專用的 span 設計？
- [ ] 與現有 APM 工具的整合？
- [ ] 分散式追蹤的實作？

---

### 7.6 TUI Dashboard

**問題**：CLI 環境下如何呈現狀態？

**現有認知**：
```
┌─────────────────────────────────────────────────────────┐
│  VIBE ENGINE - Task Monitor                             │
├─────────────────────────────────────────────────────────┤
│  📋 Current Task: Implement authentication              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 67% ━━━━━            │
│                                                         │
│  🟢 Architect [Completed]                               │
│  🟡 Developer [Working] → Implementing middleware       │
│  ⚪ Tester    [Waiting]                                 │
│                                                         │
│  Tokens: 45.2K / 100K    Time: 5m / 30m                │
└─────────────────────────────────────────────────────────┘
```

**待解決**：
- [ ] TUI 框架的選擇？
- [ ] 更新頻率和效能影響？
- [ ] 如何支援不同終端機大小？

---

## 現有方案

### AG-UI Protocol (Microsoft)
- 標準化的 Agent UI 事件
- 即時狀態流

### OpenTelemetry
- 分散式追蹤標準
- AI Agent 可觀測性擴展

### Ralph TUI
- CLI 下的 Agent loop 可視化
- 即時狀態更新

---

## 我們的解法

### 7.1 解法：結構化 Log 設計

**Log Schema 定義**：
```typescript
interface LogEntry {
  // 必要欄位
  timestamp: string;        // ISO8601 格式
  level: LogLevel;          // ERROR | WARN | INFO | DEBUG | TRACE
  component: string;        // 來源組件 (e.g., "agent.developer")
  message: string;          // 人類可讀的訊息

  // 追蹤欄位
  trace_id: string;         // 貫穿整個請求的 ID
  span_id: string;          // 當前操作的 ID
  parent_span_id?: string;  // 父操作 ID

  // 上下文欄位 (可選)
  context?: {
    task_id?: string;
    agent_id?: string;
    iteration?: number;
    user_id?: string;       // 如果有的話，已脫敏
  };

  // 操作特定欄位 (可選)
  action?: {
    type: string;           // tool_call | api_call | decision
    name?: string;          // 工具名稱
    duration_ms?: number;
    status?: 'start' | 'success' | 'error';
    error?: ErrorInfo;
  };

  // 資源使用 (可選)
  resources?: {
    tokens_used?: number;
    cost_incurred?: number;
  };
}

type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';
```

**敏感資訊過濾**：
```yaml
sensitive_data_filtering:
  patterns:
    api_keys:
      regex: "(sk-|api_key=|apikey=|API_KEY=)[a-zA-Z0-9_-]{20,}"
      replacement: "[REDACTED_API_KEY]"

    passwords:
      regex: "(password|passwd|pwd)([\"']?\\s*[:=]\\s*[\"']?)[^\\s\"']{4,}"
      replacement: "$1$2[REDACTED]"

    tokens:
      regex: "(bearer|token)\\s+[a-zA-Z0-9_.-]{20,}"
      replacement: "[REDACTED_TOKEN]"

    emails:
      regex: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
      replacement: "[REDACTED_EMAIL]"

  file_content:
    files_to_mask:
      - "*.env"
      - "*credentials*"
      - "*secret*"
    action: log_filename_only

  implementation:
    apply_at: log_write_time
    also_apply_to: error_stack_traces
```

**儲存格式**：
```yaml
storage:
  format: jsonl  # 每行一個 JSON 物件
  location: .vibe-engine/logs/

  file_naming:
    pattern: "{date}-{session_id}.jsonl"
    example: "2026-02-04-abc123.jsonl"

  encoding: utf-8
  line_ending: "\n"

  example_output: |
    {"timestamp":"2026-02-04T10:30:00.123Z","level":"INFO","component":"orchestrator","message":"Task started","trace_id":"abc123","span_id":"span1"}
    {"timestamp":"2026-02-04T10:30:01.456Z","level":"DEBUG","component":"agent.developer","message":"Tool call: Edit","trace_id":"abc123","span_id":"span2","action":{"type":"tool_call","name":"Edit","status":"start"}}
```

---

### 7.2 解法：Log 分級與保留

**級別使用指南**：
```yaml
level_guidelines:
  ERROR:
    use_for:
      - 任務失敗
      - 不可恢復的錯誤
      - 需要人類介入的問題
    retention: 90d
    sample_rate: 1.0  # 100% 保留

  WARN:
    use_for:
      - 可恢復的錯誤
      - 效能問題
      - 接近預算限制
    retention: 30d
    sample_rate: 1.0

  INFO:
    use_for:
      - 任務開始/完成
      - 重要決定點
      - 用戶交互
    retention: 7d
    sample_rate: 1.0

  DEBUG:
    use_for:
      - 工具調用細節
      - 中間推理步驟
      - 狀態變化
    retention: 1d
    sample_rate: 0.1  # 只保留 10%

  TRACE:
    use_for:
      - 詳細的 API 請求/回應
      - 完整的 prompt/completion
      - 逐行執行追蹤
    retention: 1h
    sample_rate: 0.01  # 只保留 1%
```

**採樣實作**：
```typescript
class SampledLogger {
  private sampleRates: Record<LogLevel, number>;
  private counters: Record<LogLevel, number> = {};

  shouldLog(level: LogLevel): boolean {
    const rate = this.sampleRates[level];
    if (rate >= 1.0) return true;

    this.counters[level] = (this.counters[level] || 0) + 1;
    return this.counters[level] % Math.round(1 / rate) === 0;
  }

  // 強制獲取完整 DEBUG log 的方法
  enableFullDebugForTask(taskId: string): void {
    this.fullDebugTasks.add(taskId);
    // 這些任務的 DEBUG 級別不受採樣影響
  }
}
```

**臨時提升 Log 級別**：
```yaml
debug_mode:
  activation:
    command: "vibe --verbose" 或 環境變數 VIBE_DEBUG=1
    duration: current_session

  behavior:
    - sample_rate: 1.0 for all levels
    - retention: extend to 7d for DEBUG
    - output: also print to console

  per_task_debug:
    command: "vibe debug task-123"
    action: enable full DEBUG for specific task only
```

---

### 7.3 解法：Log 輪轉與壓縮

**輪轉策略**：
```yaml
rotation:
  triggers:
    size_based:
      max_size: 100MB
      action: rotate_current_file

    time_based:
      frequency: daily
      at: "00:00"
      action: start_new_file

  concurrent_write_handling:
    method: copy_then_truncate
    process:
      1. 複製當前檔案到 archive
      2. 清空當前檔案 (atomic truncate)
      3. 繼續寫入

  file_naming:
    active: current.jsonl
    rotated: "{date}-{sequence}.jsonl.gz"
    example: "2026-02-03-001.jsonl.gz"
```

**壓縮策略**：
```yaml
compression:
  enabled: true
  algorithm: gzip
  level: 6  # 平衡壓縮率和速度

  timing:
    delay_after_rotation: 1h  # 旋轉後 1 小時再壓縮
    reason: 允許最近的 log 被快速查詢

  query_handling:
    compressed_files:
      method: stream_decompress
      cache: decompress_to_temp_on_query
      cache_ttl: 10m
```

**歸檔策略**：
```yaml
archiving:
  local_retention:
    compressed: 7d
    uncompressed: 1d

  archive_location:
    default: .vibe-engine/logs/archive/
    optional_remote: null  # 用戶可配置 S3/GCS

  cleanup:
    trigger: daily_at_03:00
    rules:
      - delete: files older than retention_period
      - move_to_archive: files older than local_retention
```

---

### 7.4 解法：進度事件流

**事件傳輸機制**：
```yaml
event_transport:
  primary: file_based_polling
  implementation:
    event_file: .vibe-engine/events/current.jsonl
    poll_interval: 500ms
    format: jsonl_append

  alternative_sse:
    when: running_as_server_mode
    endpoint: /events
    format: server_sent_events

  reconnection:
    on_disconnect:
      - resume_from_last_event_id
      - request_missed_events
    max_buffer: 1000 events
```

**事件節流**：
```yaml
event_throttling:
  high_frequency_events:
    - THINKING
    - PROGRESS_UPDATE
  throttle_config:
    max_rate: 2 events/second
    strategy: sample_and_aggregate

  aggregation:
    PROGRESS_UPDATE:
      window: 1s
      aggregate: latest_value_only

    THINKING:
      window: 500ms
      aggregate: concatenate_content

  low_frequency_events:
    - RUN_STARTED
    - AGENT_ACTIVATED
    - TOOL_CALL_END
    - ERROR_OCCURRED
  throttle: none  # 不節流
```

**斷線重連與補發**：
```yaml
reconnection:
  event_buffering:
    location: memory + file_backup
    max_events: 1000
    max_age: 5m

  client_tracking:
    store: last_event_id per client
    on_reconnect:
      1. client sends last_event_id
      2. server finds position in buffer
      3. replay missed events

  overflow_handling:
    if_buffer_full:
      - send: EVENTS_DROPPED notification
      - include: count of dropped events
      - suggest: full refresh
```

---

### 7.5 解法：OpenTelemetry 整合

**AI Agent Span 設計**：
```yaml
span_hierarchy:
  task_span:
    name: "task.{task_type}"
    attributes:
      task.id: string
      task.description: string
      task.status: string

  agent_span:
    parent: task_span
    name: "agent.{agent_type}"
    attributes:
      agent.id: string
      agent.model: string
      agent.iteration: number

  tool_span:
    parent: agent_span
    name: "tool.{tool_name}"
    attributes:
      tool.name: string
      tool.input_size: number
      tool.output_size: number
      tool.status: string

  llm_span:
    parent: agent_span
    name: "llm.completion"
    attributes:
      llm.model: string
      llm.prompt_tokens: number
      llm.completion_tokens: number
      llm.temperature: number
```

**Metrics 定義**：
```yaml
metrics:
  counters:
    - vibe.task.count: 任務總數
    - vibe.tool_call.count: 工具調用次數
    - vibe.error.count: 錯誤次數

  histograms:
    - vibe.task.duration: 任務持續時間
    - vibe.agent.iteration_count: 迭代次數分布
    - vibe.llm.latency: LLM 回應延遲

  gauges:
    - vibe.token.used: 已使用 token 數
    - vibe.budget.remaining: 剩餘預算
    - vibe.active_agents: 活躍 Agent 數

  export_interval: 60s
```

**與 APM 整合**：
```yaml
apm_integration:
  exporter:
    protocol: otlp
    endpoint: configurable
    headers: configurable

  correlation:
    propagate:
      - traceparent
      - tracestate
    inject_into:
      - http_requests
      - subprocess_env

  sampling:
    strategy: parent_based
    root_sampler: probability (0.1)
```

---

### 7.6 解法：TUI Dashboard

**TUI 框架選擇**：
```yaml
tui_framework:
  recommendation: ink (React for CLI)

  alternatives_evaluated:
    - blessed: 功能完整但學習曲線陡
    - ink: React 語法，易於維護
    - terminal-kit: 輕量但功能有限

  rationale:
    - 與前端技術棧一致 (React/TypeScript)
    - 組件化設計易於維護
    - 良好的 ANSI escape 處理
```

**更新頻率與效能**：
```yaml
rendering:
  refresh_rate:
    normal: 500ms
    high_activity: 200ms
    idle: 2000ms

  adaptive_refresh:
    detect: activity_level
    reduce_when: no_state_change_for_5s

  performance_optimization:
    - diff_rendering: only update changed parts
    - batch_updates: collect changes, render once
    - lazy_loading: don't render off-screen content
```

**終端機適配**：
```yaml
terminal_adaptation:
  size_detection:
    method: process.stdout.columns/rows
    on_resize: SIGWINCH event

  responsive_layouts:
    small: < 80 cols
      - 隱藏次要資訊
      - 單欄布局

    medium: 80-120 cols
      - 標準雙欄布局
      - 顯示主要指標

    large: > 120 cols
      - 完整三欄布局
      - 詳細資訊面板

  fallback:
    no_tty:
      - 純文字輸出
      - 禁用顏色
      - 簡化進度顯示

  color_support:
    detect: supports-color library
    modes: truecolor > 256 > 16 > none
```

**Dashboard 組件**：
```tsx
// 概念性的 Ink 組件結構
function Dashboard() {
  return (
    <Box flexDirection="column">
      <Header task={currentTask} />

      <Box flexDirection="row">
        <AgentStatus agents={agents} />
        <ProgressBar progress={progress} />
      </Box>

      <ResourceUsage tokens={tokens} cost={cost} time={time} />

      <RecentActivity logs={recentLogs} />

      <StatusBar status={status} />
    </Box>
  );
}
```

---

## 7.6 Context Window 管理

來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code) 的 Context 管理建議

### 問題

> "Your 200k context window before compacting might only be 70k with too many tools enabled."

太多活躍的工具會消耗大量 context，降低可用空間。

### 監控指標

```yaml
context_monitoring:
  metrics:
    context_usage_percent:
      description: "Context 使用百分比"
      calculation: "current_tokens / max_tokens * 100"
      thresholds:
        warning: 70%
        critical: 85%
        emergency: 95%

    effective_context:
      description: "實際可用的 context（扣除工具定義）"
      calculation: "max_tokens - tool_definitions_tokens"

    tool_overhead:
      description: "工具定義佔用的 tokens"
      warning_if: "> 30% of max_tokens"

    active_tools_count:
      description: "活躍工具數量"
      recommendation: "< 80 tools"

  collection:
    method: "SessionStart hook + PreCompact hook"
    frequency: "每次 tool call 後更新估計"
```

### 管理規則

```yaml
context_management:
  rules:
    # 工具數量控制
    tool_control:
      max_active_tools: 80
      strategy: "只啟用必要的 MCP servers"
      recommendation: |
        有 20-30 個 MCPs 配置，但只同時啟用 <10 個

    # 主動 compaction
    proactive_compact:
      trigger: "context_usage > 70%"
      actions:
        - "壓縮舊的 tool outputs"
        - "摘要中間推理步驟"
        - "移除不再相關的 context"

    # 緊急處理
    emergency_compact:
      trigger: "context_usage > 90%"
      actions:
        - "觸發 PreCompact hook 保存狀態"
        - "執行強制 compaction"
        - "通知用戶"

  # 預警通知
  alerts:
    70_percent: |
      ⚠️ Context 使用率 70%
      建議：考慮 /compact 或完成當前任務

    85_percent: |
      🔶 Context 使用率 85%
      建議：立即 /compact 或保存重要狀態

    95_percent: |
      🔴 Context 使用率 95%
      自動觸發 PreCompact hook 保存狀態
```

### Budget Tracker 整合

```yaml
budget_tracker_enhancement:
  # 在 budget-tracker skill 中添加 context 監控
  display:
    format: |
      📊 Resource Usage
      ━━━━━━━━━━━━━━━━━━━

      Tokens:
      ├── Used: {used_tokens} / {max_tokens}
      ├── Usage: {usage_percent}%
      └── Effective: {effective_context} (after tool overhead)

      Context Health:
      ├── Active Tools: {active_tools} / 80 recommended
      ├── Tool Overhead: {tool_overhead}%
      └── Status: {context_status}

      Cost:
      ├── Current: ${current_cost}
      └── Remaining: ${remaining_budget}

  # 在 /vibe-status 命令中顯示
  command_integration:
    vibe_status:
      include: "context health summary"
```

### /compact 建議時機

```yaml
compact_recommendations:
  # 主動建議
  proactive:
    after_task_completion: |
      ✅ Task completed.

      💡 Tip: Context at {usage}%. Consider /compact to free up space.

    before_complex_task: |
      📋 This task may require significant context.
      Current usage: {usage}%

      Consider /compact first if you want more room.

  # 自動觸發（需要用戶同意）
  auto_compact:
    enabled: false  # 預設關閉，避免意外丟失 context
    threshold: 90%
    behavior: "ask user before compacting"
```

---

## 參考資源

- [Logging Best Practices - Dash0](https://www.dash0.com/guides/logging-best-practices)
- [AG-UI Protocol - Microsoft](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/building-interactive-agent-uis-with-ag-ui-and-microsoft-agent-framework/4488249)
- [AI Agent Observability - OpenTelemetry](https://opentelemetry.io/blog/2025/ai-agent-observability/)
- [Debugging Agentic AI - Gocodeo](https://www.gocodeo.com/post/debugging-agentic-ai-logging-monitoring-and-explainability)
