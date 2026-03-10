# do-what Workbench 状态模型文档

> 状态：Draft for Codex implementation
>
> 说明：本文件中的 store 名、selector 名、类型名、hook 名、路由名，**都属于建议命名**。落地时应以现有 `packages/app`、`packages/protocol`、`packages/core` 的真实代码结构为准进行对齐，但不要改变本文定义的分层原则。
>
> 额外说明：当前项目目录下的 UI 参考 HTML、SVG、样式草稿目录，只是临时设计源。Codex 必须在实现过程中把采用的页面结构、视觉资产与 SVG 收编到 `packages/app` 内，并在完成迁移后移除该临时目录，避免双份前端真相源。

---

## 0. 文档目的

本文件回答的是：

1. 工作台前端到底有哪些状态。
2. 这些状态分别归谁管。
3. 哪些状态来自 CoreHotState，哪些来自 Projection，哪些仅属于 UI 本地。
4. 组件该读哪个 store，发哪个 command，而不是自己各自 fetch。
5. Pending Command / Ack Overlay、并行节点 thread、Drift / Governance / SOUL richer projection 如何进入前端状态模型。
6. Core 崩溃 / 重启、治理租约、跨 workspace 草稿污染、全局记忆爆炸半径、离线冻结态，这些真实世界的脏场景如何被前端兜住。
7. Workflow 模板系统未来变化时，前端如何把影响限制在 descriptor / create-run / schema 映射层，而不是炸穿整个工作台。

---

## 1. 总体原则

### 1.1 前端不维护业务真相
前端永远不拥有业务真相。

业务真相来自：
- HTTP snapshot
- SSE events
- command ack

前端只做：
- 当前页面的状态投影
- 交互中的短时覆盖（pending command / ack overlay）
- 纯本地 UI 状态

### 1.2 状态必须分层
工作台状态至少分为五层：

1. **Hot State**
   - 接 CoreHotState
   - 用于控制区
   - 必须稳定

2. **Projection State**
   - 接 Projection / Inspector / 查询结果
   - 用于富视图
   - 可以延迟更新

3. **Pending Command State**
   - 跟踪本地已发出的 command
   - 用于处理竞态、失败回滚、断线与 Core 重启

4. **Ack Overlay State**
   - 接收 command 成功后的短时覆盖
   - 用于防止 UI 闪回旧状态，并支持乐观渲染

5. **UI Local State**
   - 只属于前端
   - 不写回 Core

### 1.3 组件不直接 fetch
所有组件：
- 通过 selector 读 store
- 通过 action / command dispatcher 发命令
- 不在组件内部直接请求核心业务接口

唯一例外可以是非常局部的静态资源或开发期 mock，但不允许进入主路径。

### 1.4 设计工地必须被收编
前端实现完成后，只允许一个正式真相源：`packages/app` 内的页面、组件、样式与资产。

不允许长期并存：
- 一套参考 HTML
- 一套运行时 React 页面
- 两份 SVG
- 两套 token

### 1.5 Workflow 模板兼容原则
Create Run UI 不应深度耦合某一版模板枚举。前端内部应尽量围绕：
- `TemplateDescriptor[]`
- `templateInputs`
- `template registry adapter`
来组织，而不是把模板逻辑分散写死在多个组件和 selector 中。

---

## 2. 前端状态总览

建议前端至少拆为以下 store：

- `hotStateStore`
- `projectionStore`
- `pendingCommandStore`
- `ackOverlayStore`
- `uiStore`
- `settingsQueryBridgeStore`（可选，仅用于 governance 锁定桥接）
- `templateRegistryStore`（可选，若不完全交给 Query）

若想更细，也可以在实现层再拆 slice，但逻辑分层必须保持一致。

---

## 3. hotStateStore

## 3.1 职责
存储会直接影响：
- 哪些按钮能不能点
- 当前 run 是否运行中
- 当前审批是否待处理
- 当前节点是谁
- Engine / Core / Soul 是否在线
- 当前节点是否 soft-stale / hard-stale
- 当前 lease 是否有效
- 当前 Core 生命周期是否变化
- 当前界面是否应进入全局冻结态

这层是工作台的“控制区状态”。

## 3.2 状态结构建议
```ts
interface HotStateStore {
  revision: number | string
  coreSessionId: string | null
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
  globalInteractionLock: {
    isLocked: boolean
    reason: 'core_offline' | 'core_reconnecting' | 'core_rebooting' | null
  }

  health: {
    engine: 'idle' | 'running' | 'degraded' | 'offline'
    core: 'booting' | 'healthy' | 'degraded' | 'offline' | 'rebooting'
    soul: 'idle' | 'active' | 'degraded' | 'offline'
  }

  workspaces: Record<string, WorkspaceHotSummary>
  runs: Record<string, RunHotSummary>
  nodes: Record<string, NodeHotSummary>
  approvals: Record<string, ApprovalHotSummary>

  governance: {
    leaseStatus: 'none' | 'active' | 'stale' | 'conflicting'
    currentLeaseId: string | null
    hasConflicts: boolean
    managedLocks?: ManagedLockSummary[]
  }

  selectedWorkspaceId: string | null
  selectedRunId: string | null
}
```

### WorkspaceHotSummary
```ts
interface WorkspaceHotSummary {
  workspaceId: string
  name: string
  path: string
  status: 'idle' | 'running' | 'attention'
  runIds: string[]
}
```

### RunHotSummary
```ts
interface RunHotSummary {
  runId: string
  workspaceId: string
  title: string
  status:
    | 'queued'
    | 'running'
    | 'waiting_approval'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'interrupted'
  activeNodeId: string | null
  pendingApprovalIds: string[]
  updatedAt: string
}
```

### NodeHotSummary
```ts
interface NodeHotSummary {
  nodeId: string
  runId: string
  engine: 'claude' | 'codex' | 'integrator' | string
  role: 'lead' | 'review' | 'worker' | 'integrator' | string
  status: 'idle' | 'running' | 'waiting' | 'completed' | 'failed' | 'stale'

  focusSurfaceSummary?: {
    packageScope?: string | null
    pathGlobs?: string[]
    artifactKind?: string | null
  }

  driftState: 'none' | 'soft_stale' | 'hard_stale'
  baselineLockState?: 'unlocked' | 'locked' | 'invalidated'
  integrationGateState?: 'open' | 'blocked' | 'waiting_reconcile'
  waitingReason?: string | null
  currentStep?: string
}
```

### ApprovalHotSummary
```ts
interface ApprovalHotSummary {
  approvalId: string
  runId: string
  sourceNodeId?: string
  toolName: string
  summary: string
  status: 'pending' | 'approved' | 'denied'
  createdAt: string
}
```

### ManagedLockSummary
```ts
interface ManagedLockSummary {
  leaseId: string
  lockedFields: string[]
}
```

## 3.3 来源
来源只允许两种：
- `GET /api/workbench/snapshot`
- SSE events

不允许：
- 从 Projection 反推
- 从 timeline 自己猜

## 3.4 全局冻结态
当以下任一条件成立时：
- `connectionState = disconnected | reconnecting`
- `health.core !== healthy`

则 `globalInteractionLock.isLocked = true`。

冻结态下应禁用：
- 新建 Run
- 所有 Approval / Reject
- Memory Pin / Edit / Supersede
- Drift / Integration Gate 处置
- 所有真正发 command 的操作

但允许：
- 浏览已有数据
- 切换 tab
- 输入框保留本地草稿输入

## 3.5 组件读取者
以下组件优先读 hotStateStore：
- 左栏 WorkspaceTree
- 左栏 RunList
- 底部状态条（Engine/Core/Soul）
- 审批数量提示
- Run 状态点
- 顶部或局部控制按钮禁用态
- 协作区当前活跃节点概要
- Drift / Governance 摘要提示
- Settings 页的只读 / 锁定态
- 全局离线遮罩 / 冻结提示条

---

## 4. projectionStore

## 4.1 职责
用于承载富视图和侧视图，不直接决定主控制区行为。

适合放：
- 已修改文件
- 计划
- Git / 协作详细信息
- 历史摘要
- Soul 检索结果
- 图探索结果
- 记忆 proposal 列表
- 健康报告、统计、诊断
- Governance / Checkpoint / Native Surface 报告
- 并行节点 threads 与 merged timeline

## 4.2 状态结构建议
```ts
interface ProjectionStore {
  runInspectors: Record<string, RunInspectorProjection>
  runTimelines: Record<string, TimelineProjection>
  soulPanels: Record<string, SoulProjection>

  mountedRunIds: string[]
  maxMountedRuns: number
}
```

### RunInspectorProjection
```ts
interface RunInspectorProjection {
  runId: string
  changedFiles: ChangedFileItem[]
  plan: PlanItem[]
  collaboration: CollaborationProjection
  history: HistoryProjection

  driftDiagnostics?: {
    softStaleNodes: string[]
    hardStaleNodes: string[]
    notes?: string[]
  }

  governancePanel?: {
    leaseStatus: 'none' | 'active' | 'stale' | 'conflicting'
    nativeSurfaceReport?: NativeSurfaceReportProjection
  }

  checkpointPanel?: {
    pending: CheckpointItem[]
    recent: CheckpointItem[]
  }

  updatedAt: string
}
```

### TimelineProjection
```ts
interface TimelineProjection {
  runId: string

  mergedItems: TimelineItem[]
  nodeThreads: Record<string, TimelineItem[]>
  laneOrder: string[]

  integrationMoments?: TimelineMarker[]
  handoffMoments?: TimelineMarker[]
  blockedMoments?: TimelineMarker[]

  loaded: boolean
  loading: boolean
  loadingMoreBefore?: boolean
  hasMoreBefore?: boolean
  nextBeforeRevision?: number | string | null
  loadedRange?: {
    oldestRevision?: number | string | null
    newestRevision?: number | string | null
  }
}
```

补充规则：
- 首屏默认只加载“最新一页”。
- 向上翻页时只更新头部区间，不重置尾部 optimistic message。
- `nextBeforeRevision` 只用于历史分页，不参与消息尾部排序。

### SoulProjection
```ts
interface SoulProjection {
  memoryList: MemoryListItem[]
  graphPreview: GraphPreviewNode[]
  proposals: MemoryProposalItem[]

  filters: {
    scope?: string | null
    dimension?: string | null
    retentionState?: string | null
    slotConflictOnly?: boolean
  }
}
```

## 4.3 MemoryListItem 最低要求
Memory item 需要包含：
- scope
- dimension
- manifestationState
- retentionState
- claim 摘要
- slotStatus
- conflictCount

并支持 UI 判断：
- 是否是 `global-core | global-domain`
- 是否需要危险确认
- 是否允许创建 `project override`

## 4.4 TimelineItem 建议
建议 timeline item 直接来自统一事件投影：
```ts
type TimelineItem =
  | UserMessageItem
  | EngineMessageItem
  | CodeExcerptItem
  | ToolExecutionItem
  | ApprovalCardItem
  | ResultBlockItem
  | MemoryProposalCardItem
  | GovernanceNoticeItem
  | DriftNoticeItem
```

## 4.5 Projection 的更新策略
- 初次进入 run：HTTP 拉 snapshot / timeline / inspector，但 timeline 默认只取最新一页
- 后续：SSE 增量 merge
- 向上翻历史：走 `beforeRevision + limit` 的 HTTP 分页
- 允许存在轻微延迟
- 不允许拿它控制审批按钮和 run 关键状态
- 当对象型 overlay 进入 `reconciling` 时，projection 允许被局部 refetch 主动追平

Active Projection 规则：
- Projection Store 只为 `mountedRunIds` 中的 run 挂载细粒度 projection；默认至少包含 `selectedRunId`。
- 建议 `maxMountedRuns = 1~2`，避免后台 run 的细粒度流把前端内存养胖。
- 对于未挂载 run，不得 merge token chunk、changed files 明细、plan diff、history diff。
- 用户切换到一个未挂载 run 时，必须重新拉取该 run 的 timeline / inspector，再挂载到 `projectionStore`。

## 5. pendingCommandStore

## 5.1 职责
跟踪已经发出的前端 command，解决：
- HTTP 与 SSE 的竞态
- command loading 状态
- command 失败回滚
- overlay 悬挂
- Core 崩溃 / 重启后的状态黑洞

## 5.2 状态结构建议
```ts
interface PendingCommandStore {
  commands: Record<string, PendingCommandEntry>
}

interface PendingCommandEntry {
  clientCommandId: string
  entityType: 'run' | 'approval' | 'memory' | 'policy' | 'message' | 'node' | 'integration_gate'
  entityId?: string | null
  runId?: string | null
  action: string
  status: 'pending' | 'acked' | 'failed' | 'settled' | 'desynced'
  ackId?: string | null
  revision?: number | string | null
  coreSessionIdAtSend: string | null
  optimisticPayload?: Record<string, unknown> | null
  localSequence?: number | null
  reconcileTarget?:
    | { kind: 'memory_detail'; memoryId: string }
    | { kind: 'approval_detail'; approvalId: string }
    | { kind: 'run_inspector'; runId: string }
    | { kind: 'run_timeline'; runId: string }
    | null
  error?: {
    code: string
    message: string
  } | null
  createdAt: string
}
```

字段说明：
- `runId`：用于把 message 类型命令挂到对应 timeline。
- `optimisticPayload`：message 命令存 `{ text, attachments }`；对象型命令也可保存最小 UI 覆盖所需字段。
- `localSequence`：仅 message 使用，由前端单调递增生成，保证 optimistic tail 在网卡时仍有稳定顺序。
- `reconcileTarget`：定义该命令在 `reconciling/desynced` 时应该命中的最小 refetch 目标，避免前端靠猜。
- `desynced`：表示命令很可能已被 Core 接收，但前端未能可靠确认 Projection 已追平。

## 5.3 生命周期
1. 发 command 时创建 pending entry。
2. HTTP 返回 ack 后，转成 `acked`。
3. SSE 收到 `causedBy.clientCommandId` / `causedBy.ackId` 匹配事件后，转成 `settled`。
4. 若 HTTP 失败，转成 `failed`。
5. 若断线 / Core 会话切换，所有 `pending/acked` 命令转成 `failed(connection_lost)`。
6. 若 refetch 失败或结果仍矛盾，转成 `desynced`。
7. `desynced` 必须暴露两个用户动作：
   - `retrySync(clientCommandId)`：按 `reconcileTarget` 再做一次 probe/refetch
   - `dismissSyncIssue(clientCommandId)`：本地销毁 overlay / optimistic tail，退回当前 Projection
8. settled、failed 或被本地 dismiss 后进入清理队列。

## 5.4 Core 生命周期切换规则
一旦出现以下任一情况：
- `connectionState -> disconnected/reconnecting`
- `health.core -> offline/rebooting`
- 新 snapshot / SSE 中的 `coreSessionId` 与旧值不同

则：
- 清空所有 `pending` / `acked` 的活跃命令
- 统一标记为 `failed`
- error.code = `COMMAND_CONNECTION_LOST`

---

## 6. ackOverlayStore

## 6.1 职责
当用户执行关键操作后：
- command 已成功发给 Core
- 真实 Projection 还没追上
- 先临时覆盖 UI 表现

这是 v0.1.x 中 Ack Overlay 的前端镜像。

## 6.2 适用场景
- 新建 Run
- 允许 / 拒绝审批
- 接受 / 拒绝 / pin / supersede / edit 某条记忆
- resolve drift / integration gate 决策
- 切换关键策略（可选）

明确排除：
- `message` 不进入 `ackOverlayStore`
- timeline 追加类乐观渲染不属于 overlay 适用场景

## 6.3 数据结构建议
```ts
interface AckOverlayStore {
  overlays: Record<string, AckOverlayEntry>
}

interface AckOverlayEntry {
  ackId: string
  clientCommandId?: string | null
  entityType: 'run' | 'approval' | 'memory' | 'policy' | 'node' | 'integration_gate'
  entityId: string
  action: string
  revision: number | string
  status: 'accepted' | 'reconciling' | 'desynced'
  optimisticPayload?: Record<string, unknown>
  reconcileTarget?:
    | { kind: 'memory_detail'; memoryId: string }
    | { kind: 'approval_detail'; approvalId: string }
    | { kind: 'run_inspector'; runId: string }
    | { kind: 'run_timeline'; runId: string }
    | null
  createdAt: string
}
```

边界说明：
- 这层 store 只表示“对象型 UI 单元的短时覆盖”。
- 它不是 timeline optimistic append 的通用容器。
- 只要某个东西本质上是“列表尾部新增”，就别硬塞进 K-V overlay 里折腾自己。

## 6.4 optimisticPayload 规则
Overlay 不应只会说“accepted 了”，还应能让 UI 乐观显示结果。

示例：
- `edit memory` -> `{ gist: '使用 TS' }`
- `pin memory` -> `{ retentionState: 'canon' }`
- `resolve drift` -> `{ driftState: 'resolving' }`

组件渲染优先级建议：
1. failed / desynced pending command
2. overlay.optimisticPayload
3. hot state
4. projection

特殊边界：
- `message` 的 optimisticPayload 不在这里消费。
- `message` 只在 Timeline selector 中从 pendingCommandStore 读取，并作为 optimistic tail 追加。

## 6.5 生命周期
1. command 返回 ack
2. 对象型命令写入 ackOverlayStore，状态为 `accepted`
3. 对应组件先显示 overlay 后的结果
4. 收到 SSE / projection 更新，若精确命中 `clientCommandId` 或 `ackId`，立即移除 overlay
5. 若未命中，但 `currentRevision >= ack.revision`，进入 `reconciling`
6. `reconciling` 时必须按 `reconcileTarget` 触发一次最小粒度 HTTP refetch，追平 projection
7. refetch 证实新状态已可见，才允许清理 overlay
8. refetch 失败或仍不一致，则进入 `desynced`
9. `desynced` 不得变成 UI 僵尸；必须给用户 `Retry Sync` 与 `Dismiss / Rollback` 两个动作
10. 若 Core 会话切换，立即清空全部 overlays

## 6.6 延迟协调 GC
不得在 `revision >= ack.revision` 瞬间立刻清理 overlay。

必须：
- 先启动短延时（建议 1~2 秒）
- 期间优先等待精确匹配事件
- 超时后不是直接删，而是进入 `reconciling` + 触发 refetch
- refetch 成功确认 projection 追平后才真正清理
- refetch 失败或结果仍旧矛盾时，进入 `desynced` 并显示同步异常提示
- `desynced` 必须提供：
  - `Retry Sync`：重新命中 `reconcileTarget`
  - `Dismiss / Rollback`：本地放弃 overlay / optimistic tail，退回当前 Projection

否则会出现“新状态 -> 旧状态 -> 新状态”的幽灵闪烁，以及更隐蔽的前后端脑裂。

## 6.7 `desynced` 不是僵尸态
一旦某条命令或 overlay 进入 `desynced`，前端必须把它视为一个可处理的同步异常，而不是永远挂在那里的坏味道。

最低要求：
- 组件上必须可见“同步异常”状态
- 必须显示最后一次重试时间（若有）
- 必须提供 `Retry Sync` 与 `Dismiss / Rollback` 两个动作

动作语义：
- `Retry Sync`：按 `reconcileTarget` 再触发一次对象级 probe 或 run 级 refetch。
- `Dismiss / Rollback`：纯前端本地动作，移除 overlay / optimistic tail，让 UI 重新只看当前 Projection / hot state。

注意：
- `Dismiss / Rollback` 不是撤销 Core 中的真实写入。
- 它只是承认“我现在无法可靠证明刚才那次同步成功”，于是停止拿本地乐观状态继续硬撑。

---

## 7. uiStore

## 7.1 职责
只存前端本地 UI 状态，不写回 Core。

## 7.2 状态结构建议
```ts
interface UiStore {
  layout: {
    rightPanelCollapsed: boolean
    leftPanelCollapsed: boolean
  }

  navigation: {
    activeRightTab:
      | 'overview'
      | 'changed_files'
      | 'plan'
      | 'collaboration'
      | 'history'
      | 'governance'
      | 'checkpoint'
      | 'soul'
    settingsTab: 'engines' | 'soul' | 'policies' | 'environment' | 'appearance'
    timelineViewMode: 'merged' | 'threaded'
  }

  modal: {
    createRunOpen: boolean
    approvalPopoverOpenFor: string | null
    memoryProposalOpenFor: string | null
    globalMemoryWarningFor: string | null
  }

  drafts: {
    runInputByRunId: Record<string, string>
    createRunDraftsByWorkspace: Record<string, CreateRunDraft>
  }
}
```

### CreateRunDraft
```ts
interface CreateRunDraft {
  workspaceId: string | null
  taskPrompt: string
  templateType: string
  templateVersion?: number | null
  templateInputs: Record<string, unknown>
  participants: Array<{
    engine: string
    role: string
    enabled: boolean
  }>
  selfOrchestration: boolean
  advancedExpanded: boolean
}
```

## 7.3 Create Run 草稿隔离规则
- 每个 workspace 有独立 draft
- 切换 workspace 时读取对应 draft
- 关闭 modal 不清除当前 workspace draft
- 提交成功后只清除当前 workspace 对应 draft
- 不允许 Workspace A 的 prompt / focus surface 污染 Workspace B

## 7.4 全局记忆危险确认
当用户试图编辑 / supersede `global-core | global-domain` 记忆时：
- 弹出强确认 modal
- 提示 blast radius
- 提供：
  - 修改全局本体
  - 仅在当前项目创建 override
  - 取消

---

## 8. 设置页状态模型
设置页因为以 snapshot / patch 为主，可以有两种实现：

### 方案 A：TanStack Query 为主
- 每个 tab 都由 Query 拉取
- 本地表单状态用组件 state 或轻量表单 store
- 提交后 invalidate query

### 方案 B：settingsQueryBridgeStore
如果需要桥接 governance 租约，可维护：
```ts
interface SettingsQueryBridgeStore {
  governedByLease: {
    leaseId: string | null
    lockedFields: string[]
  }
  interruptedDraftByTab?: Record<string, {
    leaseId: string
    lockedFields: string[]
    draftSnapshot: Record<string, unknown>
    interruptedAt: string
  } | null>
}
```

## 8.1 设置页最低要求
- 监听 `GovernanceLeaseUpdated`
- invalidate 相关 settings query
- 将被租约接管字段置为 readonly / disabled
- 显示“当前设置已被治理租约接管”

额外硬规则：
- 若表单当前为 dirty，且新 lease 锁住了正在编辑的字段：
  - 必须先保存 `interruptedDraft`
  - 再切字段为 readonly / disabled
  - 再刷新 query
  - 再明确提示用户“本地草稿未生效，但已被保留”
- 不允许静默把用户正在输入的内容抹掉

建议：
- 设置页仍以 Query 为主
- 但必须读 hotStateStore.governance / bridge store 做只读判断
- 最好提供“复制被打断草稿”入口

## 9. templateRegistryStore（可选）

如果不完全交给 Query，可维护：
```ts
interface TemplateRegistryStore {
  templates: TemplateDescriptor[]
  loaded: boolean
  updatedAt?: string
}
```

其职责：
- 保存后端下发的模板描述符
- 驱动 Create Run 表单 schema
- 将未来 Workflow 模板演化影响尽量限制在 form adapter 层

不要让模板字段直接散落在多个组件 if/else 里长蘑菇。

---

## 10. 事件进入前端后的处理流程

## 10.1 事件处理管线
建议结构：

```ts
SSE -> eventClient -> normalizeEvent -> dispatchToStores
```

不要让组件各自监听 SSE。

## 10.2 normalizeEvent
作用：
- 将协议事件统一成前端可消费形状
- 做轻度字段兼容
- 做 `coreSessionId` 提取
- 不做业务推理

补充规则：
- normalize 阶段应提取 `runId`、`workspaceId`、是否属于细粒度 projection 事件。
- 这里不负责决定“这个事件要不要塞进哪个 timeline”；那是 dispatch 阶段的责任。

## 10.3 dispatchToStores
按事件类型更新不同 store：

Active Projection 截断原则：
- 只有当 `event.runId` 命中 `selectedRunId` 或 `mountedRunIds` 时，才允许 merge 细粒度 projection 事件。
- 对未挂载 run：
  - 只更新 hotStateStore 中的摘要字段
  - 不向 `projectionStore.runTimelines/runInspectors` 持续灌 token chunk / changed files diff / plan diff
- 当用户切到该 run 时，再通过 HTTP 拉取最新 timeline / inspector 并挂载。

### 示例
- `RunCreated` -> hotStateStore + pendingCommandStore + ackOverlayStore 清理
- `RunMessageAppended` / `UserMessageAccepted` -> 若 run 已挂载，则 projectionStore.timeline + pendingCommandStore 清理对应 optimistic message；否则只更新 run hot summary
- `ToolExecutionRequested` -> hotStateStore.approvals +（仅 active projection run 才写 projectionStore.timeline）
- `ToolExecutionApproved` -> hotStateStore.approvals +（若 run 已挂载则写 projectionStore.timeline）+ pendingCommandStore + ackOverlayStore 清理
- `ChangedFilesUpdated` -> 仅 active projection run 写 projectionStore.runInspectors；非活跃 run 只更新 hot summary 的 `lastEventAt/updatedAt`
- `EngineOutputChunk` -> 仅 active projection run 允许 merge 到 timeline；否则丢弃细粒度 chunk，不做后台积压
- `SystemHealthUpdated` -> hotStateStore.health + globalInteractionLock
- `CoreSessionChanged` -> hotStateStore.coreSessionId + pendingCommandStore 清理 + ackOverlayStore 清理
- `NodeDriftUpdated` -> hotStateStore.nodes +（若 run 已挂载则写 projectionStore.runInspectors）
- `GovernanceLeaseUpdated` -> hotStateStore.governance + projectionStore.runInspectors + settings query invalidation / interruptedDraft 保护
- `MemorySlotConflictUpdated` -> 若 soul panel 已挂载则写 projectionStore.soulPanels

## 11. 组件树与读源建议

## 11.1 AppShell
职责：
- 路由切换
- 读取 session token 初始化 client
- 首屏 bootstrap

## 11.2 WorkbenchPage
职责：
- 加载 workbench snapshot
- 建立 SSE 连接
- 提供左右中三栏

## 11.3 WorkspaceSidebar
读取：
- hotStateStore.workspaces
- hotStateStore.runs
- hotStateStore.health
- hotStateStore.globalInteractionLock

## 11.4 CreateRunModal
读取：
- 当前 workspaceId 对应的 `uiStore.drafts.createRunDraftsByWorkspace[workspaceId]`
- templateRegistryStore / Query templates
- hotStateStore.selectedWorkspaceId
- hotStateStore.globalInteractionLock

## 11.5 RunTimelinePane
读取：
- projectionStore.runTimelines[selectedRunId]
- hotStateStore.runs[selectedRunId]
- pendingCommandStore（仅筛出当前 run、`entityType = message`、`status in pending|acked|desynced`）
- uiStore.navigation.timelineViewMode

渲染规则：
1. 先显示 projection 的 `mergedItems`
2. 再把当前 run 的 optimistic message 作为 tail 追加
3. optimistic tail 按 `localSequence -> createdAt` 排序
4. 不允许从 ackOverlayStore 为 timeline 造一套 K-V 假秩序
5. 向上翻页只影响头部历史，不得打乱尾部 optimistic tail
6. 若 optimistic message 进入 `desynced`，尾部项必须可执行 `Retry Sync` 与 `Dismiss / Rollback`

## 11.6 ApprovalPopover / ApprovalCard
读取：
- hotStateStore.approvals
- pendingCommandStore
- ackOverlayStore
- hotStateStore.globalInteractionLock

额外要求：
- 若审批相关 command / overlay 进入 `desynced`，卡片上必须提供 `Retry Sync` 与 `Dismiss / Rollback`

## 11.7 InspectorRightPanel
读取：
- projectionStore.runInspectors[selectedRunId]
- hotStateStore.nodes
- hotStateStore.governance

## 11.8 SoulPanel / MemoryDrawer
读取：
- projectionStore.soulPanels[selectedRunId]
- pendingCommandStore
- ackOverlayStore
- hotStateStore.selectedWorkspaceId

额外要求：
- 若 memory 相关 command / overlay 进入 `desynced`，条目必须支持 `Retry Sync` 与 `Dismiss / Rollback`

需要展示的最小字段：
- dimension
- scope
- retentionState
- manifestationState
- claim 摘要
- slot conflict 摘要
- pin / supersede / edit 入口
- global scope 危险确认入口

## 11.9 SettingsPage
读取：
- Query 或 settings bridge store
- uiStore.navigation.settingsTab
- hotStateStore.governance
- hotStateStore.globalInteractionLock

额外要求：
- lease 打断 dirty form 时，需要显示被打断提示
- 允许用户复制 `interruptedDraft`
- 锁定态与“草稿仍本地保留”必须同时可见

## 12. command dispatcher 建议

```ts
interface WorkbenchCommands {
  createRun(input: CreateRunDraft): Promise<void>
  sendRunMessage(runId: string, text: string): Promise<void>
  decideApproval(approvalId: string, decision: 'allow_once' | 'allow_in_session' | 'reject'): Promise<void>
  cancelRun(runId: string): Promise<void>
  retryRun(runId: string): Promise<void>
  reviewMemoryProposal(proposalId: string, decision: 'accept' | 'reject' | 'hint_only'): Promise<void>
  pinMemory(memoryId: string): Promise<void>
  supersedeMemory(memoryId: string, replacement: SupersedePayload, targetScope?: 'same_scope' | 'project_override'): Promise<void>
  editMemory(memoryId: string, patch: EditMemoryPayload, targetScope?: 'same_scope' | 'project_override'): Promise<void>
  resolveDrift(nodeId: string, decision: 'force_rebase' | 'drop' | 'convert_to_serial' | 'mark_safe'): Promise<void>
  decideIntegrationGate(runId: string, decision: 'continue_serial' | 'retry_blocked_nodes' | 'abort_integration'): Promise<void>

  retrySyncIssue(clientCommandId: string): Promise<void>
  dismissSyncIssue(clientCommandId: string): void
}
```

所有 command 在进入 http client 之前都应先经过：
- global lock 检查
- scope 危险边界检查（对 global memory）
- clientCommandId 注入

---

## 13. 最小实现顺序

1. store 骨架
2. bootstrap（含 coreSessionId）
3. event client + session guard
4. 左栏与底部状态
5. createRunDraftsByWorkspace + template registry
6. timeline merged / threaded
7. approval + optimistic overlay + delayed GC
8. settings 与 governance lease 联动
9. right panel projection
10. Soul richer projection + global scope guard
11. drift / gate 命令
12. 设计工地收编

---

## 14. Codex 任务切分建议

1. 建立前端 store 类型和最小 slices
2. 建立 core HTTP client 和 event client
3. 建立 pending command manager / ack overlay manager / core session guard
4. 建立 template registry adapter
5. 建立 snapshot bootstrap
6. 接左栏 workspace/run 列表
7. 接 createRunDraftsByWorkspace 与 createRun command
8. 接 timeline 列表与 threaded timeline 数据结构
9. 接 ToolExecution / Approval cards
10. 接 settings 与 governance lease 联动
11. 接 drift / governance 最小字段显示
12. 接 Soul richer projection schema 与 global scope guard
13. 接右栏 inspector tabs
14. 完成 SVG / HTML / token 迁移与临时 UI 目录清理

---

## 15. 一句话结论

这个状态模型的核心不是“把所有东西都塞进一个 store”，而是：

- Hot State 负责控制区
- Projection 负责富视图
- Pending Command 负责竞态、断线与失败回滚
- Ack Overlay 负责防闪回与乐观渲染
- UI Local 负责前端局部交互
- Create Run draft 必须按 workspace 隔离
- Settings 必须响应治理租约
- Global Memory 编辑必须有爆炸半径防护
- Workflow 模板变化要尽量收敛在 registry / schema adapter 层
- 临时 UI 设计源必须被收编进正式 `packages/app`

只要这十层边界不混，你后续继续迭代，即使 Workflow 模板系统调整，前端影响也大多能控制在 contract、create-run form 和少数 feature slice 上，而不至于整站返工。

