# 1. 協調引擎

## 問題定義

Main Agent 如何快速分析請求並分配給正確的 SubAgent，而不成為瓶頸？

---

## 子問題拆解

### 1.1 Main Agent 角色定位

**問題**：Main Agent 應該做什麼、不應該做什麼？

**現有認知**：
- "Router, Not Executor" - 只調度不執行
- 目標 5 秒內完成分配

**待解決**：
- [ ] 具體的「分析請求」步驟是什麼？
- [ ] 如何判斷任務複雜度？
- [ ] 什麼情況下 Main Agent 可以直接回答（不委派）？

---

### 1.2 任務分解算法

**問題**：如何把用戶請求拆成可並行的子任務？

**現有認知**：
- 按檔案隔離（不同 Agent 處理不同檔案）
- 按職責隔離（architect/developer/tester）

**待解決**：
- [ ] 任務分解的具體規則？
- [ ] 如何識別任務間的依賴關係？
- [ ] 分解到什麼粒度才適合？

---

### 1.3 Agent 選擇與路由

**問題**：如何根據任務類型選擇正確的 Agent？

**現有認知**：
```yaml
task_routing:
  - task_type: architecture → architect_agent
  - task_type: coding → developer_agent
  - task_type: testing → tester_agent
```

**待解決**：
- [ ] 如何識別任務類型？（關鍵字？語義分析？）
- [ ] 多個 Agent 都適合時怎麼選？
- [ ] 如何處理不明確的任務類型？

---

### 1.4 並行執行模式

**問題**：哪些任務可以並行？如何管理並行執行？

**現有認知**：
```
模式 1: Fan-Out（扇出）- 獨立子任務同時執行
模式 2: Pipeline（流水線）- 有依賴但可提前開始
模式 3: Hybrid（混合）- 多條並行流水線
```

**待解決**：
- [ ] 如何決定使用哪種模式？
- [ ] 最大並行數應該是多少？
- [ ] 並行 Agent 如何共享檔案而不衝突？

---

### 1.5 依賴循環檢測

**問題**：如何防止 Agent A → B → C → A 的無限循環？

**現有認知**：
- 使用 DAG（有向無環圖）
- 拓撲排序檢測循環
- 設置最大委派深度

**待解決**：
- [ ] 具體的檢測算法實作？
- [ ] 檢測到循環後如何處理？
- [ ] 允許的「重試」和「循環」如何區分？

---

### 1.6 結果彙整

**問題**：多個 Agent 的結果如何合併成最終回覆？

**現有認知**：
- Main Agent 負責彙整
- 結構化合併

**待解決**：
- [ ] 結果衝突時如何解決？
- [ ] 部分 Agent 失敗時如何處理？
- [ ] 彙整的格式應該是什麼？

---

## 現有方案

### oh-my-claudecode
- 32 個專業 Agent
- Orchestrator 模式
- Worker Preamble Protocol（防止 worker 產生子代理）

### OpenClaw
- Gateway 架構
- sessions_list / sessions_send 通訊

### CrewAI
- 角色定義 + 任務分配
- Sequential / Hierarchical 執行模式

### AWS CLI Agent Orchestrator
- 中央調度系統
- 並行執行多個 CLI 工具

---

## 我們的解法

### 1.1 解法：Main Agent 角色定位

**分析請求的具體步驟**：
```yaml
request_analysis:
  step_1_intent_classification:
    method: embedding_similarity
    categories: [architecture, coding, testing, documentation, question, clarification]
    threshold: 0.75
    fallback: keyword_matching

  step_2_complexity_assessment:
    factors:
      - estimated_file_count: >3 files = complex
      - has_dependencies: inter-file changes = complex
      - requires_reasoning: architectural decisions = complex
      - token_estimate: >5000 tokens output = complex
    result: simple | moderate | complex

  step_3_route_decision:
    simple: direct_response  # Main Agent 直接回答
    moderate: single_agent   # 委派單一 SubAgent
    complex: multi_agent     # 分解並委派多個 SubAgent
```

**直接回答條件**（不委派）：
- 純問答：「這個函數做什麼？」「這個 pattern 叫什麼？」
- 單檔案讀取：「看一下 config.ts 的內容」
- 澄清問題：「你是指 A 還是 B？」
- 狀態查詢：「目前的任務進度？」

**委派條件**：
- 需要修改檔案
- 需要執行測試或構建
- 需要多步驟推理
- 預估輸出 > 2000 tokens

---

### 1.2 解法：任務分解算法

**分解規則（優先級由高到低）**：
```yaml
decomposition_rules:
  rule_1_by_responsibility:
    description: 按職責拆分，每個 SubAgent 一個職責
    example:
      input: "實作登入功能並加上測試"
      output:
        - { agent: architect, task: "設計登入 API 介面" }
        - { agent: developer, task: "實作登入邏輯" }
        - { agent: tester, task: "撰寫登入測試" }

  rule_2_by_file_boundary:
    description: 不同檔案由不同 Agent 處理
    constraint: 同一檔案不應同時被多個 Agent 修改
    example:
      input: "更新 auth.ts 和 user.ts"
      output:
        - { agent: dev_1, task: "修改 auth.ts", files: ["auth.ts"] }
        - { agent: dev_2, task: "修改 user.ts", files: ["user.ts"] }

  rule_3_by_dependency_chain:
    description: 有依賴的任務串成 pipeline
    example:
      input: "先定義介面，再實作，最後測試"
      output:
        - { agent: architect, task: "定義介面", order: 1 }
        - { agent: developer, task: "實作介面", order: 2, depends_on: [1] }
        - { agent: tester, task: "測試實作", order: 3, depends_on: [2] }
```

**依賴識別方法**：
```typescript
interface TaskNode {
  id: string;
  agent: AgentType;
  task: string;
  files: string[];      // 涉及的檔案
  imports: string[];    // 需要的模組
  exports: string[];    // 產出的模組
}

function identifyDependencies(tasks: TaskNode[]): Edge[] {
  const edges: Edge[] = [];
  for (const task of tasks) {
    for (const other of tasks) {
      if (task.id === other.id) continue;
      // 檔案依賴：A 產出的檔案被 B 需要
      if (task.exports.some(e => other.imports.includes(e))) {
        edges.push({ from: task.id, to: other.id });
      }
      // 順序依賴：相同檔案必須序列化
      if (task.files.some(f => other.files.includes(f))) {
        edges.push({ from: task.id, to: other.id, type: 'serialize' });
      }
    }
  }
  return edges;
}
```

**分解粒度原則**：
- 最小粒度：單一職責 + 可獨立驗證
- 最大粒度：30 分鐘內可完成
- 目標：每個子任務 3-5 個 tool calls

---

### 1.3 解法：Agent 選擇與路由

**任務類型識別（Hybrid 方法）**：
```yaml
routing:
  primary_method: embedding_similarity
  config:
    model: text-embedding-3-small
    task_embeddings:  # 預先計算各類任務的 embedding
      architecture: ["設計", "架構", "介面", "API", "schema"]
      coding: ["實作", "修改", "新增", "重構", "程式碼"]
      testing: ["測試", "驗證", "assert", "expect", "mock"]
      documentation: ["文檔", "註解", "README", "說明"]
    threshold: 0.7

  fallback_method: keyword_rules
  keywords:
    architecture: ["design", "architect", "interface", "api", "schema", "設計"]
    coding: ["implement", "fix", "add", "refactor", "code", "實作"]
    testing: ["test", "verify", "spec", "測試"]

  ambiguous_handling:
    strategy: ask_clarification
    prompt: "這個任務可以是 {option_a} 或 {option_b}，請問你要哪一個？"
```

**多 Agent 適合時的選擇**：
```yaml
agent_selection:
  when_multiple_match:
    strategy: priority_then_load
    priority_order:
      - specialist_match    # 專家 Agent 優先
      - availability        # 可用的優先
      - recent_context      # 有相關 context 的優先

  load_balancing:
    enabled: true
    max_concurrent_per_agent: 2
    prefer_idle_agent: true
```

---

### 1.4 解法：並行執行模式

**模式選擇決策樹**：
```
依賴分析結果？
├── 完全獨立 → Fan-Out（全部並行）
├── 完全依賴 → Pipeline（序列執行）
└── 部分依賴 → Hybrid（拓撲排序後分批並行）

Hybrid 執行：
Wave 1: [Task A, Task B]  ← 無依賴的先行
Wave 2: [Task C]          ← 依賴 A 完成
Wave 3: [Task D, Task E]  ← 依賴 B, C 完成
```

**最大並行數**：
```yaml
concurrency:
  max_parallel_agents: 4  # 基於 Coordination Tax 研究
  rationale: |
    > 4 agents 會導致 coordination overhead 抵消效益。
    4 是效能與複雜度的最佳平衡點。

  dynamic_adjustment:
    reduce_when:
      - api_rate_limited
      - context_approaching_limit
      - previous_conflicts_detected
```

**檔案衝突預防**：
```yaml
file_locking:
  strategy: optimistic_with_reservation
  implementation:
    reservation_phase:
      - Main Agent 分配任務時宣告檔案所有權
      - 同一檔案只能被一個 Agent 修改
      - 讀取不需要鎖定

    conflict_detection:
      - Agent 修改前檢查 file hash
      - 如果 hash 變化 → 報告衝突

    conflict_resolution:
      - 暫停衝突 Agent
      - 用 three-way merge 或人類仲裁
```

---

### 1.5 解法：依賴循環檢測

**檢測算法（Three-Color DFS）**：
```typescript
enum Color { WHITE, GRAY, BLACK }

function detectCycle(tasks: TaskNode[], edges: Edge[]): CycleResult {
  const graph = buildAdjacencyList(tasks, edges);
  const color = new Map<string, Color>();
  const parent = new Map<string, string>();

  for (const task of tasks) {
    color.set(task.id, Color.WHITE);
  }

  function dfs(nodeId: string): string[] | null {
    color.set(nodeId, Color.GRAY);  // 標記為處理中

    for (const neighbor of graph.get(nodeId) || []) {
      if (color.get(neighbor) === Color.GRAY) {
        // 發現 back edge = 循環！
        return reconstructCycle(nodeId, neighbor, parent);
      }
      if (color.get(neighbor) === Color.WHITE) {
        parent.set(neighbor, nodeId);
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      }
    }

    color.set(nodeId, Color.BLACK);  // 標記為完成
    return null;
  }

  for (const task of tasks) {
    if (color.get(task.id) === Color.WHITE) {
      const cycle = dfs(task.id);
      if (cycle) {
        return { hasCycle: true, cycle };
      }
    }
  }

  return { hasCycle: false, cycle: null };
}
```

**循環處理策略**：
```yaml
cycle_handling:
  on_detection:
    - log_cycle_path
    - reject_task_plan
    - notify_user_with_explanation

  user_message: |
    ⚠️ 檢測到任務循環依賴：
    {cycle_path}
    請重新描述任務以打破循環。

  prevention:
    - 限制委派深度: max_depth: 5
    - 禁止 SubAgent 創建 SubAgent (Worker Preamble Protocol)
```

**重試 vs 循環的區分**：
```yaml
retry_tracking:
  per_task:
    retry_count: 0
    max_retries: 3
    visited_states: Set<StateHash>

  is_loop_not_retry:
    conditions:
      - retry_count > max_retries
      - same_state_visited_twice
      - no_progress_after_action
```

---

### 1.6 解法：結果彙整

**彙整格式**：
```typescript
interface AggregatedResult {
  status: 'success' | 'partial_success' | 'failed';
  summary: string;

  agent_results: Array<{
    agent: string;
    status: 'success' | 'failed' | 'skipped';
    output: string;
    files_modified: string[];
    duration_ms: number;
  }>;

  conflicts: Array<{
    type: 'file_conflict' | 'semantic_conflict';
    description: string;
    resolution: string;
  }>;

  next_steps?: string[];
}
```

**衝突解決策略**：
```yaml
conflict_resolution:
  file_conflict:
    strategy: last_writer_wins_with_merge
    process:
      1. 檢測衝突行
      2. 嘗試自動 three-way merge
      3. 無法合併 → 保留兩個版本並詢問用戶

  semantic_conflict:
    example: "Agent A 說用 REST，Agent B 說用 GraphQL"
    strategy: architect_decides
    process:
      1. 收集所有意見
      2. 交給 Architect Agent 決策
      3. 如果 Architect 也不確定 → 詢問用戶
```

**部分失敗處理**：
```yaml
partial_failure:
  strategy: graceful_degradation

  scenarios:
    some_agents_failed:
      - 報告成功的部分
      - 列出失敗的任務
      - 建議手動完成或重試

    critical_agent_failed:
      - 停止依賴它的下游任務
      - 回滾已完成但依賴失敗結果的任務
      - 報告並建議重試

  output_format: |
    ✅ 完成 3/5 個子任務
    ❌ 失敗任務：
    - testing: API timeout (可重試)
    - documentation: 找不到 README (需要手動處理)
```

---

## 參考資源

- [Orchestrator Pattern - Zack Proser](https://zackproser.com/blog/orchestrator-pattern)
- [CLI Agent Orchestrator - AWS](https://aws.amazon.com/blogs/opensource/introducing-cli-agent-orchestrator-transforming-developer-cli-tools-into-a-multi-agent-powerhouse/)
- [Multi-Agent Parallel Execution - Skywork](https://skywork.ai/blog/agent/multi-agent-parallel-execution-running-multiple-ai-agents-simultaneously/)
- [Boost AI Agent Performance - Kore.ai](https://www.kore.ai/blog/boost-ai-agent-performance-with-parallel-execution)
- [Dependency Graphs in AI Frameworks - Gocodeo](https://www.gocodeo.com/post/dependency-graphs-orchestration-and-control-flows-in-ai-agent-frameworks)
