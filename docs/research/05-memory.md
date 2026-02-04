# 5. 記憶系統

## 問題定義

如何讓 Agent 記住重要資訊，同時避免 Context 過載和跨 Agent 污染？

---

## 子問題拆解

### 5.1 記憶架構

**問題**：需要哪些類型的記憶？如何組織？

**現有認知**：
```
短期記憶 (Short-Term)
├── Rolling buffer
├── 當前對話的即時上下文
└── 會話內連貫性

長期記憶 (Long-Term)
├── Semantic（語義）- 事實知識
├── Episodic（情節）- 過往經驗
└── Procedural（程序）- 如何做

歸檔記憶 (Archival)
├── Vector databases
├── Knowledge graphs
└── 處理過的索引資訊
```

**待解決**：
- [ ] 每種記憶的具體儲存方式？
- [ ] 記憶之間如何轉換（短期 → 長期）？
- [ ] 記憶的過期和清理策略？

---

### 5.2 Context 隔離

**問題**：如何防止 SubAgent 之間的記憶互相干擾？

**現有認知**：
```
Main Agent Context
├── Task specification
├── Global rules
├── Agent final outputs (summaries only)
└── ❌ 不包含 SubAgent 詳細互動

SubAgent Context (isolated)
├── Fork from Main
├── Own working memory
├── Tool call history
└── ❌ 看不到其他 Agent
```

**待解決**：
- [ ] "Fork" 的具體機制是什麼？
- [ ] 如何決定 Main 要分享什麼給 SubAgent？
- [ ] SubAgent 完成後如何「彙報」給 Main？

---

### 5.3 選擇性記憶注入

**問題**：如何只注入相關的記憶，而不是全部歷史？

**現有認知**：
```
用戶請求
    ↓
Context 選擇器
├── 1. 分析請求意圖
├── 2. 檢索相關記憶
├── 3. 評估相關性 (threshold: 0.8)
└── 4. 選擇性注入 (max: 2000 tokens)
    ↓
精確的 Context + 請求 → LLM
```

**待解決**：
- [ ] 相關性評估的具體算法？
- [ ] 閾值 0.8 是否合適？如何調整？
- [ ] 注入的格式應該是什麼？

---

### 5.4 記憶壓縮與遺忘

**問題**：Context 接近上限時如何處理？

**現有認知**：
```yaml
compaction:
  trigger: context_size > 80%
  strategies:
    - summarize_old_messages
    - archive_tool_outputs
    - prune_intermediate_reasoning

forgetting:
  preserve:
    - errors_and_fixes
    - human_decisions
    - key_milestones
  forget:
    - verbose_tool_outputs
    - superseded_plans
    - failed_attempts_details
```

**待解決**：
- [ ] 「摘要」的具體實作？用什麼 prompt？
- [ ] 如何判斷什麼該保留、什麼該遺忘？
- [ ] 遺忘後如何保留「曾經發生過」的線索？

---

### 5.5 RAG vs Memory

**問題**：什麼時候用 RAG？什麼時候用 Memory？

**現有認知**：
| 面向 | RAG | Memory |
|------|-----|--------|
| 目的 | 帶入外部知識 | 帶入連續性 |
| 狀態 | 無狀態 | 有狀態 |
| 關注 | 事實、文檔 | 偏好、歷史 |

**待解決**：
- [ ] 兩者如何結合使用？
- [ ] 代碼庫知識算 RAG 還是 Memory？
- [ ] 用戶偏好應該存在哪裡？

---

## 現有方案

### Mem0
- 選擇性檢索 pipeline
- P95 延遲從 17s 降到 1.4s
- Token 消耗減少 90%

### Letta
- Core Memory (In-context)
- Recall Memory (Searchable)
- Archival Memory (Indexed)

### LangGraph
- In-thread memory (單會話)
- Cross-thread memory (跨會話)

---

## 我們的解法

### 5.1 解法：記憶架構

**三層記憶儲存方式**：
```yaml
memory_storage:
  short_term:
    location: in_memory (process)
    format: Message[]
    capacity: rolling_buffer (last 50 messages)
    persistence: none (session only)
    implementation:
      type: circular_buffer
      max_items: 50
      max_tokens: 20000
      eviction: oldest_first

  long_term:
    location: .vibe-engine/memory/
    format: JSONL + SQLite index
    structure:
      semantic:   # 事實知識
        file: semantic.jsonl
        index: semantic.db
        example: "此專案使用 TypeScript + React"
      episodic:   # 過往經驗
        file: episodic.jsonl
        index: episodic.db
        example: "上次修改 auth.ts 時遇到 circular import"
      procedural: # 如何做
        file: procedural.jsonl
        index: procedural.db
        example: "測試前先執行 npm run build"

  archival:
    location: .vibe-engine/memory/archive/
    format: compressed JSONL + vector index
    use_case: 很少存取但需要保留的歷史
    compression: gzip
    retrieval: vector_similarity_search
```

**記憶項目格式**：
```typescript
interface MemoryItem {
  id: string;
  type: 'semantic' | 'episodic' | 'procedural';
  content: string;
  embedding?: number[];  // 向量嵌入

  metadata: {
    created_at: string;
    updated_at: string;
    access_count: number;
    last_accessed: string;
    source: 'user' | 'agent' | 'system';
    confidence: number;
    tags: string[];
  };

  relations?: {
    supersedes?: string;  // 這條記憶取代了哪條
    related_to?: string[];
  };
}
```

**Confidence Scoring 系統**：

根據 [everything-claude-code](https://github.com/affaan-m/everything-claude-code) 的最佳實踐，採用分級 confidence 系統：

```yaml
confidence_levels:
  # 分數範圍與含義
  levels:
    tentative:
      range: 0.3-0.4
      meaning: 初步觀察，可能不準確
      behavior: 建議但不強制，需要用戶確認
      example: "用戶似乎偏好 functional style（觀察 2 次）"

    moderate:
      range: 0.5-0.6
      meaning: 有一定依據，但未完全確認
      behavior: 相關時應用，允許覆蓋
      example: "專案使用 TypeScript（從 package.json 推斷）"

    strong:
      range: 0.7-0.8
      meaning: 多次驗證，高度可信
      behavior: 自動應用，除非用戶明確否定
      example: "此專案使用 4 spaces 縮排（觀察 10+ 次）"

    near_certain:
      range: 0.9-1.0
      meaning: 用戶明確聲明或核心行為
      behavior: 總是應用，視為規則
      example: "用戶說：'永遠不要自動 commit'"

  # 分數計算規則
  scoring_rules:
    initial_score:
      explicit_user_statement: 0.9   # 用戶明確說的
      inferred_from_code: 0.6        # 從代碼推斷的
      single_observation: 0.3        # 單次觀察

    increment_rules:
      repeated_observation: +0.1     # 每次重複觀察
      user_confirmation: +0.2        # 用戶確認
      max_score: 1.0

    decrement_rules:
      user_correction: -0.3          # 用戶糾正
      contradiction_detected: -0.2   # 發現矛盾
      long_unused: -0.1 per month    # 長期未使用

  # 使用時的行為
  application:
    inject_threshold: 0.5           # 低於此分數不自動注入
    suggest_threshold: 0.3          # 低於此分數不建議
    auto_apply_threshold: 0.7       # 高於此分數自動應用

    conflict_resolution:
      if_conflicting_memories:
        prefer: higher_confidence
        if_equal: prefer_more_recent
        if_still_equal: ask_user
```

**Confidence 衰減機制**：
```typescript
function decayConfidence(memory: MemoryItem): number {
  const daysSinceAccess = daysBetween(memory.metadata.last_accessed, now());
  const baseDecay = 0.01; // 每 30 天衰減 0.01
  const decay = Math.floor(daysSinceAccess / 30) * baseDecay;

  // 最低不低於 0.2（除非被明確否定）
  return Math.max(0.2, memory.metadata.confidence - decay);
}

// 定期執行衰減（例如每週）
function runConfidenceDecay() {
  for (const memory of getAllMemories()) {
    const newConfidence = decayConfidence(memory);
    if (newConfidence < memory.metadata.confidence) {
      updateMemory(memory.id, { confidence: newConfidence });
    }
  }
}
```

**記憶轉換（短期 → 長期）**：
```yaml
memory_consolidation:
  triggers:
    - session_end
    - explicit_save_command
    - important_decision_detected
    - error_resolution_completed

  extraction_prompt: |
    從以下對話中提取值得長期記憶的資訊：
    {conversation}

    提取類別：
    1. 專案相關事實（semantic）
    2. 經驗教訓（episodic）
    3. 操作程序（procedural）

    回傳 JSON 格式：
    [{"type": "...", "content": "...", "confidence": 0.0-1.0}]

  deduplication:
    method: embedding_similarity
    threshold: 0.9
    on_duplicate: merge_or_update

  prioritization:
    high_priority:
      - 用戶明確說「記住...」
      - 錯誤修復經驗
      - 專案配置資訊
    low_priority:
      - 一次性查詢結果
      - 中間推理步驟
```

**記憶過期與清理**：
```yaml
memory_lifecycle:
  expiration:
    semantic:
      ttl: never  # 事實通常不過期
      invalidation: manual_or_contradicted
    episodic:
      ttl: 90d
      refresh: on_access
    procedural:
      ttl: never
      version: track_changes

  cleanup_triggers:
    - storage_size > 100MB
    - memory_count > 10000
    - weekly_maintenance

  cleanup_strategy:
    - remove: access_count == 0 AND age > 30d
    - archive: access_count < 3 AND age > 60d
    - keep: high_confidence OR frequently_accessed
```

---

### 5.2 解法：Context 隔離

**Fork 機制實作**：
```typescript
interface AgentContext {
  // 共享部分（從 Main 繼承）
  shared: {
    task_specification: string;
    global_rules: string[];
    project_context: ProjectInfo;
  };

  // 隔離部分（SubAgent 獨有）
  isolated: {
    messages: Message[];
    tool_history: ToolCall[];
    working_memory: Map<string, any>;
  };

  // 權限
  permissions: {
    can_see_other_agents: false;
    can_modify_shared: false;
  };
}

function forkContext(mainContext: MainContext, task: SubTask): AgentContext {
  return {
    shared: {
      task_specification: task.description,
      global_rules: mainContext.rules,
      project_context: selectRelevantContext(mainContext.project, task),
    },
    isolated: {
      messages: [],
      tool_history: [],
      working_memory: new Map(),
    },
    permissions: {
      can_see_other_agents: false,
      can_modify_shared: false,
    },
  };
}
```

**Main 分享給 SubAgent 的決定**：
```yaml
context_sharing:
  always_share:
    - task_specification
    - relevant_file_paths
    - coding_conventions
    - error_context (if retry)

  conditionally_share:
    - other_agent_summaries: only_if_dependent
    - full_file_content: only_if_needed
    - conversation_history: never (only task summary)

  never_share:
    - other_agents_internal_reasoning
    - user_conversation_details (beyond task)
    - unrelated_file_contents

  token_budget:
    max_context_for_subagent: 30000
    strategy: prioritize_task_relevant_info
```

**SubAgent 彙報機制**：
```yaml
reporting:
  output_format:
    structured:
      status: success | partial | failed
      summary: string (< 200 words)
      files_modified: string[]
      key_decisions: string[]
      warnings: string[]
      needs_followup: boolean

  content_rules:
    include:
      - 最終結果
      - 重要決定及理由
      - 遇到的問題及解決方式
    exclude:
      - 詳細推理過程
      - 失敗的嘗試細節
      - 完整 tool outputs

  compression:
    long_output:
      threshold: 5000 tokens
      action: summarize + provide_reference
      reference: .vibe-engine/tasks/{task_id}/agent_{agent_id}_full_output.json
```

---

### 5.3 解法：選擇性記憶注入

**相關性評估算法**：
```typescript
interface RetrievalConfig {
  maxResults: number;
  similarityThreshold: number;
  recencyWeight: number;
  accessWeight: number;
}

async function selectiveRetrieve(
  query: string,
  config: RetrievalConfig = {
    maxResults: 5,
    similarityThreshold: 0.7,
    recencyWeight: 0.2,
    accessWeight: 0.1,
  }
): Promise<MemoryItem[]> {
  // 1. 生成查詢的 embedding
  const queryEmbedding = await embed(query);

  // 2. 語義搜尋候選記憶
  const candidates = await vectorSearch(queryEmbedding, config.maxResults * 3);

  // 3. 計算綜合分數
  const scored = candidates.map(item => ({
    item,
    score: calculateScore(item, queryEmbedding, config),
  }));

  // 4. 過濾低於閾值的結果
  const filtered = scored.filter(s => s.score >= config.similarityThreshold);

  // 5. 排序並返回 top K
  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(0, config.maxResults)
    .map(s => s.item);
}

function calculateScore(
  item: MemoryItem,
  queryEmbedding: number[],
  config: RetrievalConfig
): number {
  const similarity = cosineSimilarity(item.embedding, queryEmbedding);
  const recencyScore = calculateRecency(item.metadata.last_accessed);
  const accessScore = Math.log(item.metadata.access_count + 1) / 10;

  return (
    similarity * (1 - config.recencyWeight - config.accessWeight) +
    recencyScore * config.recencyWeight +
    accessScore * config.accessWeight
  );
}
```

**閾值調整策略**：
```yaml
threshold_tuning:
  adaptive_threshold:
    base: 0.7
    adjustment:
      if_no_results: lower_by_0.1 (min 0.5)
      if_too_many_results: raise_by_0.05 (max 0.9)

  context_based:
    task_type:
      debugging: 0.6  # 更寬鬆，可能需要更多線索
      coding: 0.75    # 標準
      qa: 0.8         # 更嚴格，避免不相關資訊

  feedback_loop:
    track: injected_memories_actually_used
    adjust: if used_rate < 30%, raise threshold
```

**注入格式**：
```yaml
injection_format:
  template: |
    ## 相關背景資訊

    以下是與當前任務可能相關的歷史資訊：

    {memories}

    ---

    請根據以上資訊處理用戶請求。如果背景資訊不相關，請忽略。

  memory_formatting:
    semantic: |
      📌 專案資訊：{content}
    episodic: |
      💡 過往經驗：{content} (來自 {date})
    procedural: |
      📋 操作程序：{content}

  placement:
    position: before_user_message
    max_tokens: 2000
    truncation: by_relevance_score
```

---

### 5.4 解法：記憶壓縮與遺忘

**壓縮策略實作**：
```yaml
compaction:
  trigger: context_tokens > 80% of limit

  priority_order:
    1. compaction (reversible)
    2. summarization (lossy)

  compaction_rules:
    file_contents:
      action: replace_with_reference
      before: |
        I read the file auth.ts:
        ```typescript
        // 500 lines of code
        ```
      after: |
        I read the file auth.ts (500 lines, see file for content)

    tool_outputs:
      action: compress_to_summary
      before: |
        Bash output: [2000 lines of npm install log]
      after: |
        Bash output: npm install completed (45 packages)

    intermediate_reasoning:
      action: remove_if_old
      keep: final_decision_only
```

**摘要實作**：
```yaml
summarization:
  trigger: after_compaction_still_over_limit

  strategy: incremental_summary
  implementation:
    maintain:
      - rolling_summary: 持續更新的整體摘要
      - recent_raw: 最近 10 輪的原始對話

    process:
      1. 識別可以摘要的舊內容
      2. 用 LLM 生成摘要
      3. 合併到 rolling_summary
      4. 刪除已摘要的原始內容

  prompt: |
    將以下對話段落摘要成簡潔的要點：

    {old_messages}

    已有的摘要：
    {existing_summary}

    請生成更新後的摘要（保留所有重要資訊，移除冗餘）：

  preservation:
    always_keep:
      - 最近 5 個 tool calls（完整格式）
      - 錯誤訊息和修復方式
      - 用戶明確的指示
      - 關鍵決定點
```

**遺忘線索保留**：
```yaml
forgetting_with_traces:
  implementation:
    tombstone:
      description: 保留「曾經發生過」的標記
      format: |
        [Earlier: {event_type} at {timestamp} - {one_line_summary}]

    example:
      before: |
        User: 幫我修改 config.ts
        Assistant: [詳細的 50 輪修改過程...]
      after: |
        [Earlier: config.ts modification, 50 turns, completed successfully]

  reconstruction:
    if_needed: can_retrieve_from_checkpoint
    reference: .vibe-engine/tasks/{task_id}/history/{segment_id}.json
```

---

### 5.5 解法：RAG vs Memory

**使用場景區分**：
```yaml
rag_vs_memory:
  use_rag_for:
    - 代碼庫搜尋
    - 文檔查詢
    - API 參考
    - 外部知識
    characteristics:
      - 無狀態
      - 按需檢索
      - 可能過時
      - 內容較大

  use_memory_for:
    - 用戶偏好
    - 專案習慣
    - 過往決定
    - 經驗教訓
    characteristics:
      - 有狀態
      - 主動注入
      - 持續更新
      - 內容精簡
```

**整合使用**：
```yaml
integration:
  retrieval_pipeline:
    step_1: 分析請求意圖
    step_2_parallel:
      - memory_search: 檢索相關記憶
      - rag_search: 檢索相關代碼/文檔
    step_3: 合併並去重
    step_4: 按相關性排序
    step_5: 注入 context

  deduplication:
    when: memory_and_rag_overlap
    prefer: memory (更精簡且已驗證)
    unless: rag_is_more_recent

  token_allocation:
    total_budget: 4000 tokens
    memory: 1000 tokens (25%)
    rag: 3000 tokens (75%)
```

**代碼庫知識歸屬**：
```yaml
codebase_knowledge:
  classification:
    rag:
      - 代碼內容
      - 檔案結構
      - 函數簽名
      - 依賴關係
    memory:
      - 專案風格偏好
      - 架構決定的原因
      - 已知的坑和解法
      - 常用的模式

  example:
    rag: "auth.ts 中有 validateToken 函數"
    memory: "此專案的 auth 使用 JWT，不要用 session"
```

**用戶偏好儲存**：
```yaml
user_preferences:
  storage: long_term_memory.semantic
  categories:
    coding_style:
      - indent_style: spaces | tabs
      - quote_style: single | double
      - naming_convention: camelCase | snake_case

    workflow:
      - commit_style: conventional | free-form
      - test_first: yes | no
      - documentation_level: minimal | verbose

    communication:
      - language: zh-TW | en
      - verbosity: concise | detailed
      - explanation_depth: basic | advanced

  extraction:
    from_explicit: "我喜歡用 4 spaces 縮排"
    from_implicit: 觀察用戶的代碼風格並學習

  application:
    always_apply: coding_style, workflow
    apply_if_relevant: communication
```

---

## 5.6 Instinct-based Learning 系統

來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code) 的 Continuous Learning v2

### 核心概念

**Instinct** 是比記憶更精簡的原子學習單位：

```
Session Activity
      ↓
Hooks 捕獲（100% 可靠）
      ↓
observations.jsonl
      ↓
Pattern Detection（背景 Haiku agent）
      ↓
Instincts（原子學習單位）
      ↓
/evolve → Skills/Commands/Agents
```

### Instinct 格式

```yaml
# .vibe-engine/instincts/{instinct-id}.md
---
id: prefer-functional-style
trigger: "when writing new functions"
confidence: 0.7
domain: "code-style"
source: "session-observation"
created_at: "2024-01-15T10:30:00Z"
evidence_count: 5
---

# Prefer Functional Style

## Action
Use functional patterns over classes when appropriate.

## Evidence
- 2024-01-15: User refactored class to function (auth.ts)
- 2024-01-14: User preferred arrow function over class method
- 2024-01-13: User asked for functional approach in review
```

### Instinct 與 Memory 的區別

| 面向 | Memory | Instinct |
|------|--------|----------|
| 粒度 | 任意資訊 | 單一觸發 + 單一行動 |
| 用途 | 記住事實/經驗 | 指導行為 |
| 格式 | JSONL | Markdown + YAML |
| 演化 | 衰減/遺忘 | 聚類成 Skills |
| 來源 | 明確儲存 | 自動觀察 |

### 觀察收集機制

```yaml
observation_collection:
  # 使用 PostToolUse hook 收集觀察
  hooks:
    PostToolUse:
      matcher: "*"
      action: "記錄工具呼叫和結果"
      output: ".vibe-engine/observations.jsonl"

  # 觀察格式
  observation_format:
    timestamp: string
    session_id: string
    tool_name: string
    tool_input: object
    tool_result: object
    user_correction: boolean  # 用戶是否糾正了結果
    outcome: "success" | "failure" | "corrected"

  # Pattern Detection（背景執行）
  pattern_detection:
    trigger: "session_end OR observation_count > 20"
    model: "haiku"  # 使用低成本模型
    prompt: |
      分析以下觀察，識別可能的 instincts：

      {observations}

      尋找：
      1. 用戶糾正 → 生成 instinct（不要再犯同樣錯誤）
      2. 重複模式 → 生成 instinct（自動應用）
      3. 工具偏好 → 生成 instinct（優先使用）
      4. 錯誤解決方式 → 生成 instinct（記住解法）

      回傳 JSON:
      [{"trigger": "...", "action": "...", "domain": "...", "confidence": 0.0-1.0}]
```

### /evolve 命令邏輯

```yaml
evolve_command:
  description: "將相關 instincts 聚類成更高級的產物"

  process:
    1_cluster:
      threshold: 3  # 3 個相關 instincts 觸發聚類
      method: "domain + trigger similarity"

    2_analyze:
      prompt: |
        分析以下相關 instincts，決定應該演化成什麼：

        {clustered_instincts}

        可能的產物：
        - Command: 如果是可重複的工作流程
        - Skill: 如果是領域知識集合
        - Agent: 如果是專門角色
        - Rule: 如果是必須遵守的約束

    3_generate:
      output_dir: ".vibe-engine/evolved/"
      structure:
        command: "commands/{name}.md"
        skill: "skills/{name}/SKILL.md"
        agent: "agents/{name}.md"
        rule: "rules/{name}.md"

    4_validate:
      prompt: |
        檢查生成的 {type} 是否：
        1. 符合格式規範
        2. 不與現有 {type} 衝突
        3. 真正有價值

  output:
    success: |
      ✅ Evolved {count} instincts into:
      - {type}: {name}

      Review at: {path}
    no_clusters: |
      ℹ️ Not enough related instincts to evolve yet.
      Current instincts: {count}
      Threshold: 3 related instincts
```

### Instinct 管理命令

```yaml
commands:
  /instinct-status:
    description: "View learned instincts with confidence scores"
    output: |
      📊 Instinct Status
      ━━━━━━━━━━━━━━━━━━━

      By Domain:
      ┌─────────────┬───────┬────────────┐
      │ Domain      │ Count │ Avg Conf   │
      ├─────────────┼───────┼────────────┤
      │ code-style  │ 5     │ 0.72       │
      │ testing     │ 3     │ 0.65       │
      │ git         │ 2     │ 0.80       │
      └─────────────┴───────┴────────────┘

      Top Instincts:
      1. [0.85] prefer-functional-style
      2. [0.80] always-run-tests-before-commit
      3. [0.72] use-conventional-commits

  /instinct-export:
    description: "Export instincts for sharing"
    output: ".vibe-engine/exports/instincts-{timestamp}.json"

  /instinct-import:
    description: "Import instincts from others"
    validation:
      - "檢查格式正確性"
      - "設定初始 confidence 為 0.5（需要本地驗證）"
      - "標記 source 為 'imported'"
```

### 與 Memory 模組整合

```yaml
integration:
  # Instinct 可以轉換為 Memory
  instinct_to_memory:
    when: "confidence >= 0.9 AND evidence_count >= 10"
    type: "procedural"  # 程序性記憶
    reason: "高度確定的 instinct 應該永久記住"

  # Memory 可以觸發 Instinct 觀察
  memory_to_instinct:
    when: "memory 被多次存取但 confidence 下降"
    action: "重新觀察以更新 instinct"

  # 共享 confidence scoring
  confidence_sync:
    instinct_updates_memory: true
    memory_updates_instinct: true
```

---

## 5.7 /checkpoint 命令詳細實作

來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code) 的 Checkpoint 系統

### 概述

`/checkpoint` 使用 Git 整合管理工作流程快照，允許追蹤進度和回滾變更。

### 命令操作

```yaml
checkpoint_operations:
  create:
    syntax: "/checkpoint create [name]"
    steps:
      1: "驗證 clean state（無未提交變更）"
      2: "創建 Git stash 或臨時 commit"
      3: "記錄到 .vibe-engine/checkpoints.log"
      4: "保存 timestamp, SHA, 檔案數量, 覆蓋率"
    output: |
      ✅ Checkpoint created: feature-start
      SHA: abc1234
      Files: 42
      Coverage: 78%

  verify:
    syntax: "/checkpoint verify [name]"
    comparison:
      - "檔案增減數量"
      - "測試結果變化"
      - "代碼覆蓋率差異"
      - "構建狀態"
    output: |
      📊 Checkpoint Comparison: feature-start → current

      Changes:
      - Files: 42 → 48 (+6)
      - Coverage: 78% → 85% (+7%)
      - Tests: 120 → 135 (+15)
      - Build: PASS → PASS

      Status: PROGRESS ✅

  list:
    syntax: "/checkpoint list"
    output: |
      📋 Checkpoints

      | Name | Timestamp | SHA | Status |
      |------|-----------|-----|--------|
      | feature-start | 2024-01-15 10:00 | abc1234 | behind |
      | core-complete | 2024-01-15 12:30 | def5678 | behind |
      | ready-for-test | 2024-01-15 15:00 | ghi9012 | current |

  clear:
    syntax: "/checkpoint clear"
    behavior: "移除舊 checkpoints，保留最近 5 個"
    output: |
      🧹 Cleared 3 old checkpoints
      Remaining: feature-start, core-complete, ready-for-test
```

### 存儲格式

```json
// .vibe-engine/checkpoints.log (JSONL)
{"name": "feature-start", "timestamp": "2024-01-15T10:00:00Z", "sha": "abc1234", "files": 42, "coverage": 78, "tests": 120}
{"name": "core-complete", "timestamp": "2024-01-15T12:30:00Z", "sha": "def5678", "files": 45, "coverage": 82, "tests": 128}
{"name": "ready-for-test", "timestamp": "2024-01-15T15:00:00Z", "sha": "ghi9012", "files": 48, "coverage": 85, "tests": 135}
```

### 典型工作流程

```yaml
checkpoint_workflow:
  1_start:
    action: "/checkpoint create feature-start"
    when: "開始新功能"

  2_milestone:
    action: "/checkpoint create core-complete"
    when: "核心功能完成"

  3_verify:
    action: "/checkpoint verify feature-start"
    when: "想要檢查進度"

  4_complete:
    action: "/checkpoint create ready-for-test"
    when: "準備提交測試"

  5_final:
    action: "/checkpoint verify core-complete"
    when: "提交 PR 前"
```

### 腳本實作

```javascript
// scripts/checkpoint.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOG_FILE = path.join(
  process.env.VIBE_ENGINE_ROOT || '.vibe-engine',
  'checkpoints.log'
);

function create(name) {
  // 1. 檢查 clean state
  const status = execSync('git status --porcelain').toString();
  if (status.trim()) {
    return { error: 'Working directory not clean' };
  }

  // 2. 獲取當前 SHA
  const sha = execSync('git rev-parse --short HEAD').toString().trim();

  // 3. 收集指標
  const files = parseInt(execSync('find src -name "*.ts" | wc -l').toString());
  const coverage = getCoveragePercent();
  const tests = getTestCount();

  // 4. 記錄
  const entry = {
    name,
    timestamp: new Date().toISOString(),
    sha,
    files,
    coverage,
    tests
  };

  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');

  return { success: true, entry };
}

function verify(name) {
  const checkpoints = readCheckpoints();
  const target = checkpoints.find(c => c.name === name);

  if (!target) {
    return { error: `Checkpoint not found: ${name}` };
  }

  const current = {
    files: parseInt(execSync('find src -name "*.ts" | wc -l').toString()),
    coverage: getCoveragePercent(),
    tests: getTestCount()
  };

  return {
    target,
    current,
    diff: {
      files: current.files - target.files,
      coverage: current.coverage - target.coverage,
      tests: current.tests - target.tests
    }
  };
}

module.exports = { create, verify };
```

---

## 5.8 /evolve 命令詳細實作

來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code) 的 Continuous Learning v2

### 概述

`/evolve` 將相關 instincts 聚類成更高級的產物（Commands、Skills、Agents）。

### 命令語法

```yaml
evolve_syntax:
  basic: "/evolve"
  with_domain: "/evolve --domain testing"
  dry_run: "/evolve --dry-run"
  execute: "/evolve --execute"
  threshold: "/evolve --threshold 5"
```

### 演化流程

```yaml
evolve_workflow:
  1_cluster:
    description: "識別相關 instincts 群組"
    threshold: 3  # 默認需要 3 個相關 instincts
    similarity_factors:
      - "domain 相似性"
      - "trigger 模式重疊"
      - "action 序列關係"

  2_analyze:
    description: "決定應該演化成什麼"
    prompt: |
      分析以下相關 instincts，決定應該演化成什麼：

      {clustered_instincts}

      可能的產物：
      - Command: 如果是可重複的工作流程
      - Skill: 如果是領域知識集合
      - Agent: 如果是複雜、多步驟的專門角色
      - Rule: 如果是必須遵守的約束

      回傳 JSON:
      {
        "type": "command|skill|agent|rule",
        "name": "evolved-name",
        "reason": "為什麼選擇這個類型",
        "content": "生成的內容"
      }

  3_preview:
    description: "顯示將要生成的內容"
    output: |
      🔮 Evolution Preview

      Cluster: testing-practices (3 instincts)
      ├── prefer-integration-tests (0.75)
      ├── mock-external-apis (0.68)
      └── test-edge-cases-first (0.72)

      Will create: Skill
      Name: testing-best-practices
      Confidence: 0.72 (avg)

      Preview:
      ```markdown
      ---
      name: testing-best-practices
      description: This skill should be used when writing tests...
      ---
      # Testing Best Practices
      ...
      ```

      Run with --execute to create.

  4_execute:
    description: "生成並保存產物"
    output_locations:
      command: ".vibe-engine/evolved/commands/{name}.md"
      skill: ".vibe-engine/evolved/skills/{name}/SKILL.md"
      agent: ".vibe-engine/evolved/agents/{name}.md"
      rule: ".vibe-engine/evolved/rules/{name}.md"
```

### 聚類算法

```yaml
clustering_algorithm:
  input: "所有 instincts from .vibe-engine/instincts/"

  step_1_domain_grouping:
    action: "按 domain 分組"
    result: |
      code-style: [prefer-functional, use-arrow-functions, avoid-classes]
      testing: [prefer-integration, mock-apis, edge-cases-first]
      git: [conventional-commits, small-commits]

  step_2_similarity_scoring:
    action: "計算每對 instincts 的相似度"
    factors:
      trigger_overlap: 0.4  # trigger 關鍵字重疊
      action_overlap: 0.3   # action 關鍵字重疊
      domain_match: 0.3     # 同一 domain
    threshold: 0.6  # 相似度閾值

  step_3_cluster_formation:
    action: "形成達到閾值的群組"
    min_size: 3  # 最少 3 個 instincts

  step_4_evolution_decision:
    rules:
      - "if cluster.all_triggers_similar → Command"
      - "if cluster.knowledge_based → Skill"
      - "if cluster.multi_step_process → Agent"
      - "if cluster.constraints_only → Rule"
```

### 輸出格式

```yaml
evolve_output:
  success: |
    ✅ Evolved {count} instincts into:
    - {type}: {name}

    Created: {path}

    Source instincts:
    - {instinct_1} (confidence: {c1})
    - {instinct_2} (confidence: {c2})
    - {instinct_3} (confidence: {c3})

    Review and move to appropriate location when ready.

  no_clusters: |
    ℹ️ Not enough related instincts to evolve yet.

    Current instincts: {count}
    Threshold: 3 related instincts

    Keep using Claude Code to build more instincts!

  dry_run: |
    🔍 Dry Run - No files created

    Found {cluster_count} potential evolutions:
    1. {type}: {name} ({instinct_count} instincts)
    2. {type}: {name} ({instinct_count} instincts)

    Run without --dry-run to create.
```

### 腳本實作

```javascript
// scripts/evolve.js
const fs = require('fs');
const path = require('path');

const INSTINCTS_DIR = path.join(
  process.env.VIBE_ENGINE_ROOT || '.vibe-engine',
  'instincts'
);

const EVOLVED_DIR = path.join(
  process.env.VIBE_ENGINE_ROOT || '.vibe-engine',
  'evolved'
);

function loadInstincts() {
  const files = fs.readdirSync(INSTINCTS_DIR);
  return files
    .filter(f => f.endsWith('.md'))
    .map(f => parseInstinct(path.join(INSTINCTS_DIR, f)));
}

function clusterInstincts(instincts, threshold = 3) {
  const domains = {};

  // Group by domain
  for (const i of instincts) {
    if (!domains[i.domain]) domains[i.domain] = [];
    domains[i.domain].push(i);
  }

  // Filter by threshold
  return Object.entries(domains)
    .filter(([_, items]) => items.length >= threshold)
    .map(([domain, items]) => ({
      domain,
      instincts: items,
      avgConfidence: items.reduce((s, i) => s + i.confidence, 0) / items.length
    }));
}

function decideEvolutionType(cluster) {
  const triggers = cluster.instincts.map(i => i.trigger);
  const actions = cluster.instincts.map(i => i.action);

  // Simple heuristics
  if (triggers.every(t => t.includes('when user'))) {
    return 'command';
  } else if (actions.some(a => a.includes('multi-step'))) {
    return 'agent';
  } else if (cluster.instincts.every(i => i.domain === 'constraint')) {
    return 'rule';
  }
  return 'skill';
}

function evolve(options = {}) {
  const { dryRun = true, threshold = 3, domain = null } = options;

  let instincts = loadInstincts();
  if (domain) {
    instincts = instincts.filter(i => i.domain === domain);
  }

  const clusters = clusterInstincts(instincts, threshold);

  if (clusters.length === 0) {
    return { status: 'no_clusters', instinctCount: instincts.length };
  }

  const evolutions = clusters.map(c => ({
    type: decideEvolutionType(c),
    name: `${c.domain}-evolved`,
    cluster: c,
    content: generateContent(c, decideEvolutionType(c))
  }));

  if (dryRun) {
    return { status: 'dry_run', evolutions };
  }

  // Create files
  for (const e of evolutions) {
    const dir = path.join(EVOLVED_DIR, `${e.type}s`);
    fs.mkdirSync(dir, { recursive: true });

    const filename = e.type === 'skill'
      ? path.join(dir, e.name, 'SKILL.md')
      : path.join(dir, `${e.name}.md`);

    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, e.content);
  }

  return { status: 'success', evolutions };
}

module.exports = { evolve };
```

---

## 參考資源

- [AI Agent Memory - IBM](https://www.ibm.com/think/topics/ai-agent-memory)
- [Memory in Agents - Mem0](https://mem0.ai/blog/memory-in-agents-what-why-and-how)
- [Agent Memory - Letta](https://www.letta.com/blog/agent-memory)
- [Context Engineering Part 2 - Phil Schmid](https://www.philschmid.de/context-engineering-part-2)
- [Multi-Agent Context Engineering - Vellum](https://www.vellum.ai/blog/multi-agent-systems-building-with-context-engineering)
