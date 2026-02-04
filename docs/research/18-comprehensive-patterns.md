# 18. 完整模式參考（Comprehensive Patterns Reference）

來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code) 深度分析（第三輪）

本章整合了 everything-claude-code 的完整實作模式，包括 MCP 整合、完整 hooks 配置、語言/框架 Skills、Agents 定義、以及 Rules 最佳實踐。

---

## 18.1 MCP 整合配置

### 完整 MCP Servers 配置

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PAT}"
      },
      "description": "GitHub operations - PRs, issues, repos"
    },
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}"
      },
      "description": "Web scraping and crawling"
    },
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest", "--project-ref=${PROJECT_REF}"],
      "description": "Supabase database operations"
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "description": "Persistent memory across sessions"
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      "description": "Chain-of-thought reasoning"
    },
    "vercel": {
      "type": "http",
      "url": "https://mcp.vercel.com",
      "description": "Vercel deployments and projects"
    },
    "railway": {
      "command": "npx",
      "args": ["-y", "@railway/mcp-server"],
      "description": "Railway deployments"
    },
    "cloudflare-docs": {
      "type": "http",
      "url": "https://docs.mcp.cloudflare.com/mcp",
      "description": "Cloudflare documentation search"
    },
    "cloudflare-workers-builds": {
      "type": "http",
      "url": "https://builds.mcp.cloudflare.com/mcp",
      "description": "Cloudflare Workers builds"
    },
    "cloudflare-workers-bindings": {
      "type": "http",
      "url": "https://bindings.mcp.cloudflare.com/mcp",
      "description": "Cloudflare Workers bindings"
    },
    "cloudflare-observability": {
      "type": "http",
      "url": "https://observability.mcp.cloudflare.com/mcp",
      "description": "Cloudflare observability/logs"
    },
    "clickhouse": {
      "type": "http",
      "url": "https://mcp.clickhouse.cloud/mcp",
      "description": "ClickHouse analytics queries"
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@context7/mcp-server"],
      "description": "Live documentation lookup"
    },
    "magic": {
      "command": "npx",
      "args": ["-y", "@magicuidesign/mcp@latest"],
      "description": "Magic UI components"
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/projects"],
      "description": "Filesystem operations"
    }
  },
  "_comments": {
    "usage": "Copy needed servers to ~/.claude.json mcpServers section",
    "env_vars": "Replace ${VAR} placeholders with actual values",
    "disabling": "Use disabledMcpServers array in project config",
    "context_warning": "Keep under 10 MCPs enabled to preserve context window"
  }
}
```

### MCP 服務類型分類

| 類型 | 服務 | 用途 |
|------|------|------|
| **版本控制** | github | PR、Issues、Repos 操作 |
| **資料庫** | supabase, clickhouse | 資料庫操作、分析查詢 |
| **部署** | vercel, railway | 部署和專案管理 |
| **基礎設施** | cloudflare-* | Workers、bindings、observability |
| **AI/推理** | sequential-thinking | 思維鏈推理 |
| **記憶** | memory | 跨 session 持久記憶 |
| **網頁** | firecrawl | 網頁爬蟲和抓取 |
| **文檔** | context7 | 即時文檔查詢 |
| **UI** | magic | Magic UI 元件 |
| **檔案系統** | filesystem | 檔案操作 |

### MCP 使用最佳實踐

```yaml
mcp_best_practices:
  context_management:
    max_enabled: 10  # 保持在 10 個以下以保護 context window

  per_project_config:
    # 在專案的 .claude/mcp.json 中禁用不需要的 MCP
    disabled_servers: ["filesystem", "magic"]

  security:
    - "永遠不要 commit 真實的 API keys"
    - "使用環境變數引用"
    - "定期輪換 tokens"

  selection_criteria:
    always_enable:
      - github  # 版本控制整合
      - memory  # 跨 session 記憶
    project_specific:
      - supabase  # 如果使用 Supabase
      - vercel    # 如果部署到 Vercel
```

---

## 18.2 完整 Hooks 配置

### 生產級 hooks.json

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "tool == \"Bash\" && tool_input.command matches \"(npm run dev|pnpm( run)? dev|yarn dev|bun run dev)\"",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"console.error('[Hook] BLOCKED: Dev server must run in tmux');console.error('[Hook] Use: tmux new-session -d -s dev \\\"npm run dev\\\"');process.exit(1)\""
          }
        ],
        "description": "Block dev servers outside tmux - ensures log access"
      },
      {
        "matcher": "tool == \"Bash\" && tool_input.command matches \"(npm (install|test)|pnpm|yarn|bun|cargo build|make|docker|pytest|vitest|playwright)\"",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"if(!process.env.TMUX){console.error('[Hook] Consider running in tmux for session persistence')}\""
          }
        ],
        "description": "Reminder to use tmux for long-running commands"
      },
      {
        "matcher": "tool == \"Bash\" && tool_input.command matches \"git push\"",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"console.error('[Hook] Review changes before push...')\""
          }
        ],
        "description": "Reminder before git push"
      },
      {
        "matcher": "tool == \"Write\" && tool_input.file_path matches \"\\\\.(md|txt)$\" && !(tool_input.file_path matches \"README\\\\.md|CLAUDE\\\\.md|AGENTS\\\\.md|CONTRIBUTING\\\\.md\")",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"const fs=require('fs');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const p=i.tool_input?.file_path||'';if(/\\.(md|txt)$/.test(p)&&!/(README|CLAUDE|AGENTS|CONTRIBUTING)\\.md$/.test(p)){console.error('[Hook] BLOCKED: Unnecessary documentation file');process.exit(1)}console.log(d)})\""
          }
        ],
        "description": "Block creation of random .md files"
      },
      {
        "matcher": "tool == \"Edit\" || tool == \"Write\"",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/suggest-compact.js\""
          }
        ],
        "description": "Suggest manual compaction at logical intervals"
      }
    ],
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/pre-compact.js\""
          }
        ],
        "description": "Save state before context compaction"
      }
    ],
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/session-start.js\""
          }
        ],
        "description": "Load previous context and detect package manager"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "tool == \"Bash\"",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const cmd=i.tool_input?.command||'';if(/gh pr create/.test(cmd)){const out=i.tool_output?.output||'';const m=out.match(/https:\\/\\/github.com\\/[^/]+\\/[^/]+\\/pull\\/\\d+/);if(m){console.error('[Hook] PR created: '+m[0])}}console.log(d)})\""
          }
        ],
        "description": "Log PR URL after creation"
      },
      {
        "matcher": "tool == \"Bash\" && tool_input.command matches \"(npm run build|pnpm build|yarn build)\"",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"console.error('[Hook] Build completed - async analysis running')\"",
            "async": true,
            "timeout": 30
          }
        ],
        "description": "Async build analysis (runs in background)"
      },
      {
        "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\\\.(ts|tsx|js|jsx)$\"",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"const{execFileSync}=require('child_process');const fs=require('fs');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const p=i.tool_input?.file_path;if(p&&fs.existsSync(p)){try{execFileSync('npx',['prettier','--write',p],{stdio:['pipe','pipe','pipe']})}catch(e){}}console.log(d)})\""
          }
        ],
        "description": "Auto-format with Prettier after edits"
      },
      {
        "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\\\.(ts|tsx)$\"",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"const{execSync}=require('child_process');const fs=require('fs');const path=require('path');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const p=i.tool_input?.file_path;if(p&&fs.existsSync(p)){let dir=path.dirname(p);while(dir!==path.dirname(dir)&&!fs.existsSync(path.join(dir,'tsconfig.json'))){dir=path.dirname(dir)}if(fs.existsSync(path.join(dir,'tsconfig.json'))){try{const r=execSync('npx tsc --noEmit --pretty false 2>&1',{cwd:dir,encoding:'utf8'});const lines=r.split('\\\\n').filter(l=>l.includes(p)).slice(0,10);if(lines.length)console.error(lines.join('\\\\n'))}catch(e){const lines=(e.stdout||'').split('\\\\n').filter(l=>l.includes(p)).slice(0,10);if(lines.length)console.error(lines.join('\\\\n'))}}}console.log(d)})\""
          }
        ],
        "description": "TypeScript check after .ts/.tsx edits"
      },
      {
        "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\\\.(ts|tsx|js|jsx)$\"",
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"const fs=require('fs');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const p=i.tool_input?.file_path;if(p&&fs.existsSync(p)){const c=fs.readFileSync(p,'utf8');const matches=[];c.split('\\\\n').forEach((l,idx)=>{if(/console\\\\.log/.test(l))matches.push((idx+1)+': '+l.trim())});if(matches.length){console.error('[Hook] WARNING: console.log found');matches.slice(0,5).forEach(m=>console.error(m))}}console.log(d)})\""
          }
        ],
        "description": "Warn about console.log statements"
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/check-console-log.js\""
          }
        ],
        "description": "Check for console.log in modified files"
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/session-end.js\""
          }
        ],
        "description": "Persist session state"
      },
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/evaluate-session.js\""
          }
        ],
        "description": "Evaluate session for extractable patterns"
      }
    ]
  }
}
```

### Hooks 功能分類

| Hook 事件 | 功能 | 用途 |
|-----------|------|------|
| **PreToolUse** | tmux 強制 | Dev server 必須在 tmux 中運行 |
| **PreToolUse** | git push 提醒 | 推送前提醒檢查變更 |
| **PreToolUse** | markdown 阻擋 | 防止創建不必要的 .md 檔案 |
| **PreToolUse** | compact 建議 | 在邏輯邊界建議 compact |
| **PreCompact** | 狀態保存 | compaction 前保存關鍵狀態 |
| **SessionStart** | context 載入 | 載入前次 context 和偵測環境 |
| **PostToolUse** | PR 日誌 | 記錄 PR 創建 URL |
| **PostToolUse** | 自動格式化 | Prettier 自動格式化 |
| **PostToolUse** | TypeScript 檢查 | 編輯後即時類型檢查 |
| **PostToolUse** | console.log 警告 | 警告遺留的 console.log |
| **Stop** | console.log 檢查 | 停止前最終檢查 |
| **SessionEnd** | 狀態持久化 | 保存 session 狀態 |
| **SessionEnd** | 模式評估 | 提取可學習的模式 |

---

## 18.3 語言/框架 Skills 摘要

### Golang Patterns

**核心原則**：

| 原則 | 說明 |
|------|------|
| Simplicity | Go favors simplicity over cleverness |
| Zero Value Useful | 設計類型使其零值可直接使用 |
| Accept Interfaces | 函數接受介面參數，返回具體類型 |
| EAFP Error Handling | 使用 `errors.Is` 和 `errors.As` |

**關鍵模式**：

```go
// Worker Pool
func WorkerPool(jobs <-chan Job, results chan<- Result, numWorkers int) {
    var wg sync.WaitGroup
    for i := 0; i < numWorkers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for job := range jobs {
                results <- process(job)
            }
        }()
    }
    wg.Wait()
    close(results)
}

// Graceful Shutdown
func GracefulShutdown(server *http.Server) {
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    server.Shutdown(ctx)
}

// Functional Options Pattern
type Option func(*Server)

func WithTimeout(d time.Duration) Option {
    return func(s *Server) { s.timeout = d }
}

func NewServer(addr string, opts ...Option) *Server {
    s := &Server{addr: addr, timeout: 30 * time.Second}
    for _, opt := range opts {
        opt(s)
    }
    return s
}
```

### Frontend Patterns (React/Next.js)

**核心模式**：

| 模式 | 用途 |
|------|------|
| Composition | 組件組合優於繼承 |
| Compound Components | 共享狀態的組件群組 |
| Render Props | 靈活的渲染控制 |
| Custom Hooks | 邏輯複用 |

**關鍵實作**：

```typescript
// Custom Hook - useDebounce
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

// Context + Reducer Pattern
type Action =
  | { type: 'SET_DATA'; payload: Data[] }
  | { type: 'SET_LOADING'; payload: boolean }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_DATA': return { ...state, data: action.payload }
    case 'SET_LOADING': return { ...state, loading: action.payload }
    default: return state
  }
}

// Virtualization for Long Lists
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 100,
  overscan: 5
})
```

### Django Patterns

**核心架構**：

```
myproject/
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── development.py
│   │   └── production.py
│   ├── urls.py
│   └── wsgi.py
└── apps/
    ├── users/
    └── products/
```

**關鍵模式**：

```python
# Custom QuerySet
class ProductQuerySet(models.QuerySet):
    def active(self):
        return self.filter(is_active=True)

    def with_category(self):
        return self.select_related('category')

    def in_stock(self):
        return self.filter(stock__gt=0)

# Service Layer
class OrderService:
    @staticmethod
    @transaction.atomic
    def create_order(user, cart: Cart) -> Order:
        order = Order.objects.create(user=user, total_price=cart.total_price)
        for item in cart.items.all():
            OrderItem.objects.create(
                order=order,
                product=item.product,
                quantity=item.quantity,
                price=item.product.price
            )
        cart.items.all().delete()
        return order
```

### Python Patterns

**核心原則**：

| 原則 | 說明 |
|------|------|
| Readability | 可讀性優先 |
| Explicit | 明確優於隱式 |
| EAFP | 請求寬恕而非許可 |
| Type Hints | 使用類型提示 |

**關鍵模式**：

```python
# Protocol-Based Duck Typing
from typing import Protocol

class Renderable(Protocol):
    def render(self) -> str: ...

def render_all(items: list[Renderable]) -> str:
    return "\n".join(item.render() for item in items)

# Context Manager
@contextmanager
def timer(name: str):
    start = time.perf_counter()
    yield
    elapsed = time.perf_counter() - start
    print(f"{name} took {elapsed:.4f} seconds")

# Dataclass with Validation
@dataclass
class User:
    email: str
    age: int

    def __post_init__(self):
        if "@" not in self.email:
            raise ValueError(f"Invalid email: {self.email}")
```

### Spring Boot Patterns

**核心架構**：

```java
// REST Controller
@RestController
@RequestMapping("/api/markets")
@Validated
class MarketController {
    private final MarketService marketService;

    @GetMapping
    ResponseEntity<Page<MarketResponse>> list(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(marketService.list(PageRequest.of(page, size))
            .map(MarketResponse::from));
    }
}

// Service with Transactions
@Service
public class MarketService {
    @Transactional
    public Market create(CreateMarketRequest request) {
        MarketEntity entity = MarketEntity.from(request);
        return Market.from(repo.save(entity));
    }
}

// Caching
@Cacheable(value = "market", key = "#id")
public Market getById(Long id) {
    return repo.findById(id)
        .map(Market::from)
        .orElseThrow(() -> new EntityNotFoundException("Market not found"));
}
```

---

## 18.4 Continuous Learning v2

### Instinct-Based 架構

```
Session Activity
      │
      │ Hooks 捕獲（100% 可靠）
      ▼
┌─────────────────────────────────────────┐
│         observations.jsonl              │
└─────────────────────────────────────────┘
      │
      │ Observer agent（Haiku）
      ▼
┌─────────────────────────────────────────┐
│          PATTERN DETECTION              │
│   • User corrections → instinct         │
│   • Error resolutions → instinct        │
│   • Repeated workflows → instinct       │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│         instincts/personal/             │
│   • prefer-functional.md (0.7)          │
│   • always-test-first.md (0.9)          │
└─────────────────────────────────────────┘
      │
      │ /evolve clusters
      ▼
┌─────────────────────────────────────────┐
│              evolved/                   │
│   • commands/new-feature.md             │
│   • skills/testing-workflow.md          │
│   • agents/refactor-specialist.md       │
└─────────────────────────────────────────┘
```

### Instinct 格式

```yaml
---
id: prefer-functional-style
trigger: "when writing new functions"
confidence: 0.7
domain: "code-style"
source: "session-observation"
---

# Prefer Functional Style

## Action
Use functional patterns over classes when appropriate.

## Evidence
- Observed 5 instances of functional pattern preference
- User corrected class-based approach to functional
```

### Confidence Scoring

| 分數 | 含義 | 行為 |
|------|------|------|
| 0.3 | Tentative | 建議但不強制 |
| 0.5 | Moderate | 相關時應用 |
| 0.7 | Strong | 自動應用 |
| 0.9 | Near-certain | 核心行為 |

### v1 vs v2 比較

| 功能 | v1 | v2 |
|------|----|----|
| 觀察 | Stop hook | PreToolUse/PostToolUse (100%) |
| 分析 | Main context | Background agent (Haiku) |
| 粒度 | Full skills | Atomic "instincts" |
| Confidence | None | 0.3-0.9 加權 |
| 演化 | Direct to skill | Instincts → cluster → skill |

---

## 18.5 Rules 最佳實踐

### Security Rules

```yaml
mandatory_checks:
  before_any_commit:
    - No hardcoded secrets (API keys, passwords, tokens)
    - All user inputs validated
    - SQL injection prevention (parameterized queries)
    - XSS prevention (sanitized HTML)
    - CSRF protection enabled
    - Authentication/authorization verified
    - Rate limiting on all endpoints
    - Error messages don't leak sensitive data

secret_management:
  never: "Hardcoded in source code"
  always: "Environment variables"
  verify: "Throw if not configured"

response_protocol:
  if_security_issue_found:
    1: "STOP immediately"
    2: "Use security-reviewer agent"
    3: "Fix CRITICAL issues before continuing"
    4: "Rotate any exposed secrets"
    5: "Review entire codebase for similar issues"
```

### Testing Rules

```yaml
minimum_coverage: 80%

test_types:
  required:
    - Unit Tests: Individual functions, utilities, components
    - Integration Tests: API endpoints, database operations
    - E2E Tests: Critical user flows (Playwright)

tdd_workflow:
  mandatory:
    1: Write test first (RED)
    2: Run test - should FAIL
    3: Write minimal implementation (GREEN)
    4: Run test - should PASS
    5: Refactor (IMPROVE)
    6: Verify coverage (80%+)

agents:
  tdd-guide: "Use PROACTIVELY for new features"
  e2e-runner: "Playwright E2E testing specialist"
```

### Performance Rules

```yaml
model_selection:
  haiku_4.5:
    usage: "90% of Sonnet capability, 3x cost savings"
    for:
      - Lightweight agents with frequent invocation
      - Pair programming and code generation
      - Worker agents in multi-agent systems

  sonnet_4.5:
    usage: "Best coding model"
    for:
      - Main development work
      - Orchestrating multi-agent workflows
      - Complex coding tasks

  opus_4.5:
    usage: "Deepest reasoning"
    for:
      - Complex architectural decisions
      - Maximum reasoning requirements
      - Research and analysis tasks

context_management:
  avoid_last_20_percent_for:
    - Large-scale refactoring
    - Feature implementation spanning multiple files
    - Debugging complex interactions

  lower_context_sensitivity:
    - Single-file edits
    - Independent utility creation
    - Documentation updates
    - Simple bug fixes

ultrathink_plan_mode:
  for_complex_tasks:
    1: "Use ultrathink for enhanced thinking"
    2: "Enable Plan Mode for structured approach"
    3: "Rev the engine with multiple critique rounds"
    4: "Use split role sub-agents for diverse analysis"
```

### Agent Orchestration Rules

```yaml
available_agents:
  planner: "Complex features, refactoring"
  architect: "System design, architectural decisions"
  tdd-guide: "New features, bug fixes"
  code-reviewer: "After writing code"
  security-reviewer: "Before commits"
  build-error-resolver: "When build fails"
  e2e-runner: "Critical user flows"
  refactor-cleaner: "Dead code cleanup"
  doc-updater: "Documentation updates"

immediate_usage:
  no_user_prompt_needed:
    - "Complex feature requests → planner"
    - "Code just written → code-reviewer"
    - "Bug fix or new feature → tdd-guide"
    - "Architectural decision → architect"

parallel_execution:
  always_use_parallel_for:
    - Independent security analysis
    - Performance review
    - Type checking

multi_perspective:
  for_complex_problems:
    - Factual reviewer
    - Senior engineer
    - Security expert
    - Consistency reviewer
    - Redundancy checker
```

### Patterns Rules

```yaml
api_response_format:
  typescript: |
    interface ApiResponse<T> {
      success: boolean
      data?: T
      error?: string
      meta?: {
        total: number
        page: number
        limit: number
      }
    }

repository_pattern:
  typescript: |
    interface Repository<T> {
      findAll(filters?: Filters): Promise<T[]>
      findById(id: string): Promise<T | null>
      create(data: CreateDto): Promise<T>
      update(id: string, data: UpdateDto): Promise<T>
      delete(id: string): Promise<void>
    }

skeleton_projects:
  workflow:
    1: "Search for battle-tested skeleton projects"
    2: "Use parallel agents to evaluate options"
    3: "Clone best match as foundation"
    4: "Iterate within proven structure"
```

---

## 18.6 Agent 定義範例

### Planner Agent

```markdown
---
name: planner
description: Expert planning specialist for complex features and refactoring. Use PROACTIVELY when users request feature implementation, architectural changes, or complex refactoring.
tools: ["Read", "Grep", "Glob"]
model: opus
---

You are an expert planning specialist focused on creating comprehensive, actionable implementation plans.

## Planning Process

### 1. Requirements Analysis
- Understand the feature request completely
- Ask clarifying questions if needed
- Identify success criteria
- List assumptions and constraints

### 2. Architecture Review
- Analyze existing codebase structure
- Identify affected components
- Review similar implementations
- Consider reusable patterns

### 3. Step Breakdown
Create detailed steps with:
- Clear, specific actions
- File paths and locations
- Dependencies between steps
- Estimated complexity
- Potential risks

### 4. Implementation Order
- Prioritize by dependencies
- Group related changes
- Minimize context switching
- Enable incremental testing
```

### Build Error Resolver Agent

```markdown
---
name: build-error-resolver
description: Build and TypeScript error resolution specialist. Use PROACTIVELY when build fails or type errors occur. Fixes build/type errors only with minimal diffs, no architectural edits.
tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]
model: opus
---

# Core Principle
Fix errors quickly with minimal changes. Don't refactor, don't optimize, don't redesign.

## Minimal Diff Strategy

### DO:
✅ Add type annotations where missing
✅ Add null checks where needed
✅ Fix imports/exports
✅ Add missing dependencies
✅ Update type definitions
✅ Fix configuration files

### DON'T:
❌ Refactor unrelated code
❌ Change architecture
❌ Rename variables/functions
❌ Add new features
❌ Change logic flow
❌ Optimize performance

## Success Metrics
- ✅ `npx tsc --noEmit` exits with code 0
- ✅ `npm run build` completes successfully
- ✅ No new errors introduced
- ✅ Minimal lines changed (< 5% of affected file)
```

### Security Reviewer Agent

```markdown
---
name: security-reviewer
description: Security vulnerability detection and remediation specialist. Use PROACTIVELY after writing code that handles user input, authentication, API endpoints, or sensitive data.
tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"]
model: opus
---

## OWASP Top 10 Analysis

For each category, check:
1. **Injection** - Are queries parameterized?
2. **Broken Authentication** - Are passwords hashed?
3. **Sensitive Data Exposure** - Is HTTPS enforced?
4. **XML External Entities** - Are parsers configured securely?
5. **Broken Access Control** - Is authorization checked?
6. **Security Misconfiguration** - Are defaults changed?
7. **Cross-Site Scripting** - Is output escaped?
8. **Insecure Deserialization** - Is user input deserialized safely?
9. **Using Vulnerable Components** - Are dependencies up to date?
10. **Insufficient Logging** - Are security events logged?

## Critical Checks for Financial Platforms

- [ ] All market trades are atomic transactions
- [ ] Balance checks before any withdrawal/trade
- [ ] Rate limiting on all financial endpoints
- [ ] Audit logging for all money movements
- [ ] No floating-point arithmetic for money
- [ ] Wallet signatures properly validated
```

---

## 18.7 Skills 完整清單

### 從 everything-claude-code 發現的 Skills

| Skill | 領域 | 用途 |
|-------|------|------|
| backend-patterns | Backend | 後端開發模式 |
| clickhouse-io | Database | ClickHouse 操作 |
| coding-standards | General | 編碼標準 |
| continuous-learning | Learning | 學習系統 v1 |
| continuous-learning-v2 | Learning | 學習系統 v2 (Instinct-based) |
| django-patterns | Python | Django 架構模式 |
| django-security | Python | Django 安全 |
| django-tdd | Python | Django TDD |
| django-verification | Python | Django 驗證 |
| eval-harness | Testing | EDD 評估驅動開發 |
| frontend-patterns | Frontend | React/Next.js 模式 |
| golang-patterns | Go | Go 開發模式 |
| golang-testing | Go | Go 測試 |
| iterative-retrieval | Context | 漸進式檢索 |
| java-coding-standards | Java | Java 編碼標準 |
| jpa-patterns | Java | JPA 模式 |
| postgres-patterns | Database | PostgreSQL 模式 |
| project-guidelines-example | General | 專案指南範例 |
| python-patterns | Python | Python 開發模式 |
| python-testing | Python | Python 測試 |
| security-review | Security | 安全審查 |
| springboot-patterns | Java | Spring Boot 模式 |
| springboot-security | Java | Spring Boot 安全 |
| springboot-tdd | Java | Spring Boot TDD |
| springboot-verification | Java | Spring Boot 驗證 |
| strategic-compact | Context | 策略性壓縮 |
| tdd-workflow | Testing | TDD 工作流程 |
| verification-loop | Quality | 6 階段驗證循環 |

---

## 參考資源

- [everything-claude-code](https://github.com/affaan-m/everything-claude-code)
- [The Longform Guide](https://x.com/affaanmustafa/status/2014040193557471352)
- [Homunculus](https://github.com/humanplane/homunculus)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
