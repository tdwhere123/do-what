# INTERFACE_INDEX.md — 接口与 Schema 索引

> **由 Codex 维护。** 每次新增或修改接口、事件、MCP Tool、HTTP 端点、DB 表时，必须同步更新本文件。
>
> 权威定义源：`packages/protocol/src/`（zod schema）和各包的实现文件。
> 本文件是"可读索引"，不替代源码。

---

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
| `requested` | Hook Runner / Codex Adapter | `toolName: string, args: object` |
| `approved` | Policy Engine / User | `approvedBy: 'policy' \| 'user'` |
| `denied` | Policy Engine | `reason: string` |
| `executing` | Tool Runner | `pid?` |
| `completed` | Tool Runner | `output: string, exitCode: number` |
| `failed` | Tool Runner | `error: string` |

> 源文件：`packages/protocol/src/events/tool.ts`

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
| `engine_connect` | Engine Adapter | `engineType: 'claude'\|'codex', version: string` |
| `engine_disconnect` | Engine Adapter | `engineType, reason: string` |
| `circuit_break` | Engine Machine | `engineType, failureCount: number` |
| `network_status` | Core | `online: boolean` |

> 源文件：`packages/protocol/src/events/system.ts`

---

### IntegrationEvent
**判别字段：** `event`

| event | 触发方 | 关键附加字段 |
|-------|--------|-------------|
| `gate_passed` | Integrator | `runId, touchedPaths: string[]` |
| `gate_failed` | Integrator | `runId, newDiagnostics: Diagnostic[]` |
| `conflict` | Integrator | `runId, conflictPaths: string[]` |
| `replay_requested` | Integrator | `runId, reason: string` |

> 源文件：`packages/protocol/src/events/integration.ts`（T024 新增）

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

---

## MCP Tools — Soul API

> 源文件：`packages/protocol/src/mcp/soul-tools.ts`

| 工具名 | 类型 | 输入参数 | 返回 |
|--------|------|---------|------|
| `soul.memory_search` | 只读 | `project_id, query, anchors?, limit?(默认10), tracks?, budget?` | `CueRef[], budget_used, total_found` |
| `soul.open_pointer` | 只读 | `pointer, level: 'hint\|excerpt\|full', max_tokens?, max_lines?, with_context?` | 证据内容 + `tokensUsed, degraded?` |
| `soul.explore_graph` | 只读 | `entity_name, track, depth?(默认2), limit?(默认20)` | `nodes: CueRef[], edges: EdgeRef[]` |
| `soul.propose_memory_update` | 写意图 | `project_id, cue_draft, edge_drafts?, confidence, impact_level` | `proposal_id, requires_checkpoint, status` |
| `soul.review_memory_proposal` | 写（需审批） | `proposal_id, action: 'accept\|edit\|reject\|hint_only', edits?` | `cue_id?, committed: boolean` |

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
| `GET` | `/state` | ✓ | 当前状态快照（含 pending approvals + revision） |

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
| `GET` | `/soul/proposals` | 列出 pending 记忆提案（`?project_id=`）|
| `GET` | `/soul/healing/stats` | Pointer 自愈队列统计 |

### MCP 调用代理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/mcp/call` | 代理调用 MCP tool（`{ tool, args }`）|

### 内部端点（仅 127.0.0.1）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/internal/hook-event` | Hook Runner 异步转发事件 |

### 开发专用（`NODE_ENV=development` 才激活）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/_dev/publish` | 注入 mock 事件到 EventBus |
| `POST` | `/_dev/start-run` | 触发测试 Run |

---

## SQLite 表结构 — state.db

> 路径：`~/.do-what/state/state.db`
> 源文件：`packages/core/src/db/migrations/`

| 表名 | 主键 | 关键字段 | 说明 |
|------|------|---------|------|
| `event_log` | `revision` | `event_type, run_id, source, payload(JSON)` | 只追加，不可改 |
| `runs` | `run_id` | `workspace_id, engine_type, status, metadata(JSON)` | Run 生命周期记录 |
| `workspaces` | `workspace_id` | `root_path, engine_type` | 工作区配置 |
| `agents` | `agent_id` | `role, engine_type, memory_ns` | Agent 定义 |
| `approval_queue` | `approval_id` | `run_id, tool_name, args(JSON), status` | 工具审批队列 |
| `snapshots` | `snapshot_id` | `revision, payload(JSON)` | 状态水合快照 |
| `schema_version` | `version` | `applied_at, description` | 迁移版本跟踪 |
| `diagnostics_baseline` | `workspace_id` | `error_count, updated_at` | Fast Gate 基准（v2 迁移）|

---

## SQLite 表结构 — soul.db

> 路径：`~/.do-what/state/soul.db`
> 源文件：`packages/soul/src/db/migrations/`

| 表名 | 主键 | 关键字段 | 说明 |
|------|------|---------|------|
| `memory_cues` | `cue_id` | `project_id, gist, type, anchors(JSON), pointers(JSON), confidence, impact_level, hit_count` | 记忆线索 |
| `memory_cues_fts` | — | FTS5 虚拟表 | 全文检索（gist + anchors）|
| `memory_graph_edges` | `edge_id` | `source_id, target_id, relation, confidence` | 记忆图边 |
| `evidence_index` | `evidence_id` | `cue_id, pointer, pointer_key, level, content_hash, embedding(BLOB)` | 证据索引 |
| `memory_proposals` | `proposal_id` | `project_id, cue_draft(JSON), impact_level, requires_checkpoint, status` | 待审阅提案（v3 迁移）|
| `projects` | `project_id` | `primary_key, secondary_key, workspace_path, fingerprint, memory_repo_path` | 项目指纹映射（v2 迁移）|
| `soul_budgets` | `date + project_id` | `tokens_used, dollars_used` | 日预算追踪（v4 迁移）|
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
  "tools.shell_exec": { "default": "ask",   "allow_commands": ["ls", "git status"] },
  "tools.web_fetch":  { "default": "ask",   "allow_domains": ["github.com"] },
  "tools.git_status": { "default": "allow" },
  "tools.git_diff":   { "default": "allow" }
}
```

**`default` 枚举：** `allow` / `ask` / `deny`
**`<workspace>`** 在匹配前替换为当前活跃 workspace 的根路径。

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
  "eventType": "PreToolUse",
  "tool": "Bash",
  "args": { "command": "ls" },
  "runId": "uuid",
  "source": "hook_runner",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

### Codex App Server 消息格式（JSONL，以 T010 验证结果为准）

> 源文件：`packages/engines/codex/src/event-normalizer.ts`

**Codex → do-what（stdout）：**

| `type` | 说明 |
|--------|------|
| `token_stream` | LLM token 流 |
| `plan_node` | 计划节点状态变更 |
| `diff` | 文件变更 diff |
| `approval_request` | 需要用户/系统审批 |
| `run_complete` | Run 正常结束 |
| `run_failed` | Run 异常结束 |

**do-what → Codex（stdin）：**

| `type` | 说明 |
|--------|------|
| `user_input` | 用户输入或追加指令 |
| `approval_response` | 审批结果（`approved: boolean`）|
| `cancel` | 取消 Run |

---

## 变更记录

> 每次新增/修改接口后，在此记录。格式：`日期 · Ticket · 变更说明`

| 日期 | Ticket | 变更 |
|------|--------|------|
| 2026-03-04 | — | 初始版本（规划阶段，基于 do-what-proposal-v0.1.md）|

---

*本文件由 Codex 在每个 Ticket 完成后自动维护。如发现与源码不符，以源码为准，并更新本文件。*
