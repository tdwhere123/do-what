# INTERFACE_INDEX.md — 接口与 Schema 索引

> 本文件按当前源码重建，保存格式为 UTF-8。
> 权威定义来源：`packages/protocol/src/` 中的 zod schema，以及各包的实现文件。
> 本文件是可读索引，不替代源码。

## 目录

- [Protocol 事件类型](#protocol-事件类型)
- [Protocol Core 类型](#protocol-core-类型)
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

源文件：`packages/protocol/src/events/`

所有事件共享基础字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `revision` | `number` | 事件总线分配的递增修订号 |
| `timestamp` | `string` | ISO 8601 时间戳 |
| `runId` | `string` | 关联运行 ID |
| `source` | `string` | 事件来源，如 `core.server`、`engine.codex`、`soul.review` |

`AnyEventSchema` 当前聚合 7 组事件：
`RunLifecycleEvent | ToolExecutionEvent | EngineOutputEvent | MemoryOperationEvent | SystemHealthEvent | IntegrationEvent | SoulEvent`

### RunLifecycleEvent

判别字段：`status`

| `status` | 关键字段 | 说明 |
|---|---|---|
| `created` | `workspaceId`, `agentId?`, `engineType` | Core 建立 run |
| `started` | `worktreePath?` | run 开始执行 |
| `waiting_approval` | `approvalId`, `toolName` | 进入审批等待 |
| `completed` | `duration?`, `artifactIds?` | 正常完成 |
| `failed` | `error`, `code?` | 执行失败 |
| `cancelled` | `cancelledBy` | 用户或系统取消 |
| `interrupted` | `reason: 'agent_stuck' \| 'core_restart' \| 'network_error'` | 中断结束 |
| `governance_invalid` | `reason?` | 治理租约失效或被主干变更作废 |

源文件：`packages/protocol/src/events/run.ts`

### ToolExecutionEvent

判别字段：`status`

| `status` | 关键字段 | 说明 |
|---|---|---|
| `requested` | `toolName`, `args` | 工具请求进入审批链 |
| `approved` | `approvedBy: 'policy' \| 'user'` | 已批准 |
| `denied` | `reason` | 已拒绝 |
| `executing` | `pid?` | 工具已开始执行 |
| `completed` | `output`, `exitCode` | 工具成功结束 |
| `failed` | `error` | 工具执行失败 |

说明：
- schema 使用 `.passthrough()`，适配器可附带 `approvalId`、`rawToolName`、`hookEventName`、`input` 等附加字段。
- Claude `/internal/hook-event` 与 Codex `approval_request` 最终都收敛到这组事件。

源文件：`packages/protocol/src/events/tool.ts`

### EngineOutputEvent

判别字段：`type`

| `type` | 关键字段 | 说明 |
|---|---|---|
| `token_stream` | `text`, `isComplete` | 增量文本输出 |
| `plan_node` | `nodeId`, `title`, `status: 'pending' \| 'active' \| 'done' \| 'failed'` | 计划节点变更 |
| `diff` | `path`, `patch`, `hunks` | 代码差异输出 |

源文件：`packages/protocol/src/events/engine.ts`

### MemoryOperationEvent

判别字段：`operation`

| `operation` | 关键字段 | 说明 |
|---|---|---|
| `search` | `query`, `results: CueRef[]`, `budgetUsed?` | 记忆检索 |
| `open` | `pointer`, `level: 'hint' \| 'excerpt' \| 'full'`, `tokensUsed` | 证据展开 |
| `propose` | `proposalId`, `cueDraft`, `requiresCheckpoint` | 提交记忆提案 |
| `commit` | `proposalId`, `cueId?`, `commitSha?` | 提案落库或提交 memory repo |

源文件：`packages/protocol/src/events/memory.ts`

### SystemHealthEvent

判别字段：`event`

| `event` | 关键字段 | 说明 |
|---|---|---|
| `engine_connect` | `engineType: 'claude' \| 'codex'`, `version` | 引擎连入 |
| `engine_disconnect` | `engineType`, `reason` | 引擎断开 |
| `circuit_break` | `engineType`, `failureCount` | 熔断触发 |
| `network_status` | `online` | 网络连通状态 |
| `checkpoint_queue` | `pendingCount`, `projectId?` | checkpoint 队列积压情况 |
| `soul_mode` | `soul_mode: 'basic' \| 'enhanced'`, `provider?`, `reason?` | Soul 运行模式 |

源文件：`packages/protocol/src/events/system.ts`

### IntegrationEvent

判别字段：`event`

| `event` | 关键字段 | 说明 |
|---|---|---|
| `gate_passed` | `workspaceId`, `afterErrorCount?`, `baselineErrorCount?`, `touchedPaths?` | 集成门通过 |
| `gate_failed` | `workspaceId`, `afterErrorCount`, `baselineErrorCount`, `newDiagnostics`, `touchedPaths` | 集成门失败 |
| `conflict` | `workspaceId`, `reason`, `touchedPaths` | 合并冲突 |
| `replay_requested` | `workspaceId`, `affectedRunIds`, `touchedPaths` | 请求重放 |
| `run_serialized` | `workspaceId`, `reason`, `reconcileCount`, `touchedPaths` | 第二次 `hard_stale` 后降级为串行 |
| `run_start_denied` | `workspaceId`, `reason`, `surfaceId`, `conflictKind?` | 预飞行治理拒绝启动 |
| `run_topology_invalid` | `workspaceId`, `topologyKind`, `violations[]` | 编排模板拓扑不合法 |

源文件：`packages/protocol/src/events/integration.ts`

### SoulEvent

判别字段：`event`

| `event` | 关键字段 | 说明 |
|---|---|---|
| `run_checkpoint` | `checkpointId?`, `projectId?` | checkpoint 触发点 |
| `memory_cue_accepted` | `cueId`, `projectId?`, `proposalId?`, `claimDraftId?`, `impactLevel?`, `resolver?` | 提案被接受 |
| `memory_cue_rejected` | `proposalId`, `cueId?`, `projectId?`, `reason?`, `resolver?` | 提案被拒绝 |
| `context_cue_used` | `cueId`, `projectId?`, `trigger: 'hint' \| 'excerpt' \| 'full'` | cue 被注入上下文 |
| `claim_superseded` | `cueId`, `draftId`, `supersededByDraftId?` | claim 被覆盖 |
| `memory_cue_modified` | `cueId`, `projectId?`, `changedFields: string[]` | cue 被编辑或 checkpoint 更新 |

说明：
- `SoulEvent` 已纳入 `AnyEventSchema`。
- `claim_*` 字段的最终写入只允许由 checkpoint 流程触发。

源文件：`packages/protocol/src/events/soul.ts`

---

## Protocol Core 类型

源文件：`packages/protocol/src/core/`

### hot-state

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `RunHotState` | `run_id`, `status`, `workspace_id?`, `engine_type?`, `agent_id?`, `active_approval_id?`, `active_tool_name?`, `started_at?`, `updated_at`, `error?` | Core 对单个 run 的热态视图 |
| `EngineHotState` | `engine_id`, `kind: 'claude' \| 'codex'`, `status`, `current_run_id?`, `updated_at`, `version?`, `reason?` | 引擎连接与退化状态 |
| `ApprovalHotState` | `approval_id`, `run_id`, `tool_name`, `status: 'pending' \| 'approved' \| 'denied' \| 'timeout'`, `requested_at`, `resolved_at?`, `resolver?` | 当前审批热态 |
| `CheckpointHotState` | `checkpoint_id`, `run_id`, `project_id?`, `active`, `triggered_at` | 当前激活的 checkpoint |
| `CoreHotState` | `modules`, `runs`, `engines`, `pending_approvals`, `active_checkpoints`, `recent_events`, `last_event_seq` | Core 内存控制态总视图；`modules` 是 Core / Engine / Soul 状态真相源 |

补充说明：
- `/state` 读路径现基于 `HotStateManager` 的内存热态，而不是每次直接从 SQLite 现查。
- `/state` 对外 JSON 结构保持兼容，仍返回 `revision`, `recentEvents`, `pendingApprovals`。
- `RunHotState.status` 当前覆盖 `created | started | running | waiting_approval | completed | failed | cancelled | interrupted | governance_invalid`。

### module-status

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `ModuleKind` | `'core' \| 'engine' \| 'soul'` | 模块类别 |
| `ModuleStatus` | `'connected' \| 'disconnected' \| 'not_installed' \| 'probe_failed' \| 'auth_failed' \| 'disabled'` | 模块连接 / 探测结果 |
| `ModulePhase` | `'probing' \| 'ready' \| 'degraded'` | 模块当前阶段 |
| `ModuleHotState` | `module_id`, `kind`, `label`, `status`, `phase`, `updated_at`, `reason?`, `meta?` | Core 内部模块热态 |
| `ModulesHotState` | `core`, `engines.claude`, `engines.codex`, `soul` | Core / Engine / Soul 聚合热态 |

补充说明：
- Core 启动后会主动探测 Claude / Codex CLI，并将结果诚实落到 `modules`。
- `createRun()` 不会为缺失 workspace 做防御性 upsert；workspace 的按路径幂等 upsert 只保留在 `openWorkspace()` 路径。

### projection

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `ProjectionKind` | `'pending_soul_proposals' \| 'healing_stats_view' \| 'run_history_agg'` | Projection 视图种类 |
| `ProjectionEntry<T>` | `kind`, `scope_id`, `data`, `computed_at`, `staleness_ms` | Projection 统一包装 |

补充说明：
- Projection 只承载内部读模型，不参与控制流判定。
- 当前 Core 已将 `/soul/proposals` 与 `/soul/healing/stats` 接到 `ProjectionManager`。
- `ProjectionManager` 负责 TTL 缓存、按 `kind + scope_id` 失效与单飞重算。

### ack

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `AckStatus` | `'pending' \| 'committed' \| 'failed'` | ack 生命周期 |
| `AckEntityType` | `'run' \| 'engine' \| 'approval' \| 'checkpoint' \| 'event' \| 'memory' \| 'settings' \| 'drift' \| 'gate'` | ack 对应实体类别 |
| `AckOverlay` | `ack_id`, `entity_type`, `entity_id`, `revision`, `status`, `created_at`, `committed_at?`, `error?` | 同步接收后、异步收敛前的叠加确认层 |

补充说明：
- 同步路径负责校验、分配 revision、进入事件总线并创建 pending ack。
- 异步路径负责 SSE 广播、Projection 失效以及最终 ack 状态收敛。

### ui-contract

源文件：`packages/protocol/src/core/ui-contract.ts`

#### 枚举

| 类型 | 值 | 说明 |
|---|---|---|
| `CoreConnectionState` | `connecting \| connected \| disconnected \| reconnecting` | UI 与 Core 的连接状态 |
| `CoreHealthStatus` | `unknown \| idle \| booting \| healthy \| running \| degraded \| offline \| rebooting` | 各子系统健康度，用于 `WorkbenchHealthSnapshot` |

#### 顶层读模型

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `WorkbenchSnapshot` | `revision`, `coreSessionId`, `connectionState`, `health`, `modules`, `pendingApprovals[]`, `recentEvents[]`, `runs[]`, `workspaces[]` | 前端 workbench 初始化与热态消费基线；`modules` 为正式模块状态契约，`health` 为兼容派生字段 |
| `TimelinePage` | `runId`, `revision`, `entries[]`, `limit`, `nextBeforeRevision`, `hasMore` | Timeline 分页读模型，保留 optimistic tail 追加空间 |
| `InspectorSnapshot` | `runId`, `revision`, `overview`, `files[]`, `plans[]`, `history[]`, `governance` | Inspector 右侧面板查询基线 |
| `SettingsSnapshot` | `revision`, `coreSessionId`, `lease`, `sections[]` | Settings Query-first 读模型与 lease 锁定态基线 |
| `TemplateDescriptor` | `templateId`, `title`, `description`, `inputs[]` | Create Run 模板描述符基线 |

#### 命令与 ack

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `OpenWorkspaceRequest` | `clientCommandId`, `rootPath`, `name?` | `POST /api/workspaces/open` 请求体；按工作区目录打开或导入 workspace |
| `CreateRunRequest` | `clientCommandId`, `workspaceId`, `templateId`, `templateInputs`, `templateVersion?`, `participants[]` | `POST /api/runs` 请求体 |
| `RunMessageRequest` | `clientCommandId`, `body` | `POST /api/runs/:runId/messages` 请求体 |
| `ApprovalDecisionRequest` | `clientCommandId`, `decision: 'allow_once' \| 'allow_session' \| 'reject'` | `POST /api/approvals/:approvalId/decide` 请求体 |
| `SettingsPatchRequest` | `clientCommandId`, `fields` | `PATCH /api/settings` 请求体 |
| `MemoryProposalReviewRequest` | `clientCommandId`, `mode: 'accept' \| 'hint_only' \| 'reject'`, `edits?` | `POST /api/memory/proposals/:proposalId/review` 请求体 |
| `MemoryPinRequest` | `clientCommandId`, `projectOverride?` | `POST /api/memory/:memoryId/pin` 请求体 |
| `MemoryEditRequest` | `clientCommandId`, `patch`, `projectOverride?` | `POST /api/memory/:memoryId/edit` 请求体 |
| `MemorySupersedeRequest` | `clientCommandId`, `replacement`, `projectOverride?` | `POST /api/memory/:memoryId/supersede` 请求体 |
| `DriftResolutionRequest` | `clientCommandId`, `mode: 'reconcile' \| 'rollback'` | `POST /api/nodes/:nodeId/resolve-drift` 请求体 |
| `IntegrationGateDecisionRequest` | `clientCommandId`, `decision: 'approve' \| 'block'`, `gateId?` | `POST /api/runs/:runId/integration-gate/decide` 请求体 |
| `CoreCommandRequest` | `clientCommandId`, `command`, `payload`, `runId?`, `workspaceId?` | 前端 command 写入口统一请求体 |
| `CoreCommandAck` | `ok`, `ackId`, `revision?`, `entityType?`, `entityId?` | command 接收确认包；当命令同步确定了目标实体时回传实体类型与实体 ID |
| `CoreProbeResult` | `ackId`, `status`, `revision?`, `entityType?`, `entityId?`, `createdAt?`, `committedAt?`, `error?` | ack/probe 标准化查询结果 |
| `ApprovalProbe` | `approvalId`, `runId`, `toolName`, `status`, `updatedAt`, `revision` | `GET /api/approvals/:approvalId` 返回体 |
| `MemoryProbe` | `memoryId`, `claimSummary`, `scope`, `slotStatus`, `manifestationState`, `retentionState`, `updatedAt`, `revision` | `GET /api/memory/:memoryId` 返回体 |
| `CoreError` | `code`, `message`, `details?` | query/command 错误统一结构 |
| `CoreSseCause` | `ackId?`, `clientCommandId?` | SSE 与 optimistic command 对齐线索 |
| `CoreSseEnvelope` | `revision`, `coreSessionId?`, `event`, `causedBy?` | Core `/events` 与 `/api/events/stream` 的实际 SSE 输出包裹 |

#### 关键子类型

| 类型 | 判别 / 关键字段 | 说明 |
|---|---|---|
| `WorkbenchHealthSnapshot` | `core`, `claude`, `codex`, `soul`, `network`（均为 `CoreHealthStatus`）| workbench health 兼容视图，由 `WorkbenchModulesSnapshot` 派生 |
| `ModuleStatusSnapshot` | `moduleId`, `kind`, `label`, `status`, `phase`, `updatedAt`, `reason?`, `meta?` | UI 消费的单模块状态快照 |
| `WorkbenchModulesSnapshot` | `core`, `engines.claude`, `engines.codex`, `soul` | Workbench 左下状态区、bootstrap 错误区与 Settings 引擎页共享的模块状态读模型 |
| `WorkbenchRunSummary` | `runId`, `status`（`created \| queued \| started \| running \| waiting_approval \| completed \| failed \| cancelled \| interrupted \| governance_invalid`）, `title`, `workspaceId?`, `engine?` | runs 列表条目 |
| `WorkbenchPendingApproval` | `approvalId`, `runId`, `toolName`, `createdAt`, `summary?` | pendingApprovals 列表条目 |
| `TimelineEntry` | `id`, `runId`, `kind`（`message \| tool_call \| approval \| memory \| system \| plan \| diff \| checkpoint`）, `timestamp`, `title?`, `body?`, `status?`, `meta?`, `causedBy?` | Timeline 单条记录 |
| `InspectorFileChange` | `path`, `status`（`added \| modified \| deleted \| renamed`）, `summary?` | InspectorSnapshot.files 条目 |
| `InspectorPlanItem` | `id`, `status`（`pending \| active \| done \| failed`）, `summary` | InspectorSnapshot.plans 条目 |
| `InspectorHistoryItem` | `id`, `type`（`run \| checkpoint \| memory \| governance \| git`）, `label`, `timestamp` | InspectorSnapshot.history 条目 |
| `SettingsSection` | `sectionId`, `title`, `locked`, `fields[]`（每个 field 含 `fieldId`, `kind`, `value`, `locked`）| SettingsSnapshot.sections 条目 |

补充说明：
- `T030`–`T032` 已在 Core 落地 `/api/*` query / command / probe surface；成功响应统一为 `{ ok: true, data }`。
- legacy `/state`、`/events`、`/acks/:ackId` 仍保留兼容；其中 `/events` 已与 `/api/events/stream` 一样输出 `CoreSseEnvelope`。
- 所有 schema 均使用 `.passthrough()`，对未知字段保持前向兼容。

### focus-surface

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `ArtifactKind` | `'source_file' \| 'test_file' \| 'schema_type' \| 'migration' \| 'config'` | FocusSurface 文件分类 |
| `FocusSurface` | `surface_id`, `workspace_id`, `package_scope[]`, `path_globs[]`, `artifact_kind[]`, `baseline_fingerprint`, `created_at` | Run 提交前声明的影响面与基线指纹 |

补充说明：
- `path_globs` 为空时，Core 默认退化为 `candidate.touchedPaths`，不做整仓扫描。

### baseline-lock

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `FileSnapshot` | `path`, `git_hash`, `size_bytes` | 单文件基线快照 |
| `BaselineLock` | `lock_id`, `run_id`, `surface_id`, `workspace_id`, `baseline_fingerprint`, `locked_at`, `files_snapshot[]` | FocusSurface 在提交时刻冻结出的文件基线 |

补充说明：
- `baseline_fingerprint` 由排序后的 `path:git_hash` 列表做 SHA256 得到。

### drift

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `DriftKind` | `'ignore' \| 'soft_stale' \| 'hard_stale'` | 三类漂移等级 |
| `DriftAssessment` | `drift_kind`, `overlapping_files[]`, `assessment_reason` | 基线锁与当前主干的漂移判定 |
| `MergeDecision` | `allowed`, `reason: 'no_drift' \| 'soft_stale_ok' \| 'hard_stale_reconcile' \| 'hard_stale_serialize' \| 'already_reconciled'`, `reconcile_count` | IntegrationGate 的合并许可结果 |

### governance

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `ConflictKind` | `'path_overlap' \| 'schema_conflict' \| 'migration_conflict'` | 并行 surface 冲突种类 |
| `ConflictResolution` | `'serialize' \| 'allow_soft' \| 'block'` | 治理冲突处置策略 |
| `ConflictConclusion` | `conflicting_surface_ids[]`, `conflict_kind`, `resolution` | 预飞行治理对冲突的结论 |
| `InvalidationCondition` | `trigger: 'main_commit' \| 'schema_change' \| 'migration_added'`, `affected_paths[]` | lease 失效触发条件 |
| `GovernanceLease` | `lease_id`, `run_id`, `workspace_id`, `surface_id`, `valid_snapshot`, `conflict_conclusions[]`, `invalidation_conditions[]`, `issued_at`, `expires_at`, `status` | Run 启动前签发的治理租约 |
| `SurfaceStatus` | `surface_id`, `run_id`, `status: 'aligned' \| 'shadowed' \| 'conflicting'`, `lease_id?`, `drift_kind?` | 某个 surface 在 report 中的状态 |
| `NativeSurfaceReport` | `report_id`, `workspace_id`, `generated_at`, `surfaces[]` | 当前 workspace 活跃 surface 的原生治理报告 |

补充说明：
- `GovernanceLease.status` 为 `active | invalidated | expired | released`。
- `shadowed` 表示 candidate surface 被另一个 surface 严格覆盖；等价覆盖仍按 `conflicting` 处理。

### topology

| 类型 | 关键字段 | 说明 |
|---|---|---|
| `TopologyKind` | `'linear' \| 'parallel_merge' \| 'revise_loop' \| 'bounded_fan_out'` | 唯一允许的四类编排拓扑 |
| `TopologyConstraints` | `max_parallel`, `max_loop_count`, `max_fan_out` | 模板级硬约束 |
| `OrchestrationTemplate` | `template_id`, `topology?`, `topology_hint?`, `nodes[]`, `edges[]`, `constraints` | `Integrator.submit()` 的显式编排输入 |
| `TopologyViolation` | `violation_type`, `node_ids[]`, `description` | 拓扑校验失败项 |
| `ValidationResult` | `valid`, `topology_kind`, `violations[]` | TopologyValidator 输出 |

补充说明：
- `TopologyViolation.violation_type` 当前覆盖 `free_dag | parallel_limit | loop_limit | fan_out_limit | nested_parallel | multi_merge_point`。

---

## MCP Tools — Tools API

源文件：`packages/protocol/src/mcp/tools-api.ts`

| 工具名 | 输入字段 | 备注 |
|---|---|---|
| `tools.file_read` | `path`, `encoding?`, `line_range?` | 只读文件内容 |
| `tools.file_write` | `path`, `content`, `create_dirs?` | 写入完整文件 |
| `tools.file_patch` | `path`, `patches[]` | 行级 patch，`type = replace \| insert \| delete` |
| `tools.shell_exec` | `command`, `cwd?`, `env?`, `timeout?`, `sandbox: 'native' \| 'wsl' \| 'docker'` | 危险操作默认需审批 |
| `tools.git_apply` | `patch`, `worktree_id?`, `message?` | 应用 git patch |
| `tools.git_status` | `worktree_id?` | 查询 worktree 状态 |
| `tools.git_diff` | `ref_a?`, `ref_b?`, `paths?` | 查询 diff |
| `tools.web_fetch` | `url`, `method?`, `headers?`, `body?` | 受策略约束的网络请求 |
| `tools.docker_run` | `image`, `command`, `mounts?`, `env?` | Docker 沙箱执行 |
| `tools.wsl_exec` | `command`, `distro?` | WSL 命令执行 |

---

## MCP Tools — Soul API

源文件：`packages/protocol/src/mcp/soul-tools.ts`

| 工具名 | 输入字段 | 返回与行为说明 |
|---|---|---|
| `soul.memory_search` | `project_id`, `query`, `anchors?`, `limit?`, `tracks?`, `budget?`, `scope?`, `dimension?`, `domain_tags?` | 返回 `MemorySearchResult`，包含 `cues[]`、`total_found`、`budget_used`；`limit` 默认 10、最大 20 |
| `soul.open_pointer` | `pointer`, `level: 'hint' \| 'excerpt' \| 'full'`, `max_tokens?`, `max_lines?`, `with_context?` | 返回内容、行号、`tokensUsed`、降级状态；找不到证据时可触发 relocation/healing |
| `soul.explore_graph` | `entity_name`, `track`, `depth?`, `limit?` | 返回 `nodes` 与 `edges`；`nodes` 为 `CueRef[]` |
| `soul.propose_memory_update` | `project_id`, `cue_draft`, `edge_drafts?`, `confidence`, `impact_level` | 返回 `proposal_id`；无需 checkpoint 时会走自动接受链路 |
| `soul.review_memory_proposal` | `proposal_id`, `action: 'accept' \| 'edit' \| 'reject' \| 'hint_only'`, `edits?` | 返回 `status`、`cue_id?`、`commit_sha?`、`edge_count?` 等提交结果 |

附加约束：
- `ContextLens` 组装提示上下文时会把 `budget_tokens` 硬上限收敛到 600。
- `soul.open_pointer` 当前默认预算为：`excerpt = 200 tokens`，`full = 800 tokens`；预算不足时会降级到更轻量级别。
- `working` 级提案可自动接受；`claim_*` 最终写入仍必须经 `run_checkpoint`。

相关实现：
- `packages/soul/src/search/retrieval-router.ts`
- `packages/soul/src/context/lens.ts`
- `packages/soul/src/mcp/open-pointer-handler.ts`
- `packages/soul/src/mcp/propose-handler.ts`
- `packages/soul/src/mcp/review-handler.ts`

---

## Core HTTP 端点

源文件：`packages/core/src/server/routes.ts` 及其子路由

| 方法 | 路径 | 说明 | 备注 |
|---|---|---|---|
| `GET` | `/health` | 健康检查 | 返回 `ok`, `uptime`, `version` |
| `GET` | `/events` | legacy SSE 事件流 | 每条消息为 `data: <CoreSseEnvelope JSON>` |
| `GET` | `/api/events/stream` | 正式 SSE 事件流 | 每条消息为 `data: <CoreSseEnvelope JSON>` |
| `GET` | `/state` | 当前 `hot_state` 读模型 | 返回 `revision`, `recentEvents`, `pendingApprovals` |
| `GET` | `/api/workbench/snapshot` | Workbench 查询面 | 返回 `WorkbenchSnapshot`；`modules` 为正式模块状态，`health` 为兼容派生字段 |
| `GET` | `/api/workflows/templates` | Create Run 模板查询 | 返回 `TemplateDescriptor[]` |
| `GET` | `/api/runs/:runId/timeline` | Timeline 分页查询 | 支持 `beforeRevision`、`limit` 查询参数，返回 `TimelinePage` |
| `GET` | `/api/runs/:runId/inspector` | Inspector 查询面 | 返回 `InspectorSnapshot` |
| `GET` | `/api/settings` | Settings 查询面 | 返回 `SettingsSnapshot` |
| `GET` | `/api/approvals/:approvalId` | Approval probe | 返回 `ApprovalProbe` |
| `GET` | `/api/memory/:memoryId` | Memory probe | 返回 `MemoryProbe` |
| `POST` | `/api/workspaces/open` | 打开或导入 workspace | 请求体为 `OpenWorkspaceRequest`，按 `rootPath` 幂等 upsert，返回 `CoreCommandAck` |
| `POST` | `/api/runs` | Create Run 命令入口 | 请求体为 `CreateRunRequest`，返回 `CoreCommandAck`；当 `workspaceId` 不存在时返回 `workspace_not_found`，不会隐式 upsert workspace |
| `POST` | `/api/runs/:runId/messages` | 发送 message 命令入口 | 请求体为 `RunMessageRequest`，返回 `CoreCommandAck` |
| `POST` | `/api/approvals/:approvalId/decide` | Approval 决策入口 | 请求体为 `ApprovalDecisionRequest`，返回 `CoreCommandAck` |
| `POST` | `/api/memory/proposals/:proposalId/review` | Memory proposal 审核入口 | 请求体为 `MemoryProposalReviewRequest`，返回 `CoreCommandAck` |
| `POST` | `/api/memory/:memoryId/pin` | Memory pin 命令入口 | 请求体为 `MemoryPinRequest`；当前返回 formal ack，异步收敛为 failed |
| `POST` | `/api/memory/:memoryId/edit` | Memory edit 命令入口 | 请求体为 `MemoryEditRequest`；当前返回 formal ack，异步收敛为 failed |
| `POST` | `/api/memory/:memoryId/supersede` | Memory supersede 命令入口 | 请求体为 `MemorySupersedeRequest`；当前返回 formal ack，异步收敛为 failed |
| `POST` | `/api/nodes/:nodeId/resolve-drift` | Drift resolution 命令入口 | 请求体为 `DriftResolutionRequest`；当前返回 formal ack，异步收敛为 failed |
| `POST` | `/api/runs/:runId/integration-gate/decide` | Integration gate 决策入口 | 请求体为 `IntegrationGateDecisionRequest`；当前返回 formal ack，异步收敛为 failed |
| `PATCH` | `/api/settings` | Settings 更新入口 | 请求体为 `SettingsPatchRequest`，返回 `CoreCommandAck` |
| `GET` | `/acks/:ackId` | legacy ack overlay 查询 | 返回 `ack_id`, `entity_type`, `entity_id`, `revision`, `status`, `created_at`, `committed_at?`, `error?` |
| `POST` | `/internal/hook-event` | Claude hook 工具事件入口 | 仅 loopback + Bearer token；校验 `ToolExecutionEventSchema`，返回 `ok`, `revision`, `ackId` |
| `POST` | `/mcp/call` | MCP 工具调用入口 | 仅 loopback + Bearer token；支持 `tool`/`name` 与 `args`/`arguments` |
| `GET` | `/soul/proposals` | 查询待决 memory proposal | 支持 `project_id` 查询参数；经 `ProjectionManager` 读 `pending_soul_proposals` |
| `GET` | `/soul/healing/stats` | 查询 pointer healing 统计 | 经 `ProjectionManager` 读 `healing_stats_view` |
| `POST` | `/_dev/start-run` | 开发环境启动 run | 仅 `isDevelopment` 时注册，且仅 loopback |
| `POST` | `/_dev/publish` | 开发环境直接发布事件 | 仅 `isDevelopment` 时注册；服务端补 `revision: 0` 后用 `AnyEventSchema` 校验，返回 `ok`, `ackId` |

`/api/*` 当前成功响应统一为：

```json
{
  "ok": true,
  "data": { "...": "typed payload" }
}
```

`/state` 当前返回结构：

```json
{
  "revision": 123,
  "recentEvents": [{ "...": "BaseEvent payload" }],
  "pendingApprovals": [
    {
      "approvalId": "appr-1",
      "createdAt": "2026-03-08T10:00:00.000Z",
      "runId": "run-1",
      "toolName": "tools.shell_exec"
    }
  ]
}
```

---

## SQLite 表结构 — state.db

来源：`packages/core/src/db/migrations/v1.ts`、`packages/core/src/db/migrations/v2.ts`、`packages/core/src/db/migrations/v3.ts`、`packages/core/src/db/migrations/v4.ts`

| 表名 | 迁移版本 | 关键列 | 说明 |
|---|---|---|---|
| `event_log` | `v1` | `revision`, `timestamp`, `event_type`, `run_id`, `source`, `payload` | 事件主日志 |
| `runs` | `v1` | `run_id`, `workspace_id`, `agent_id`, `engine_type`, `status`, `created_at`, `updated_at`, `completed_at`, `error`, `metadata` | run 热状态持久化；`status` 已包含 `governance_invalid`，`metadata` 持久化 `focusSurface`、`baselineLock`、`governanceLease`、`topologyKind` 等 Phase 3 元数据 |
| `workspaces` | `v1` | `workspace_id`, `name`, `root_path`, `engine_type`, `created_at`, `last_opened_at` | 工作区元数据 |
| `agents` | `v1` | `agent_id`, `name`, `role`, `engine_type`, `memory_ns`, `created_at`, `config` | agent 注册信息 |
| `approval_queue` | `v1` | `approval_id`, `run_id`, `tool_name`, `args`, `status`, `created_at`, `resolved_at`, `resolver` | 审批队列 |
| `snapshots` | `v1` | `snapshot_id`, `revision`, `created_at`, `payload` | 历史快照表 |
| `schema_version` | `v1` | `version`, `applied_at`, `description` | Core schema migration 版本 |
| `diagnostics_baseline` | `v2` | `workspace_id`, `error_count`, `created_at`, `updated_at` | 集成门诊断基线 |
| `baseline_locks` | `v3` | `lock_id`, `run_id`, `surface_id`, `workspace_id`, `baseline_fingerprint`, `locked_at`, `files_snapshot` | FocusSurface 基线锁；`files_snapshot` 以 JSON 持久化 |
| `governance_leases` | `v4` | `lease_id`, `run_id`, `workspace_id`, `surface_id`, `valid_snapshot`, `conflict_conclusions`, `invalidation_conditions`, `issued_at`, `expires_at`, `status` | Run 预飞行治理租约；复杂结构均以 JSON 持久化 |

`event_log.event_type` 写入优先级固定为：

1. `eventType`
2. `type`
3. `event`
4. `status:${status}`
5. 默认值 `event`

源文件：`packages/core/src/eventbus/event-bus.ts`

---

## SQLite 表结构 — soul.db

来源：`packages/soul/src/db/migrations/v1.ts` 到 `v7.ts`

| 表名 | 迁移版本 | 关键列 | 说明 |
|---|---|---|---|
| `memory_cues` | `v1 + v6` | `cue_id`, `project_id`, `gist`, `summary`, `source`, `type`, `formation_kind`, `dimension`, `scope`, `domain_tags`, `impact_level`, `track`, `anchors`, `pointers`, `evidence_refs`, `focus_surface`, `snippet_excerpt`, `activation_score`, `retention_score`, `manifestation_state`, `retention_state`, `decay_profile`, `confidence`, `claim_*`, `pruned`, `metadata` | 主记忆表；v6 激活 concept axis 与 checkpoint claim 字段 |
| `memory_cues_fts` | `v1` | `gist`, `anchors` | FTS5 虚表，配套 `cue_ai`/`cue_ad`/`cue_au` trigger |
| `memory_graph_edges` | `v1` | `edge_id`, `source_id`, `target_id`, `relation`, `track`, `confidence`, `evidence`, `created_at` | 图关系边 |
| `evidence_index` | `v1 + v5 + v7` | `evidence_id`, `cue_id`, `pointer`, `pointer_key`, `level`, `content_hash`, `embedding`, `last_accessed`, `access_count`, `relocation_*`, `git_commit`, `repo_path`, `symbol`, `snippet_excerpt`, `context_fingerprint`, `confidence`, `created_at` | 证据索引；v5 增加 relocation 字段，v7 增加 capsule 字段 |
| `projects` | `v2` | `project_id`, `primary_key`, `secondary_key`, `workspace_path`, `fingerprint`, `memory_repo_path`, `created_at`, `last_active_at`, `bootstrapping_phase_days` | 项目与 memory repo 绑定 |
| `memory_proposals` | `v3` | `proposal_id`, `project_id`, `cue_draft`, `edge_drafts`, `confidence`, `impact_level`, `requires_checkpoint`, `status`, `proposed_at`, `resolved_at`, `resolver` | 记忆提案队列表 |
| `soul_budgets` | `v4` | `date`, `tokens_used`, `dollars_used`, `created_at`, `updated_at` | 日预算统计 |
| `refactor_events` | `v5` | `event_id`, `project_id`, `commit_sha`, `renames`, `detected_at` | 重构与重定位事件 |
| `soul_schema_version` | runner | `version`, `applied_at`, `description` | Soul schema migration 版本 |

补充说明：
- `memory_repo` 只接受 `impact_level = 'canon'` 的 cue 落盘到 Git 仓库。
- `claim_draft`、`claim_confidence`、`claim_gist`、`claim_mode`、`claim_source` 只能通过 checkpoint 写路径进入 `memory_cues`。
- 用户决策 ledger 不在 SQLite 中，当前路径为 `~/.do-what/state/evidence/user_decisions.jsonl`，记录格式见 `UserDecisionSchema`。

相关源码：
- `packages/protocol/src/soul/memory-cue.ts`
- `packages/protocol/src/soul/evidence.ts`
- `packages/protocol/src/soul/user-decision.ts`
- `packages/soul/src/claim/checkpoint-writer.ts`
- `packages/soul/src/ledger/decision-recorder.ts`

---

## xstate 状态机

来源：`packages/core/src/machines/`

| 状态机 | 主要状态 | 主要事件 | 说明 |
|---|---|---|---|
| `runMachine` | `idle`, `created`, `started`, `running`, `waiting_approval`, `completed`, `failed`, `cancelled`, `interrupted`, `governance_invalid` | `START`, `TOOL_REQUEST`, `TOOL_RESOLVED`, `TOOL_FAILED`, `COMPLETE`, `FAIL`, `CANCEL`, `INTERRUPT`, `GOVERNANCE_INVALIDATE` | 负责 run 生命周期与 run 状态持久化 |
| `engineMachine` | `disconnected`, `connecting`, `connected`, `degraded`, `circuit_open` | `CONNECT`, `DISCONNECT`, `HEARTBEAT_TIMEOUT`, `PARSE_ERROR`, `RECOVER` | 负责引擎连接状态与熔断 |
| `approvalMachine` | `idle`, `waiting` | `ENQUEUE`, `USER_APPROVE`, `USER_DENY`, `TIMEOUT` | 负责审批队列串行消费与 timeout |

状态迁移注释已直接维护在：
- `packages/core/src/machines/run-machine.ts`
- `packages/core/src/machines/engine-machine.ts`
- `packages/core/src/machines/approval-machine.ts`

---

## Policy 配置格式

源文件：`packages/protocol/src/policy/config.ts`、`packages/protocol/src/policy/defaults.ts`

Schema：

```json
{
  "tools.shell_exec": {
    "default": "ask",
    "allow_paths": ["..."],
    "deny_paths": ["..."],
    "allow_commands": ["git status"],
    "allow_domains": ["example.com"]
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `default` | `'allow' \| 'ask' \| 'deny'` | 默认决策 |
| `allow_paths` | `string[]` | 允许路径前缀 |
| `deny_paths` | `string[]` | 禁止路径前缀 |
| `allow_commands` | `string[]` | 允许命令前缀 |
| `allow_domains` | `string[]` | 允许域名 |

默认策略：

| 工具 | 默认值 |
|---|---|
| `tools.file_read` | `allow` |
| `tools.git_status` | `allow` |
| `tools.git_diff` | `allow` |
| 其他 Tools API 工具 | `ask` |

---

## Pointer 格式规范

源文件：`packages/soul/src/pointer/pointer-parser.ts`

Pointer 是以空白分隔的 `key:value` 片段序列，当前识别的标准键：

| 键名 | 解析字段 | 说明 |
|---|---|---|
| `git_commit` | `gitCommit` | Git 提交 SHA |
| `repo_path` | `repoPath` | 仓库内相对路径 |
| `symbol` | `symbol` | 代码符号名 |
| `snippet_hash` | `snippetHash` | 摘录哈希 |

示例：

```text
git_commit:abc1234 repo_path:packages/core/src/server/routes.ts symbol:registerRoutes
```

规则：
- 未识别的键会进入 `extras`。
- 至少需要成功解析出一个标准键或一个额外键，否则视为非法 pointer。
- `pointer_key` 是 evidence 索引的稳定去重键，基于解析后的 pointer 组件生成。

---

## 内部通信协议

### 1. Core SSE

源文件：`packages/core/src/server/sse.ts`

- `GET /events`
- `GET /api/events/stream`
- 返回 `text/event-stream`
- 每条消息格式：`data: ${JSON.stringify(envelope)}\n\n`
- `envelope` 当前结构为 `CoreSseEnvelope`，包含：
  - `revision`
  - `coreSessionId`
  - `event`
  - `causedBy?`
- `coreSessionId` 在单个 Core 进程生命周期内稳定，重启后变化。
- `causedBy` 优先取事件负载中的显式字段；缺失时回退到 ack tracker 的 revision -> cause 映射。

### 2. Claude Hook -> Core

源文件：`packages/core/src/server/internal-routes.ts`

- `POST /internal/hook-event`
- 只允许 loopback 地址
- 需要 `Authorization: Bearer <token>`
- 请求体校验为 `ToolExecutionEventSchema`
- 成功返回：

```json
{
  "ackId": "3f4d8d6a-7d62-4f6d-91a1-2a2f88d93210",
  "ok": true,
  "revision": 42
}
```

### 3. Core Dev Publish

源文件：`packages/core/src/server/routes.ts`

- `POST /_dev/publish`
- 仅开发环境启用，且仅 loopback
- 请求体服务端补 `revision: 0` 后，用 `AnyEventSchema` 校验
- 成功返回：

```json
{
  "ackId": "3f4d8d6a-7d62-4f6d-91a1-2a2f88d93210",
  "ok": true
}
```

### 4. Claude 本地 MCP Server

源文件：`packages/engines/claude/src/mcp-server.ts`

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/tools` | 返回 `ToolsApiJsonSchemas` 生成的工具列表 |
| `POST` | `/call` | 调用单个 Tools API 工具，返回 `ok`, `status`, `approvalId?`, `result?`, `error?` |

### 5. Codex JSONL 归一化

源文件：`packages/engines/codex/src/event-normalizer.ts`

Codex 原始事件类型当前归一化规则：

| 原始 `type/event` | 归一化结果 |
|---|---|
| `approval_request` | `ToolExecutionEvent.status = 'requested'` |
| `diff` | `EngineOutputEvent.type = 'diff'` |
| `plan_node` | `EngineOutputEvent.type = 'plan_node'` |
| `token_stream` | `EngineOutputEvent.type = 'token_stream'` |
| `run_complete` | `RunLifecycleEvent.status = 'completed'` |
| `run_failed` | `RunLifecycleEvent.status = 'failed'` |
| `tool_result` | `ToolExecutionEvent.status = 'completed'` |
| `tool_failed` | `ToolExecutionEvent.status = 'failed'` |
| `fixture_meta` | 忽略，不入事件总线 |

补充说明：
- `approval_request` 兼容 `requestId | id | request_id`。
- plan 节点状态会被映射为 `pending | active | done | failed`。

---

## 变更记录

| 日期 | Ticket | 变更说明 |
|---|---|---|
| 2026-03-08 | T029 | `AnyEventSchema` 纳入 `SoulEvent`，补充 `/_dev/publish` 与 `event_log.event_type` 优先级说明 |
| 2026-03-08 | T031 | `memory_cues` 激活 `formation_kind`、`dimension`、`focus_surface` 与 checkpoint claim 字段说明 |
| 2026-03-08 | T032 / T035 | 补充 `soul.memory_search`、`soul.explore_graph`、ContextLens 与 graph recall 读路径说明 |
| 2026-03-08 | T033 / T036 | 补充 `run_checkpoint`、`memory_cue_*`、`claim_superseded` 与 `evidence_index` capsule 字段说明 |
| 2026-03-08 | T037 | 补充 `UserDecisionSchema` 与 `user_decisions.jsonl` ledger 路径说明 |
| 2026-03-08 | T038 | 补充 `CoreHotState` / `RunHotState` / `ApprovalHotState` 等 hot_state 类型与 `/state` 热态读路径说明 |
| 2026-03-08 | T039 | 补充 `ProjectionKind` / `ProjectionEntry` 与 `/soul/proposals`、`/soul/healing/stats` 的 projection 读模型说明 |
| 2026-03-08 | T040 | 补充 `AckOverlay`、`GET /acks/:ack_id` 与 `/internal/hook-event`、`/_dev/publish` 的 `ackId` 返回体 |
| 2026-03-08 | T041 | 明确 `memory_repo` 仅接收 `impact_level = 'canon'` 的 cue 写入 |
| 2026-03-09 | T042 | 补充 `FocusSurface`、`BaselineLock`、`baseline_locks` 表与基线锁指纹规则 |
| 2026-03-09 | T043 | 补充 `DriftAssessment` / `MergeDecision`、`run_serialized` 事件与串行降级说明 |
| 2026-03-09 | T044 | 补充 `GovernanceLease`、`NativeSurfaceReport`、`run_start_denied` 与 `governance_leases` 表 |
| 2026-03-09 | T045 | 补充 `OrchestrationTemplate`、`TopologyValidator`、`run_topology_invalid` 与 `governance_invalid` 终态 |
| 2026-03-10 | T002 | 补充 v0.1-UI `WorkbenchSnapshot`、`TimelinePage`、`InspectorSnapshot`、`SettingsSnapshot`、`TemplateDescriptor`、`CoreCommand*`、`CoreSseEnvelope` 前端共享契约 |
| 2026-03-11 | T030 / T031 / T032 | 补充 `/api/*` query / command / probe surface、`AckEntityType` 扩展，以及 `CoreSseEnvelope` 的 `coreSessionId` / `causedBy` 实际输出说明 |
| 2026-03-13 | C003 | 新增 `OpenWorkspaceRequest`、`POST /api/workspaces/open`，并为 `CoreCommandAck` 补充 `entityType` / `entityId` 回传说明 |
| 2026-03-13 | C004 | 新增 `ModuleStatus*` / `WorkbenchModulesSnapshot` / `CoreHotState.modules`，明确 `/api/workbench/snapshot` 的 `modules` 契约、`health` 派生语义，以及 `POST /api/runs` 的 `workspace_not_found` 边界 |
