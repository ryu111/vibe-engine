# 3. 狀態管理

## 問題定義

長時間運行的任務中斷後，如何恢復到之前的進度繼續執行？

---

## 子問題拆解

### 3.1 任務狀態機

**問題**：任務有哪些狀態？狀態之間如何轉換？

**現有認知**：
```
QUEUED → IN_PROGRESS → COMPLETED
              ↓
        ┌─────┴─────┐
        ↓           ↓
     PAUSED      FAILED
        ↓           ↓
        └───→ RESUMABLE ←───┘
```

**待解決**：
- [ ] 狀態轉換的觸發條件？
- [ ] 每個狀態需要保存什麼資訊？
- [ ] 狀態如何持久化儲存？

---

### 3.2 Checkpoint 機制

**問題**：何時建立 Checkpoint？Checkpoint 包含什麼？

**現有認知**：
```yaml
triggers:
  - after_each_agent_completion
  - before_external_api_call
  - after_file_modification
  - interval: 5m

capture:
  - task_state
  - agent_context
  - file_changes
  - tool_outputs
  - decision_history
```

**待解決**：
- [ ] Checkpoint 的儲存格式？
- [ ] 如何避免 Checkpoint 過大？
- [ ] 如何清理過期的 Checkpoint？

---

### 3.3 中斷恢復流程

**問題**：從 Checkpoint 恢復時，具體步驟是什麼？

**現有認知**：
- 讀取最近的 Checkpoint
- 還原狀態
- 告知用戶上次進度
- 繼續執行

**待解決**：
- [ ] 如何驗證 Checkpoint 的完整性？
- [ ] 環境變化後（如文件被外部修改）如何處理？
- [ ] 恢復時是否需要用戶確認？

---

### 3.4 並發衝突處理

**問題**：多個 Agent 同時修改同一文件時怎麼辦？

**現有認知**：
```
策略層級：
1. 預防 - 任務分解時避免重疊
2. 檢測 - 樂觀鎖，修改前檢查版本
3. 解決 - Three-way merge / 人類仲裁
```

**待解決**：
- [ ] 樂觀鎖的具體實作？
- [ ] Three-way merge 在 Agent 場景如何使用？
- [ ] 衝突解決的自動化程度？

---

### 3.5 版本漂移處理

**問題**：任務執行期間，其他人修改了代碼庫怎麼辦？

**現有認知**：
```yaml
drift_types:
  - upstream_changes: 主分支有新提交
  - conflicting_changes: 相同文件被修改
  - force_push: 遠端歷史被重寫
```

**待解決**：
- [ ] 如何檢測漂移？
- [ ] 自動 rebase 的安全邊界？
- [ ] 漂移後的任務是否需要重新開始？

---

## 現有方案

### LangGraph + DynamoDB
- 使用 DynamoDB 持久化狀態
- Thread-level checkpointing

### Microsoft Agent Framework
- Checkpointing and Resuming Workflows
- 工作流級別的狀態保存

### OpenClaw Lobster
- 可恢復的工作流運行時
- 自動持久化執行狀態

---

## 我們的解法

### 3.1 解法：任務狀態機

**狀態定義與轉換規則**：
```typescript
enum TaskStatus {
  QUEUED = 'queued',           // 等待執行
  IN_PROGRESS = 'in_progress', // 執行中
  PAUSED = 'paused',           // 人工暫停
  WAITING = 'waiting',         // 等待外部輸入
  COMPLETED = 'completed',     // 成功完成
  FAILED = 'failed',           // 執行失敗
  CANCELLED = 'cancelled',     // 已取消
}

const STATE_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.QUEUED]: ['IN_PROGRESS', 'CANCELLED'],
  [TaskStatus.IN_PROGRESS]: ['PAUSED', 'WAITING', 'COMPLETED', 'FAILED'],
  [TaskStatus.PAUSED]: ['IN_PROGRESS', 'CANCELLED'],
  [TaskStatus.WAITING]: ['IN_PROGRESS', 'CANCELLED', 'FAILED'],
  [TaskStatus.COMPLETED]: [],  // 終態
  [TaskStatus.FAILED]: ['QUEUED'],  // 可重試
  [TaskStatus.CANCELLED]: [],  // 終態
};
```

**各狀態需要保存的資訊**：
```yaml
state_data:
  QUEUED:
    - task_id
    - created_at
    - priority
    - estimated_complexity
    - input_request

  IN_PROGRESS:
    - current_agent
    - current_step
    - iteration_count
    - started_at
    - last_activity_at
    - accumulated_context

  PAUSED:
    - paused_at
    - pause_reason
    - resume_instructions
    - snapshot: full_state_at_pause

  WAITING:
    - waiting_for: "user_input" | "external_api" | "human_approval"
    - prompt_shown_to_user
    - timeout_at

  COMPLETED:
    - completed_at
    - final_output
    - files_modified[]
    - verification_results

  FAILED:
    - failed_at
    - error_type
    - error_message
    - stack_trace
    - recoverable: boolean
    - retry_count
```

**狀態持久化儲存**：
```yaml
persistence:
  storage_backend: file_system  # 輕量，適合 CLI 環境

  file_structure:
    base_path: .vibe-engine/tasks/
    layout:
      - {task_id}/
        - state.json      # 當前狀態
        - checkpoints/    # 歷史 checkpoints
          - {timestamp}.json
        - context/        # 大型 context 分離儲存
          - agent_outputs/
          - tool_results/

  state_json_schema:
    version: "1.0"
    task_id: string
    status: TaskStatus
    created_at: ISO8601
    updated_at: ISO8601
    data: StateData  # 根據 status 不同而不同
    checksum: SHA256  # 完整性校驗
```

---

### 3.2 解法：Checkpoint 機制

**Checkpoint 觸發時機**：
```yaml
checkpoint_triggers:
  event_based:
    - after_agent_completion:
        description: 每個 SubAgent 完成後
        priority: high

    - before_dangerous_operation:
        description: 執行 bash、修改檔案前
        priority: critical

    - after_user_interaction:
        description: 用戶輸入後
        priority: high

  time_based:
    interval: 5m
    condition: state_changed_since_last_checkpoint

  size_based:
    trigger_when: context_delta > 10KB
```

**Checkpoint 內容**：
```typescript
interface Checkpoint {
  // 元資料
  id: string;
  task_id: string;
  created_at: string;
  sequence_number: number;

  // 狀態快照
  state: {
    status: TaskStatus;
    current_agent: string | null;
    iteration: number;
    progress: number;  // 0-100
  };

  // Context 快照
  context: {
    messages: Message[];  // 對話歷史
    tool_outputs: ToolOutput[];  // 工具輸出
    decisions: Decision[];  // 已做的決定
  };

  // 檔案變更記錄
  file_changes: {
    modified: FileChange[];
    created: string[];
    deleted: string[];
  };

  // 可恢復性資訊
  recovery_info: {
    resume_point: string;  // 從哪裡繼續
    required_context: string[];  // 恢復需要什麼
    env_requirements: Record<string, string>;  // 環境要求
  };
}
```

**Checkpoint 大小控制**：
```yaml
size_control:
  max_checkpoint_size: 5MB

  compression:
    enabled: true
    algorithm: gzip
    threshold: 100KB  # 超過才壓縮

  separation:
    inline_threshold: 10KB
    large_data_storage: .vibe-engine/tasks/{task_id}/blobs/
    reference_format: "blob://{blob_id}"

  trimming:
    tool_outputs:
      keep: last_5
      summarize: older_ones
    messages:
      keep: last_50
      compress: older_ones_to_summary
```

**Checkpoint 清理策略**：
```yaml
cleanup:
  retention:
    completed_tasks: 7d
    failed_tasks: 30d
    in_progress_tasks: unlimited

  per_task_limits:
    max_checkpoints: 20
    keep_strategy:
      - always_keep: first, last
      - sample_between: every_5th

  cleanup_triggers:
    - on_task_completion
    - on_disk_usage > 80%
    - daily_at: 03:00
```

---

### 3.3 解法：中斷恢復流程

**恢復流程**：
```yaml
recovery_flow:
  step_1_find_checkpoint:
    action: 找到最近的有效 checkpoint
    validation:
      - checksum_valid
      - not_corrupted
      - env_compatible

  step_2_verify_environment:
    checks:
      - working_directory_exists
      - required_files_present
      - no_conflicting_changes
    on_mismatch:
      action: notify_user_and_confirm

  step_3_restore_state:
    actions:
      - load_checkpoint_data
      - restore_context
      - set_task_status: IN_PROGRESS
    notification: |
      🔄 恢復任務: {task_name}
      📍 從第 {iteration} 輪繼續
      📝 上次進度: {last_progress_summary}

  step_4_resume_execution:
    start_from: checkpoint.recovery_info.resume_point
    with_context: restored_context
```

**Checkpoint 完整性驗證**：
```typescript
interface CheckpointValidation {
  structural: {
    hasRequiredFields: boolean;
    schemaValid: boolean;
  };
  integrity: {
    checksumMatch: boolean;
    blobsAccessible: boolean;
  };
  environmental: {
    workingDirectoryExists: boolean;
    filesUnchanged: boolean;  // 比對 file hashes
    dependenciesAvailable: boolean;
  };
}

async function validateCheckpoint(cp: Checkpoint): Promise<CheckpointValidation> {
  // 結構驗證
  const structural = validateSchema(cp);

  // 完整性驗證
  const integrity = {
    checksumMatch: computeChecksum(cp) === cp.checksum,
    blobsAccessible: await verifyBlobs(cp.context),
  };

  // 環境驗證
  const environmental = {
    workingDirectoryExists: await fs.exists(cp.recovery_info.working_dir),
    filesUnchanged: await compareFileHashes(cp.file_changes),
    dependenciesAvailable: await checkDependencies(cp.recovery_info.env_requirements),
  };

  return { structural, integrity, environmental };
}
```

**環境變化處理**：
```yaml
environment_change_handling:
  file_modified_externally:
    detection: hash_mismatch
    options:
      - use_current: 使用當前檔案版本，忽略 checkpoint 的變更
      - use_checkpoint: 還原到 checkpoint 時的版本
      - merge: 嘗試合併兩者的變更
      - abort: 終止恢復，讓用戶處理
    default: ask_user

  file_deleted:
    options:
      - restore: 從 checkpoint 恢復檔案
      - skip: 跳過相關操作
      - abort: 終止恢復
    default: ask_user

  new_commits_upstream:
    detection: git fetch && compare HEAD
    options:
      - ignore: 繼續使用當前 HEAD
      - rebase: 嘗試 rebase 到最新
      - abort: 終止並建議用戶手動處理
    default: notify_and_ask
```

---

### 3.4 解法：並發衝突處理

**預防層：任務分配時的檔案鎖定**：
```yaml
file_reservation:
  mechanism: soft_lock
  implementation:
    lock_file: .vibe-engine/locks/{file_path_hash}.lock
    content:
      owner: agent_id
      acquired_at: timestamp
      expires_at: timestamp + 5m
      operation: read | write

  allocation_rules:
    - 同一檔案只能有一個 writer
    - 多個 reader 可以共存
    - writer 和 reader 互斥
```

**檢測層：樂觀鎖實作**：
```typescript
interface FileVersion {
  path: string;
  hash: string;  // 內容的 SHA256
  mtime: number; // 修改時間
}

class OptimisticLock {
  private versions: Map<string, FileVersion> = new Map();

  async acquire(filePath: string): Promise<FileVersion> {
    const content = await fs.readFile(filePath);
    const version: FileVersion = {
      path: filePath,
      hash: sha256(content),
      mtime: (await fs.stat(filePath)).mtimeMs,
    };
    this.versions.set(filePath, version);
    return version;
  }

  async checkAndCommit(filePath: string, newContent: string): Promise<CommitResult> {
    const originalVersion = this.versions.get(filePath);
    const currentHash = sha256(await fs.readFile(filePath));

    if (currentHash !== originalVersion.hash) {
      return {
        success: false,
        reason: 'CONFLICT',
        originalVersion,
        currentHash,
      };
    }

    await fs.writeFile(filePath, newContent);
    return { success: true };
  }
}
```

**解決層：Three-Way Merge**：
```yaml
three_way_merge:
  inputs:
    base: checkpoint 時的檔案版本
    ours: Agent 修改後的版本
    theirs: 當前檔案版本（被外部修改）

  process:
    step_1: 計算 base → ours 的 diff
    step_2: 計算 base → theirs 的 diff
    step_3: 嘗試合併兩個 diff

  outcomes:
    clean_merge:
      condition: 沒有重疊的修改區域
      action: 自動合併並繼續

    conflict:
      condition: 有重疊的修改區域
      action: |
        1. 生成帶有 conflict markers 的檔案
        2. 嘗試 AI 輔助解決
        3. 如果 AI 無法解決 → 詢問用戶

  ai_resolution:
    prompt: |
      以下檔案有合併衝突，請選擇最佳解法：

      <<<<<<< OURS (Agent 的修改)
      {ours_content}
      =======
      {theirs_content}
      >>>>>>> THEIRS (外部修改)

      上下文：
      - Agent 的目的是：{agent_intent}
      - 外部修改可能是：{inferred_external_intent}

      請提供合併後的程式碼：
```

---

### 3.5 解法：版本漂移處理

**漂移檢測**：
```yaml
drift_detection:
  triggers:
    - before_task_resume
    - before_commit
    - periodic: every_10m_during_long_tasks

  checks:
    upstream_changes:
      command: git fetch origin && git rev-list HEAD..origin/main --count
      drift_if: count > 0

    local_uncommitted:
      command: git status --porcelain
      drift_if: output.length > 0

    force_push_detected:
      command: git reflog | compare with last known
      drift_if: history_rewritten
```

**漂移處理策略**：
```yaml
drift_handling:
  upstream_changes:
    severity_assessment:
      low:
        condition: 沒有修改相同檔案
        action: 繼續工作，完成後再 rebase
      medium:
        condition: 修改了相同檔案但不同區域
        action: 通知用戶，建議盡快 rebase
      high:
        condition: 修改了相同檔案的相同區域
        action: 暫停任務，必須先處理衝突

  auto_rebase:
    enabled: false  # 預設禁用，太危險
    safe_conditions:
      - no_conflict_files
      - tests_still_pass_after_rebase
      - user_has_granted_permission

  force_push_detected:
    action: |
      ⚠️ 遠端歷史被重寫，這可能導致工作丟失。
      建議：
      1. 停止當前任務
      2. 手動檢查並同步本地狀態
      3. 重新開始任務

  restart_decision:
    factors:
      - progress_percentage
      - conflict_severity
      - user_preference
    recommendation: |
      if progress < 20% AND conflict = high:
        recommend: restart
      else:
        recommend: merge_and_continue
```

**版本追蹤記錄**：
```typescript
interface VersionTracker {
  task_id: string;
  started_at_commit: string;
  current_head: string;
  upstream_head: string;
  drift_events: DriftEvent[];
}

interface DriftEvent {
  detected_at: string;
  type: 'upstream_change' | 'local_change' | 'force_push';
  details: {
    commits_behind?: number;
    conflicting_files?: string[];
    old_head?: string;
    new_head?: string;
  };
  resolution: 'ignored' | 'rebased' | 'task_restarted' | 'user_handled';
}
```

---

## 參考資源

- [Build Durable AI Agents with LangGraph - AWS](https://aws.amazon.com/blogs/database/build-durable-ai-agents-with-langgraph-and-amazon-dynamodb/)
- [Checkpointing and Resuming - Microsoft](https://learn.microsoft.com/en-us/agent-framework/tutorials/workflows/checkpointing-and-resuming)
- [AI Merge Conflict Resolution - Graphite](https://graphite.com/guides/ai-code-merge-conflict-resolution)
- [Concurrency and Automatic Conflict Resolution - DEV.to](https://dev.to/frosnerd/concurrency-and-automatic-conflict-resolution-4i9o)
