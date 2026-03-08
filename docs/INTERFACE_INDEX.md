# INTERFACE_INDEX.md — 接口与 Schema 索引

> **由 Codex 维护。** 每次新增或修改接口、事件、MCP Tool、HTTP 端点、DB 表时，必须同步更新本文件。
>
> 权威定义源：`packages/protocol/src/`（zod schema）和各包的实现文件。
> 本文件是"可读索引"，不替代源码。

## 目录

- [Protocol 事件类型](#protocol-事件类型)
- [MCP Tools — Tools API](#mcp-tools--tools-api)
- [MCP Tools — Soul API](#mcp-tools--soul-api)
- [Core HTTP 端点](#core-http-端点)
- [SQLite 表结构 — state.db](#sqlite-表结构--statedb)
- [SQLite 表结构 — soul.db](#sqlite-表结构--souldb)
- [xstate 状态机](#xstate-状态机)
- [Policy 配置格式](#policy-配置格式)
- [Pointer 格式规范](#pointer-格式规范)
- [内部通信协议](#内部通信协议)
- [变更记录](#变更记录)

---

## Protocol 事件类型

> 源文件：`packages/protocol/src/events/`
> 所有事件共享基础字段：`revision: number, timestamp: string(ISO8601), runId: string, source: string`

### RunLifecycleEvent
**判别字段：** `status`

| status | 触发方 | 关键附加字段 |
|--------|--------|-------------|
| `created` | Core | `workspaceId, agentId?, engineType` |
| `started` | Core | `worktreePath?` |
| `waiting_approval` | Core (ApprovalMachine) | `approvalId, toolName` |
| `completed` | Core | `duration?, artifactIds?` |
| `failed` | Core | `error: string, code?` |
| `cancelled` | Core / UI | `cancelledBy` |
| `interrupted` | Core | `reason: 'agent_stuck' \| 'core_restart' \| 'network_error'` |

> 源文件：`packages/protocol/src/events/run.ts`

---

### ToolExecutionEvent
**判别字段：** `status`

| status | 触发方 | 关键附加字段 |
|--------|--------|-------------|
| `requested` | Hook Runner / Codex Adapter | `toolName: string, args: object, approvalId?, rawToolName?, hookEventName?` |
| `approved` | Policy Engine / User | `approvedBy: 'policy' \| 'user', approvalId?, input?` |
| `denied` | Policy Engine / User | `reason: string, approvalId?, resolutionStatus?` |
| `executing` | Tool Runner | `pid?` |
| `completed` | Tool Runner | `output: string, exitCode: number` |
| `failed` | Tool Runner | `error: string` |

> 源文件：`packages/protocol/src/events/tool.ts`
> Codex `approval_request` 由 Adapter 归一化为 `ToolExecutionEvent.requested`；请求标识兼容 `requestId | id | request_id`，并以 `approvalId` 透传。

---

### EngineOutputEvent
**判别字段：** `type`

| type | 触发方 | 关键附加字段 |
|------|--------|-------------|
| `token_stream` | Engine Adapter | `text: string, isComplete: boolean` |
| `plan_node` | Engine Adapter | `nodeId, title, status: 'pending\|active\|done\|failed'` |
| `diff` | Engine Adapter | `path: string, patch: string, hunks: number` |

> 源文件：`packages/protocol/src/events/engine.ts`

---

### MemoryOperationEvent
**判别字段：** `operation`

| operation | 触发方 | 关键附加字段 |
|-----------|--------|-------------|
| `search` | Soul | `query, results: CueRef[], budgetUsed: number` |
| `open` | Soul | `pointer, level: 'hint\|excerpt\|full', tokensUsed: number` |
| `propose` | Soul | `proposalId, requiresCheckpoint: boolean` |
| `commit` | Soul | `proposalId, cueId, commitSha?` |

> 源文件：`packages/protocol/src/events/memory.ts`

---

### SystemHealthEvent
**判别字段：** `event`

| event | 触发方 | 关键附加字段 |
|-------|--------|-------------|
| `engine_connect` | Claude / Codex Adapter | `engineType: 'claude'\|'codex', version: string` |
| `engine_disconnect` | Claude / Codex Adapter | `engineType, reason: string` |
| `circuit_break` | Engine Machine | `engineType, failureCount: number` |
| `network_status` | Core | `online: boolean` |
| `checkpoint_queue` | Soul | `projectId?, pendingCount: number` |
| `soul_mode` | Soul Compute Registry | `soul_mode: 'basic'\|'enhanced', provider?, reason?` |

> 源文件：`packages/protocol/src/events/system.ts`

---

### IntegrationEvent
**判别字段：** `event`

| event | 触发方 | 关键附加字段 |
|-------|--------|-------------|
| `gate_passed` | Integrator | `workspaceId, touchedPaths?, baselineErrorCount?, afterErrorCount?` |
| `gate_failed` | Integrator | `workspaceId, touchedPaths: string[], baselineErrorCount, afterErrorCount, newDiagnostics: string[]` |
| `conflict` | Integrator | `workspaceId, touchedPaths: string[], reason: string` |
| `replay_requested` | Integrator | `workspaceId, touchedPaths: string[], affectedRunIds: string[]` |

> 源文件：`packages/protocol/src/events/integration.ts`（T024 新增）

---

### AnyEvent

**用途：** 开发态 `POST /_dev/publish` 使用的聚合事件 union，覆盖 `RunLifecycleEvent`、`ToolExecutionEvent`、`EngineOutputEvent`、`MemoryOperationEvent`、`SystemHealthEvent`、`IntegrationEvent` 六类事件。`revision` 由 Core 注入，调用方无需自行分配。

> 源文件：`packages/protocol/src/events/index.ts`

---

## MCP Tools — Tools API

> 源文件：`packages/protocol/src/mcp/tools-api.ts`
> MCP Server 端口：`DOWHAT_MCP_PORT`（默认 3848）

| 工具名 | 默认策略 | 输入参数 | 说明 |
|--------|---------|---------|------|
| `tools.file_read` | allow | `path, encoding?, line_range?` | 受 workspace 白名单限制 |
| `tools.file_write` | ask | `path, content, create_dirs?` | 受路径白名单限制 |
| `tools.file_patch` | ask | `path, patches: Patch[]` | 增量修改 |
| `tools.shell_exec` | ask | `command, cwd?, env?, timeout?, sandbox?` | sandbox: `'native'\|'wsl'\|'docker'` |
| `tools.git_apply` | ask | `patch, worktree_id?, message?` | 应用 patch |
| `tools.git_status` | allow | `worktree_id?` | 只读 |
| `tools.git_diff` | allow | `ref_a?, ref_b?, paths?` | 只读 |
| `tools.web_fetch` | ask | `url, method?, headers?, body?` | 默认高危 |
| `tools.docker_run` | ask | `image, command, mounts?, env?` | — |
| `tools.wsl_exec` | ask | `command, distro?` | — |

`Patch` 类型：`{ type: 'replace'\|'insert'\|'delete', lineStart: number, lineEnd?: number, content?: string }`

**Claude 本地 MCP Server（E2）：**
- `GET /tools` → 返回 `{ tools: [{ name, inputSchema }] }`
- `POST /call` → 请求体 `{ name, arguments }`
- `allow` → `200` + `{ ok: true, status: 'completed', result }`
- `ask` → `202` + `{ ok: false, status: 'pending_approval', approvalId? }`
- `deny` → `403` + `{ ok: false, status: 'denied', error }`

---

## MCP Tools — Soul API

> 源文件：`packages/protocol/src/mcp/soul-tools.ts`

| 工具名 | 类型 | 输入参数 | 返回 |
|--------|------|---------|------|
| `soul.memory_search` | 只读 | `project_id, query, anchors?, limit?(默认10), tracks?, budget?, scope?, dimension?, domain_tags?` | `CueRef[], budget_used, total_found` |
| `soul.open_pointer` | 只读 | `pointer, level: 'hint\|excerpt\|full', max_tokens?, max_lines?, with_context?` | 证据内容 + `tokensUsed, degraded?` |
| `soul.explore_graph` | 只读 | `entity_name, track, depth?(默认2), limit?(默认20)` | `nodes: CueRef[], edges: EdgeRef[]` |
| `soul.propose_memory_update` | 写意图 | `project_id, cue_draft, edge_drafts?, confidence, impact_level` | `proposal_id, requires_checkpoint, status('pending'\|'accepted'), cue_id?, commit_sha?` |
| `soul.review_memory_proposal` | 写（需审批） | `proposal_id, action: 'accept\|edit\|reject\|hint_only', edits?` | `cue_id?, committed: boolean, status, commit_sha?` |

**Token 预算上限（协议层写死）：**
- Hint：`gist + pointers` ≤ 600 tokens
- Excerpt：单次 ≤ 500 tokens
- Full：单次 ≤ 1500 tokens（按 symbol/heading 边界截断）

**`CueRef` 类型：** `{ cueId, gist, score, pointers: string[], why? }`

---

## Core HTTP 端点

> 源文件：`packages/core/src/server/routes.ts`
> Base URL：`http://127.0.0.1:3847`
> 鉴权：所有端点（除 `/health`）需 `Authorization: Bearer <session_token>`

### 公开端点

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `GET` | `/health` | 无 | 返回 `{ ok, version, uptime }` |
| `GET` | `/events` | ✓ | SSE 事件流（`Content-Type: text/event-stream`） |
| `GET` | `/state` | ✓ | 当前 `hot_state` 视图：`{ revision, pendingApprovals, recentEvents }` |

### Run 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/runs` | 创建并启动 Run |
| `GET` | `/runs/:runId` | 查询 Run 状态 |
| `DELETE` | `/runs/:runId` | 取消 Run |

### 审批

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/approvals` | 列出 pending 审批项 |
| `POST` | `/approvals/:id/approve` | 批准 |
| `POST` | `/approvals/:id/deny` | 拒绝 |

### Soul

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/soul/proposals` | 列出 pending checkpoint 提案（`?project_id=`），返回 `proposal_id/project_id/cue_draft/edge_drafts/status` |
| `GET` | `/soul/healing/stats` | Pointer 自愈队列统计：返回 `queued, completed, failed` |

### MCP 调用代理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/mcp/call` | 仅 loopback + Bearer session_token；代理调用 MCP tool（兼容 `{ tool, args }` 与 `{ name, arguments }`）|

### 内部端点（仅 127.0.0.1）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/internal/hook-event` | Hook Runner 异步转发标准化 `ToolExecutionEvent`（仅 loopback + Bearer token） |

`/internal/hook-event` 请求体须通过 `ToolExecutionEventSchema` 校验（服务端会先补 `revision: 0` 再校验，调用方无需分配 revision，由 EventBus 统一写回真实 revision）。
响应格式：`{ ok: true, revision: number }`（成功）/ `{ error: string, issues? }` + 4xx（失败）。

### 开发专用（`NODE_ENV=development` 才激活）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/_dev/publish` | 注入经 `AnyEventSchema` 校验的开发事件到 EventBus；`revision` 由服务端填充 |
| `POST` | `/_dev/start-run` | 仅限 loopback + Bearer token 的 dev-only Run 入口：分配 worktree、当 prompt 命中 `write/create/test file` 时写入最小测试文件、执行 `git status --short`、延时自动 `COMPLETE`，并在终态后触发 Integrator / Fast Gate / Memory Compiler |

---

## SQLite 表结构 — state.db

> 路径：`~/.do-what/state/state.db`
> 源文件：`packages/core/src/db/migrations/`

| 表名 | 主键 | 关键字段 | 说明 |
|------|------|---------|------|
| `event_log` | `revision` | `timestamp, event_type, run_id, source, payload(JSON)` | 只追加，不可改；`event_type` 派生优先级：`eventType -> type -> event -> status`；索引：`(run_id, revision)`, `(event_type, revision)` |
| `runs` | `run_id` | `workspace_id, agent_id?, engine_type, status, created_at, updated_at, completed_at?, error?, metadata(JSON)?` | Run 生命周期记录；`metadata` 现承载 `worktreePath/branchName/patch/touchedPaths/integrationStatus` |
| `workspaces` | `workspace_id` | `name, root_path, engine_type?, created_at, last_opened_at?` | 工作区配置 |
| `agents` | `agent_id` | `name, role?, engine_type, memory_ns, created_at, config(JSON)?` | Agent 定义 |
| `approval_queue` | `approval_id` | `run_id(FK→runs), tool_name, args(JSON), status, created_at, resolved_at?, resolver?` | 工具审批队列；索引：`(run_id, status)` |
| `snapshots` | `snapshot_id` | `revision, created_at, payload(JSON)` | 状态水合快照 |
| `schema_version` | `version` | `applied_at, description` | 迁移版本跟踪（v1 初始迁移）|
| `diagnostics_baseline` | `workspace_id` | `error_count, created_at, updated_at` | Fast Gate 增量诊断基准（v2 迁移，E6 时新增）|

---

## SQLite 表结构 — soul.db

> 路径：`~/.do-what/state/soul.db`
> 源文件：`packages/soul/src/db/migrations/`

| 表名 | 主键 | 关键字段 | 说明 |
|------|------|---------|------|
| `memory_cues` | `cue_id` | `project_id, gist, source, formation_kind, dimension, scope, track, anchors(JSON), pointers(JSON), confidence, impact_level, hit_count, last_hit_at` | 记忆线索（三轴模型 + 生命周期字段） |
| `memory_cues_fts` | — | FTS5 虚拟表（可选） | 全文检索（gist + anchors）；不可用时由 LIKE 降级 |
| `memory_graph_edges` | `edge_id` | `source_id, target_id, relation, track, confidence, evidence` | 记忆图边；`(source_id, target_id, relation)` 唯一索引自 v3 生效 |
| `evidence_index` | `evidence_id` | `cue_id, pointer, pointer_key, level, content_hash, last_accessed, access_count, embedding(BLOB), relocation_status, relocation_attempted_at, relocated_pointer` | 证据访问索引 + Lazy Pointer 自愈状态 |
| `memory_proposals` | `proposal_id` | `project_id, cue_draft(JSON), edge_drafts(JSON), confidence, impact_level, requires_checkpoint, status, proposed_at, resolved_at, resolver` | 待审阅提案（v3 迁移）|
| `projects` | `project_id` | `primary_key, secondary_key, workspace_path, fingerprint, memory_repo_path, last_active_at, bootstrapping_phase_days` | 项目指纹映射与 memory_repo 绑定（v2 迁移）|
| `soul_budgets` | `date` | `tokens_used, dollars_used, created_at, updated_at` | 日预算追踪（v4 迁移）|
| `refactor_events` | `event_id` | `project_id, commit_sha, renames(JSON)` | 重构事件（v5 迁移）|
| `soul_schema_version` | `version` | `applied_at, description` | Soul 迁移版本 |

**`impact_level` 枚举：** `working` → `consolidated` → `canon`
**`type` 枚举：** `fact` / `pattern` / `decision` / `risk`
**`relation` 枚举：** `implements` / `depends_on` / `contradicts` / `extends` / `replaces`

---

## xstate 状态机

> 源文件：`packages/core/src/machines/`
> 类型定义：`packages/protocol/src/machines/`

### RunMachine（每个 Run 一个 actor 实例）

```
idle → created → started → running ⇄ waiting_approval
                                  ↓
                        completed | failed | cancelled | interrupted
```

**关键 Guard：** `TOOL_REQUEST` 时若 Policy 判定 `allow` → 不进入 `waiting_approval`，直接停留 `running`
**AgentStuckException：** 同一 `toolName` 连续 deny `AGENT_STUCK_THRESHOLD`（默认 2）次 → `INTERRUPT`

### EngineMachine（全局各引擎一台）

```
disconnected → connecting → connected → degraded → circuit_open
                                ↑_______________|（恢复后）
```

**断路器触发：** 连续解析失败 >= 5 次 → `circuit_open`（拒绝新 Run）

### ApprovalMachine（全局一台）

```
idle ⇄ waiting（队首处理中）
```

**超时：** `after(300000)` → 自动 deny（5 分钟）

---

## Policy 配置格式

> 路径：`~/.do-what/policy.json`
> Schema 源文件：`packages/protocol/src/policy/config.ts`
> 默认值：`packages/protocol/src/policy/defaults.ts`

```jsonc
{
  "tools.file_read":  { "default": "allow", "deny_paths": ["/etc/shadow", "~/.ssh/*"] },
  "tools.file_write": { "default": "ask",   "allow_paths": ["<workspace>/**"] },
  "tools.shell_exec": { "default": "ask",   "allow_commands": ["ls", "cat", "git status", "npm test"] },
  "tools.web_fetch":  { "default": "ask",   "allow_domains": ["github.com"] },
  "tools.git_status": { "default": "allow" },
  "tools.git_diff":   { "default": "allow" }
}
```

**`default` 枚举：** `allow` / `ask` / `deny`
**`<workspace>`** 在匹配前替换为当前活跃 workspace 的根路径。

### hook-policy-cache.json（Core 写 → Hook Runner 读）

> 路径：`~/.do-what/run/hook-policy-cache.json`（权限 600）
> Schema 源文件：`packages/protocol/src/policy/hook-cache.ts`
> Core 写入：`packages/core/src/policy/cache-writer.ts`；Hook Runner 读取：`packages/engines/claude/src/policy-cache.ts`

```jsonc
{
  "version": "1",
  "updatedAt": "2026-03-06T00:00:00.000Z",
  "rules": {
    // 与 policy.json 格式完全相同
    "tools.shell_exec": { "default": "ask", "allow_commands": ["git status"] }
  }
}
```

Hook Runner 在启动时加载并 `fs.watch` 监听变化，文件更新后自动热重载（无需重启 Hook Runner 进程）。

---

## Pointer 格式规范

> 源文件：`packages/soul/src/pointer/pointer-parser.ts`

**格式：** 空格分隔的 `key:value` 组合（顺序无关）

```
git_commit:<sha>                    版本锚（必须有）
repo_path:<relative/path/to/file>   路径锚
symbol:<qualifiedName>              符号锚（函数名/类名/类型名）
snippet_hash:<sha256>               片段指纹（可选）
```

**示例：**
```
git_commit:abc1234 repo_path:src/auth/login.ts symbol:authenticate
git_commit:abc1234 repo_path:docs/design.md#heading:Architecture
```

**`pointer_key`：** 将 `key:value` 对按 key 字母排序后拼接再 sha256，用于 `evidence_index` 去重。

---

## 内部通信协议

### Hook Runner → Core（HTTP POST）

> 端点：`POST /internal/hook-event`

```jsonc
{
  "status": "requested",
  "toolName": "tools.shell_exec",
  "rawToolName": "Bash",
  "hookEventName": "PreToolUse",
  "args": { "command": "ls" },
  "runId": "uuid",
  "source": "engine.claude.hook-runner",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

### Claude MCP Server（HTTP）

> 源文件：`packages/engines/claude/src/mcp-server.ts`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/tools` | 列出 Claude 侧注册的 10 个 Tools API 工具 |
| `POST` | `/call` | 调用工具；返回 completed / pending_approval / denied |

### Codex App Server 消息格式（JSONL，以 T010 验证结果为准）

> 源文件：`packages/engines/codex/src/event-normalizer.ts`

**Codex → do-what（stdout）：**

| `type` | 说明 |
|--------|------|
| `token_stream` | LLM token 流 |
| `plan_node` | 计划节点状态变更 |
| `diff` | 文件变更 diff |
| `approval_request` | 需要用户/系统审批 |
| `tool_result` | 工具调用完成结果 |
| `tool_failed` | 工具调用失败结果 |
| `run_complete` | Run 正常结束 |
| `run_failed` | Run 异常结束 |

**do-what → Codex（stdin）：**

| `type` | 说明 |
|--------|------|
| `user_input` | 用户输入或追加指令 |
| `approval_response` | 审批结果（`requestId, approved: boolean, input?`）|
| `cancel` | 取消 Run |

**兼容说明：**
- `approval_request` 的请求标识兼容 `requestId | id | request_id`
- `approval_response` 回传时统一使用 `requestId`

---

## 变更记录

> 每次新增/修改接口后，在此记录。格式：`日期 · Ticket · 变更说明`

| 日期 | Ticket | 变更 |
|------|--------|------|
| 2026-03-04 | — | 初始版本（规划阶段，基于 do-what-proposal-v0.1.md）|
| 2026-03-05 | T001 | 完成 monorepo 骨架（workspace/turbo/tsconfig 与 8 个包 stub）|
| 2026-03-05 | T002 | 新增 BaseEvent、RunLifecycleEvent、ToolExecutionEvent 的 zod schema 与测试|
| 2026-03-05 | T003 | 新增 EngineOutput/MemoryOperation/SystemHealth 事件与 Tools API MCP schema（含 JSON Schema 导出）|
| 2026-03-05 | T004 | 新增 Soul MCP schema、Policy schema/defaults、xstate 状态机类型骨架|
| 2026-03-05 | T005 | 实现 Core HTTP Server（Fastify，127.0.0.1:3847），`GET /health` / `GET /events`（SSE）/ `GET /state` / `POST /_dev/publish`，Bearer token 鉴权中间件 |
| 2026-03-05 | T006 | 实现 Core EventBus（revision 单调递增）、DatabaseWorker（worker_threads，批量写入，MAX_QUEUE_LENGTH=1000，BATCH_SIZE=5）、WorkerClient |
| 2026-03-05 | T007 | 实现 state.db v1 迁移：`event_log / runs / workspaces / agents / approval_queue / snapshots / schema_version`，WAL 模式，迁移版本跟踪 |
| 2026-03-05 | T008 | 实现 RunMachine / EngineMachine / ApprovalMachine（xstate v5），RunRegistry，AgentStuckException（连续 deny≥2 次触发 INTERRUPT） |
| 2026-03-05 | T009 | 实现 PolicyEngine（path-matcher / command-matcher / domain-matcher），`hook-policy-cache.json` 写入（Core 侧 `cache-writer.ts`），cache schema 归入 `@do-what/protocol` |
| 2026-03-05 | T010 | 协议验证门控通过（5 pass / 2 warn / 0 fail）；⚠️ `claude --print` 不可用（EngineQuota 默认关闭）；⚠️ Codex plan_node/diff/approval_request 仅运行时可见（E3 fixtures 已覆盖）；报告见 `docs/protocol-validation-report.md` |
| 2026-03-06 | T011 | 新增 Core `POST /internal/hook-event`，Claude Hook Runner 标准化 `ToolExecutionEvent` 转发契约 |
| 2026-03-06 | T012 | 新增 Claude 本地 MCP Server `GET /tools` / `POST /call` 端点与审批返回语义 |
| 2026-03-06 | T013 | 新增 Claude contract replay fixtures 版本元信息与回放基线说明 |
| 2026-03-06 | T014 | 新增 Codex App Server 进程管理、JSONL 双向通道与心跳/重启约束说明 |
| 2026-03-06 | T015 | 新增 Codex 事件归一化、审批桥接与适配器事件流说明 |
| 2026-03-06 | T016 | 新增 Codex contract replay fixtures 与回放基线说明 |
| 2026-03-06 | T017 | 新增 soul.db 初始 DDL、独立迁移/worker/state store，并将 soul.db 表结构索引更新为三轴 cue 模型 |
| 2026-03-06 | T018 | 新增 `soul.memory_search` 读路径、预算裁剪、FTS/LIKE 降级与 `MemoryOperationEvent.search` 行为说明 |
| 2026-03-06 | T019 | 新增 `soul.open_pointer` / `soul.explore_graph` 读路径与 Core `/mcp/call` loopback 代理约束说明 |
| 2026-03-07 | T020 | 新增 `projects` 表、`project_fingerprint`、`memory_repo` Git 初始化与 workspace junction 说明 |
| 2026-03-07 | T021 | 新增 `memory_proposals` 表、`checkpoint_queue` 事件与 Core `GET /soul/proposals` 端点 |
| 2026-03-07 | T022 | 新增 `soul.review_memory_proposal` 写路径、memory_repo commit 语义与 bootstrapping 接口 |
| 2026-03-07 | T023 | 新增 `@do-what/tools` GitOpsQueue / WorktreeManager、Core Run worktree lifecycle 与 dev-only `POST /_dev/start-run` |
| 2026-03-07 | T024 | 新增 `IntegrationEvent`、state.db `diagnostics_baseline` v2 迁移，以及 DAG builder / Fast Gate / Integrator 合入语义 |
| 2026-03-07 | T025 | 新增 `ComputeProvider` / `LocalHeuristics` / `soul_mode` 降级事件，支持基于 git diff 的本地 cue 草稿提取 |
| 2026-03-07 | T026 | 新增 `OfficialAPI` / `CustomAPI` / `DailyBudget` / `MemoryCompiler` / `CompilerTrigger`，并接通 Run 完成后的自动编译链路 |
| 2026-03-07 | T027 | 新增 `refactor_events`、`evidence_index` 自愈字段、`PointerRelocator` / `HealingQueue` 与 Core `GET /soul/healing/stats` |

| 2026-03-07 | T029 | 新增 `AnyEventSchema` 聚合 union，明确 `/_dev/publish` 校验面与 `event_log.event_type` 派生优先级，并将 `/state` 文档统一为 `hot_state` 术语 |

---

*本文件由 Codex 在每个 Ticket 完成后自动维护。如发现与源码不符，以源码为准，并更新本文件。*
