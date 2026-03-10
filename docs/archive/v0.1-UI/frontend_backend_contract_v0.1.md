# do-what 前后端对齐文档

> 状态：Draft for Codex implementation
>
> 说明：本文件中的接口名、事件名、字段名、错误码、路由路径，**都属于建议命名**。当前 Core / App 的真实实现可能与本文存在命名差异；落地时应以实际代码为准做映射，但**不得改变本文定义的职责边界、状态来源与事件流原则**。
>
> 额外说明：当前项目目录下存在一个用于存放 UI 参考 HTML、SVG、样式草稿的独立文件夹。该文件夹仅作为**临时设计源**，不属于最终运行时结构。Codex 在实现过程中必须把最终采用的视觉资产、SVG 与页面结构迁移到 `packages/app` 内部，并在迁移完成后移除该临时 UI 设计源，避免形成双份前端真相源。

---

## 0. 文档目的

本文件只回答八件事：

1. 前端应该从后端读什么。
2. 前端应该向后端发什么命令。
3. 哪些信息属于同步快照，哪些属于事件流增量。
4. 哪些界面块读取 CoreHotState，哪些读取 Projection，哪些只是本地 UI 状态。
5. Pending Command + Ack Overlay 如何避免竞态、悬挂、Core 重启后的状态黑洞，以及乐观渲染失忆症。
6. v0.1.x 中的 Focus Surface、Integration Gate、Governance Lease、SOUL 结构化记忆，如何在前端拥有稳定落脚点。
7. Settings 如何响应治理租约，离线时如何进入系统级冻结态。
8. Workflow 模板系统未来演化时，如何把前端改动控制在可接受范围内。

本文件**不是**视觉设计文档，也不是数据库设计文档。

---

## 1. 基础原则

### 1.1 唯一真相源
前端不是业务真相源。

- Core 是唯一真相源。
- 前端只做：读取快照、订阅事件、发送命令、维护本地 UI 状态。
- 前端不得自行推断关键控制态，更不得把 Projection 误当成控制态来源。

### 1.2 两条读取路径
前端读取后端分为两条路径：

1. **HTTP Snapshot / Query**
   - 用于首屏初始化
   - 用于设置页、环境页、策略页、Soul 页的静态配置读取
   - 用于 Projection 类视图的按需查询
   - 用于模板描述符、受治理锁定字段等静态/半静态信息

2. **SSE Event Stream**
   - 用于工作台运行中的增量状态推进
   - 用于 Run / Node / Approval / ToolExecution / EngineOutput / Governance / Health 等动态变化

### 1.3 命令式写入
前端所有写操作都视为 command：

- 创建 Run
- 发送用户输入
- 审批工具调用
- 接受 / 拒绝 / 编辑 / supersede / pin 记忆
- 切换策略
- 触发健康检查
- 取消 Run / 重试 Run
- Checkpoint / Governance 相关决策
- Drift / Integration Gate 相关干预

前端发命令后，不直接写业务状态；等待 Core 返回 command ack、event 或失败结果再推进 UI。

### 1.4 控制态与派生态分离
- 控制态：Run 当前状态、Node 当前状态、待审批数、Engine/Core/Soul 健康态、当前工作流节点、drift 状态、lease 状态。
- 派生态：已修改文件、计划、历史、Git 协作、Node thread、Soul 列表、图探索、治理报告、checkpoint 记录。
- 本地 UI 态：右栏是否展开、当前 tab、选中哪个 run、输入框草稿、浮层开关。

### 1.5 临时 UI 设计源迁移原则
当前项目目录下用于存放 UI 参考 HTML、SVG、样式草稿的独立文件夹，仅作为过渡期设计源，不属于最终运行时结构。

Codex 在实现阶段必须：
- 将最终采用的页面结构翻译为 `packages/app` 内的真实 React / Electron 页面与组件。
- 将确认采用的 SVG 迁移到 `packages/app/src/assets` 或 `packages/app/src/components/icons`。
- 将样式变量、token 与主题规则并入正式样式体系。
- 清理重复资产与无运行时用途的参考稿。
- 迁移完成后删除该独立 UI 设计源文件夹。

当前阶段**不要额外引入长期维护的独立 `packages/ui` 包**，除非已经确定存在明确的多前端复用需求。

### 1.6 Workflow 模板演化兼容原则
Workflow 模板系统未来存在演化可能，因此前端不得把模板系统硬编码成不可扩展的死枚举乐园。

最低要求：
- 前端 UI 可以有“当前已知模板”的默认展示，但底层 contract 必须保留可扩展结构。
- 模板选择器优先消费后端提供的 `TemplateDescriptor[]` 或等价描述对象，而不是把模板逻辑复制到前端。
- Create Run 表单只负责收集模板参数与用户选择，不负责推导最终 DAG。
- 模板新增、字段增减，理想情况下应主要影响 `template registry / descriptor mapping / create run form schema`，而不是影响整个工作台架构。

---

## 2. 传输层约定

## 2.1 本地 API 鉴权
建议：

- 所有 HTTP / SSE 请求都携带 `Authorization: Bearer <core_session_token>`。
- token 由 Electron / App shell 从本地安全位置读取。
- 前端不缓存到 localStorage。

## 2.2 协议格式
建议统一：

- 请求体：JSON
- 响应体：JSON
- 时间：ISO string
- revision：单调递增整数或字符串序号
- id：UUID / cuid / snowflake 任选，但必须全局唯一
- 所有 command 都可携带前端生成的 `clientCommandId`
- 所有 snapshot / health 返回都建议携带 `coreSessionId`，用于识别 Core 生命周期切换

## 2.3 通用响应包装
建议不要做过厚包装。

### 成功响应
```json
{
  "ok": true,
  "data": {}
}
```

### 错误响应
```json
{
  "ok": false,
  "error": {
    "code": "RUN_NOT_FOUND",
    "message": "Run not found",
    "details": {}
  }
}
```

## 2.4 SSE 事件包装
```json
{
  "revision": 1024,
  "coreSessionId": "core_sess_20260310_1",
  "event": {
    "type": "ToolExecutionRequested",
    "timestamp": "2026-03-10T09:12:00.000Z",
    "runId": "run_xxx",
    "source": "core",
    "causedBy": {
      "clientCommandId": "cmd_xxx",
      "ackId": "ack_xxx"
    },
    "payload": {}
  }
}
```

`causedBy` 允许为空；但对于由前端 command 直接触发的关键状态变更，建议尽量回填。

---

## 3. 前端页面与读取源映射

## 3.1 工作台 /workbench

### 左栏
- workspace tree
- workspace 下的 run list
- run 简要状态点
- 新建 Run 入口
- 底部 Engine / Core / Soul 状态
- 全局离线 / 冻结态提示

读取源：
- 首屏：`GET /api/workbench/snapshot`
- 增量：`GET /api/events/stream?sinceRevision=...`

补充规则：
- `/api/events/stream` 是工作台级全局事件流，允许同时吐出多个 workspace / run 的事件。
- 但前端**不得**因此为所有 run 常驻挂载细粒度 projection。
- 只有当前 active projection 对应的 run，才允许把细粒度事件 merge 进 timeline / inspector。
- 非活跃 run 只允许更新左栏与控制区所需的 hot summary（例如 run 状态、waiting reason、lastEventAt、审批数量变化）。

### 中栏
- 用户消息
- 引擎输出
- code / excerpt / result block
- tool cards
- approval cards
- memory proposal cards（后续）
- 输入框（允许本地草稿，但离线时禁止发送）
- 并行节点 thread / lane 视图

读取源：
- 首屏：`GET /api/runs/:runId/timeline`
- 增量：SSE
- 发送输入：`POST /api/runs/:runId/messages`

### 右栏
- 已修改文件
- 计划
- Git / 协作
- 历史
- 概览
- Governance / Checkpoint / Drift 诊断
- Soul 侧视图

读取源：
- 首屏：`GET /api/runs/:runId/inspector`
- 增量：SSE + 按需 HTTP 查询
- 默认视为 Projection 读模型

## 3.2 设置页 /settings

### 引擎
- 引擎连接模式
- 健康检查
- 检测时间
- 是否被租约接管

### Soul
- 计算提供方
- budget
- checkpoint
- memory_repo 路径
- soul.db 路径
- 是否被租约接管

### 策略
- 工具审批规则
- 自动批准模式
- 是否被租约接管

### 环境
- 工具链健康
- worktree 配置

### 外观
- 主题
- 动画
- 字体

读取源：
- HTTP snapshot / patch 为主
- 同时监听 `GovernanceLeaseUpdated` 进行 query invalidation
- 被租约接管的项应转为只读

---

## 4. 核心 HTTP 接口建议

> 注意：以下路径与命名可按实际 Core 实现调整。关键是职责分层，不是字面名称。

## 4.1 工作台初始化

### GET /api/workbench/snapshot

用途：
- 初始化左栏、底部状态、当前 revision、待审批摘要
- 初始化当前租约 / 漂移 / checkpoint 摘要
- 初始化当前 Core 生命周期标识

返回建议：
```json
{
  "ok": true,
  "data": {
    "coreSessionId": "core_sess_20260310_1",
    "revision": 1200,
    "currentWorkspaceId": "ws_1",
    "workspaces": [],
    "runs": [],
    "nodes": [],
    "health": {
      "engine": "running",
      "core": "healthy",
      "soul": "active"
    },
    "pendingApprovals": [],
    "governance": {
      "leaseStatus": "active",
      "currentLeaseId": "lease_1",
      "hasConflicts": false
    },
    "templateRegistry": []
  }
}
```

`templateRegistry` 可为空，但建议存在，用于承载未来模板系统演化。

## 4.2 模板注册表

### GET /api/workflows/templates

用途：
- 获取 Create Run 弹窗可用模板的描述符
- 降低前端对模板系统的硬编码程度

返回建议：
```json
{
  "ok": true,
  "data": {
    "templates": [
      {
        "templateType": "single_engine",
        "title": "单引擎执行",
        "description": "由单个引擎完成完整任务",
        "supportsParticipants": true,
        "fields": [
          {
            "name": "approvalPolicy",
            "type": "enum",
            "required": false,
            "options": ["standard", "strict"]
          }
        ]
      }
    ]
  }
}
```

## 4.3 单个 Run 的初始时间线
### GET /api/runs/:runId/timeline?beforeRevision=...&limit=...

用途：
- 打开某个 run 时加载已有事件时间线
- 支持 merged timeline 与 node threads 双视图
- 支持“默认只取最新一页、向上按 revision 翻历史”的分页模型
- 避免长时间运行的 run 在首屏一次性回传几千条事件把前端噎住

查询参数建议：
- `beforeRevision?: number | string`
  - 不传：返回最新一页
  - 传入：返回该 revision 之前的一页历史
- `limit?: number`
  - 建议默认 50
  - 建议上限 100，避免前端和 Core 同时长蘑菇

返回建议：
```json
{
  "ok": true,
  "data": {
    "runId": "run_1",
    "mergedTimeline": [],
    "nodeThreads": {},
    "laneOrder": [],
    "integrationMoments": [],
    "handoffMoments": [],
    "blockedMoments": [],
    "hasMoreBefore": true,
    "nextBeforeRevision": 1180,
    "loadedRange": {
      "oldestRevision": 1181,
      "newestRevision": 1230
    }
  }
}
```

补充规则：
- SSE 只负责“新事件推进、已有条目状态更新、局部追加”。
- 历史翻页必须走 HTTP，不允许依赖 SSE 回补历史。
- 首屏不得默认回传整个 run 的全量历史。

## 4.4 单个 Run 的右栏数据
### GET /api/runs/:runId/inspector

用途：
- 初始化右栏 Projection 数据
- 作为 Ack Overlay 进入 `reconciling` 后的 run 级局部 refetch 入口之一
- 在 SSE 丢包、前端需要追平 Projection 时，允许显式复拉当前 run 的 inspector 读模型

返回建议：
```json
{
  "ok": true,
  "data": {
    "runId": "run_1",
    "changedFiles": [],
    "plan": [],
    "collaboration": {
      "mode": "lead_review",
      "participants": []
    },
    "historySummary": [],
    "driftDiagnostics": {
      "softStaleNodes": [],
      "hardStaleNodes": []
    },
    "governancePanel": {
      "leaseStatus": "active",
      "nativeSurfaceReport": {
        "status": "aligned",
        "items": []
      }
    },
    "checkpointPanel": {
      "pending": [],
      "recent": []
    },
    "updatedAt": "2026-03-10T09:00:00.000Z"
  }
}
```

补充规则：
- inspector 接口必须是幂等可重拉的，不得依赖前端“这次一定会先收到 SSE”。
- 若未来存在更细的 entity detail 接口（如 memory detail / approval detail），前端在 `reconciling` 时可优先走更小粒度 refetch；没有时至少必须能重拉 run inspector。

## 4.4A 对象级协调探针接口（Reconciliation Probe APIs）
当某个对象型命令进入 `reconciling` 或 `desynced` 时，前端不能靠“猜测这个对象大概在哪个 run 里”来复拉。

必须至少提供以下最小粒度探针接口：

### GET /api/memory/:memoryId

用途：
- 精确核对单条 Memory 的当前真相
- 供 `reconciling` 阶段和 `Retry Sync` 动作使用
- 适用于 `project | global-core | global-domain`，不依赖当前 selected run

返回建议：
```json
{
  "ok": true,
  "data": {
    "memoryId": "mem_1",
    "scope": "global-domain",
    "dimension": "coding_style",
    "manifestationState": "materialized",
    "retentionState": "canon",
    "claimSummary": "使用 TypeScript",
    "slotStatus": "bound",
    "updatedAt": "2026-03-10T09:00:00.000Z",
    "revision": 1210
  }
}
```

### GET /api/approvals/:approvalId

用途：
- 精确核对单张 Approval Card 当前状态
- 供 `reconciling` 阶段和 `Retry Sync` 动作使用
- 避免为了验证一张审批卡重拉整条 run timeline

返回建议：
```json
{
  "ok": true,
  "data": {
    "approvalId": "approval_1",
    "runId": "run_1",
    "status": "approved",
    "decision": "allow_once",
    "toolName": "shell_exec",
    "summary": "运行 pnpm test",
    "updatedAt": "2026-03-10T09:00:00.000Z",
    "revision": 1211
  }
}
```

补充规则：
- 对象型命令一旦进入 `reconciling`，前端必须优先调用对应对象的探针接口。
- 只有在该对象**没有** detail probe API 时，才允许回退到 run 级 `inspector` / `timeline` refetch。
- `memory detail` 与 `approval detail` 在 v1.5 中应视为必需，不再是“未来可选”。

## 4.5 新建 Run

### POST /api/runs

用途：
- 从“新建 Run”弹窗实例化工作流模板

请求建议：
```json
{
  "clientCommandId": "cmd_create_run_1",
  "workspaceId": "ws_1",
  "taskPrompt": "开始一个新的 UI 收口 Run",
  "templateType": "single_engine",
  "templateVersion": 1,
  "templateInputs": {
    "approvalPolicy": "standard",
    "soulPolicy": "current_run_only"
  },
  "participants": [
    {
      "engine": "claude",
      "role": "lead"
    }
  ],
  "selfOrchestration": false,
  "focusSurfaceHint": {
    "pathGlobs": ["packages/app/**"]
  }
}
```

> 说明：这里保留 `templateInputs`，就是为了减小未来模板系统演化对前端的爆破半径。模板 UI 可变，但 transport 先收成“模板标识 + 参数字典”的样子。

## 4.6 发送用户输入

### POST /api/runs/:runId/messages

请求建议：
```json
{
  "clientCommandId": "cmd_msg_1",
  "text": "继续补充当前 Run 的要求",
  "attachments": []
}
```

## 4.7 工具审批

### POST /api/approvals/:approvalId/decide

请求建议：
```json
{
  "clientCommandId": "cmd_approval_1",
  "decision": "allow_once"
}
```

## 4.8 记忆 proposal 审阅

### POST /api/memory/proposals/:proposalId/review

请求建议：
```json
{
  "clientCommandId": "cmd_memory_review_1",
  "decision": "accept"
}
```

## 4.9 记忆治理命令

### POST /api/memory/:memoryId/pin

### POST /api/memory/:memoryId/supersede

### POST /api/memory/:memoryId/edit

#### 全局记忆治理危险边界
对于 `scope = global-core | global-domain` 的记忆，前端在发出 `edit / supersede` 前必须进行 UI 侧强确认，并应支持以下两种意图之一：

1. 直接修改原全局记忆
2. 在当前项目创建 override / shadow memory

建议请求体支持：
```json
{
  "clientCommandId": "cmd_supersede_memory_1",
  "targetScope": "same_scope"
}
```

或：
```json
{
  "clientCommandId": "cmd_supersede_memory_1",
  "targetScope": "project_override",
  "workspaceId": "ws_1"
}
```

## 4.10 Drift / Integration Gate 干预命令

### POST /api/nodes/:nodeId/resolve-drift

### POST /api/runs/:runId/integration-gate/decide

## 4.11 设置页接口

### GET /api/settings/engines
### PATCH /api/settings/engines

### GET /api/settings/soul
### PATCH /api/settings/soul

### GET /api/settings/policies
### PATCH /api/settings/policies

### GET /api/settings/environment
### POST /api/settings/environment/recheck

### GET /api/settings/appearance
### PATCH /api/settings/appearance

设置页 snapshot 建议补充：
```json
{
  "governedByLease": {
    "leaseId": "lease_1",
    "lockedFields": ["engines.claude.mode", "soul.policy.currentRunOnly"]
  }
}
```

---

## 5. SSE 事件模型建议

## 5.1 连接与系统事件
- `SystemHealthUpdated`
- `EngineConnected`
- `EngineDisconnected`
- `ProjectionLagUpdated`
- `CoreSessionChanged`

## 5.2 Run 生命周期
- `RunCreated`
- `RunStarted`
- `RunWaiting`
- `RunCompleted`
- `RunFailed`
- `RunCancelled`
- `RunInterrupted`

## 5.3 Node 生命周期
- `NodeActivated`
- `NodeCompleted`
- `NodeFailed`
- `NodeStale`
- `NodeDriftUpdated`
- `IntegrationGateUpdated`

## 5.4 消息 / 输出
- `UserMessageCreated`
- `EngineMessageCreated`
- `EngineOutputChunk`
- `ResultBlockCreated`
- `ExcerptShared`

## 5.5 ToolExecution
- `ToolExecutionRequested`
- `ToolExecutionApproved`
- `ToolExecutionDenied`
- `ToolExecutionStarted`
- `ToolExecutionCompleted`
- `ToolExecutionFailed`

## 5.6 Governance / Checkpoint
- `GovernanceLeaseUpdated`
- `NativeSurfaceReportUpdated`
- `CheckpointCreated`
- `CheckpointReviewed`

## 5.7 Memory
- `MemoryProposalCreated`
- `MemoryProposalReviewed`
- `MemoryCommitted`
- `MemoryPinned`
- `MemorySuperseded`
- `MemoryEdited`
- `SoulStatusUpdated`
- `MemorySlotConflictUpdated`

## 5.8 Inspector / Projection
- `ChangedFilesUpdated`
- `PlanUpdated`
- `CollaborationUpdated`
- `HistoryUpdated`

---

## 5.9 全局 SSE 流与 Active Projection 截断原则
`GET /api/events/stream?sinceRevision=...` 是工作台级全局事件流。

这意味着：
- 后端可以持续推送属于其它 workspace / 非当前 run 的事件
- 前端不能因此把所有 run 的细粒度 timeline / inspector 常驻挂在内存里

前端必须遵守以下截断原则：
- 只有 `event.runId` 命中当前 active projection run 时，才允许 merge 以下细粒度事件：
  - `EngineOutputChunk`
  - `ChangedFilesUpdated`
  - `PlanUpdated`
  - `HistoryUpdated`
  - 其它会持续膨胀 timeline / inspector 的事件
- 对于非活跃 run，前端只更新 hot summary：
  - run status
  - waiting reason
  - lastEventAt / updatedAt
  - 审批数量、阻塞状态等轻摘要
- 当用户切换到该 run 时，前端再通过 HTTP 拉取：
  - `GET /api/runs/:runId/timeline?beforeRevision=...&limit=...`
  - `GET /api/runs/:runId/inspector`

这条规则的目标不是省几次 merge，而是防止“后台 run 的 token 流把前端投影树喂成一头内存怪兽”。

---

## 6. Pending Command + Ack Overlay 约定

## 6.1 为什么不能只靠 revision
仅依赖 “当 SSE / Projection revision >= ack.revision 时移除 overlay” 会出现竞态：
- SSE 先到，HTTP ack 后到。
- 前端先推进 revision，后写入 overlay。
- 若无新的相关事件，overlay 可能长期悬挂。

因此：
- **request / command ID 匹配**必须是主机制。
- **revision 追赶**只作为兜底 GC 机制。

## 6.2 前端发送 command 时必须生成 `clientCommandId`

## 6.3 AckOverlayEntry 需要支持 optimisticPayload
对象型 Ack Overlay 的目标不是“记一笔 ack”，而是让 UI 在 Projection 追平前先看到稳定的新结果。

但这里必须写死一个边界：

- `ackOverlayStore` 只服务于**对象型、可替换型** UI 单元。
- `message` **禁止**进入 Ack Overlay。
- Timeline 的乐观消息发送只从 pending command 派生，不走 K-V 覆盖模型。

建议结构：
```json
{
  "ackId": "ack_1",
  "clientCommandId": "cmd_edit_memory_1",
  "entityType": "memory",
  "entityId": "mem_1",
  "action": "edit",
  "revision": 1210,
  "status": "accepted",
  "reconcileTarget": {
    "kind": "memory_detail",
    "memoryId": "mem_1",
    "path": "/api/memory/mem_1"
  },
  "optimisticPayload": {
    "gist": "使用 TS"
  }
}
```

对于对象型场景，`optimisticPayload` 使组件可以在 Projection 追平前优先渲染：
- `edit memory` -> `{ "gist": "使用 TS" }`
- `pin memory` -> `{ "retentionState": "canon" }`
- `resolve drift` -> `{ "driftState": "resolving" }`

对于 Timeline 场景，乐观消息由 `pendingCommandStore` 提供：
- `entityType = message`
- `optimisticPayload = { text, attachments }`
- 使用 `localSequence + createdAt` 做前端尾部排序
- 在真实事件命中后再移除对应 optimistic tail

## 6.4 SSE 事件中建议包含 causedBy
```json
{
  "causedBy": {
    "clientCommandId": "cmd_approval_1",
    "ackId": "ack_1"
  }
}
```

## 6.5 前端状态机建议
每个 pending command 至少有：
- `clientCommandId`
- `status: pending | acked | failed | settled | desynced`
- `reconcileTarget`（用于告诉前端进入 `reconciling/desynced` 后到底该请求哪个 probe API）
- `entityType`
- `entityId`
- `action`
- `error?`
- `createdAt`
- `coreSessionIdAtSend`

建议状态推进：

1. 前端发 command，写入 pending 状态。
2. 若 HTTP 成功返回 ack，转为 `acked`。
3. 若该命令属于对象型场景，可生成 overlay，初始 `status = accepted`。
4. 若 SSE 收到 `causedBy.clientCommandId` 或 `causedBy.ackId` 精确命中的相关事件，立即 `settled` 并移除 overlay / optimistic tail。
5. 若仅满足 `revision >= ack.revision`，不得直接清理 overlay；应把 overlay 转为 `reconciling`，并触发一次实体级或 run 级 HTTP refetch。
6. 若 refetch 确认 Projection 已追平，再 `settled` 并移除 overlay。
7. 若 refetch 失败，或 refetch 后仍未看到预期新状态，则将该命令 / overlay 标记为 `desynced`（或等价状态），禁止静默闪回。
8. 若 HTTP / command 失败，标记 `failed`，移除 optimistic 状态，并给出错误提示。
9. 若 Core 会话切换，所有未完成命令统一失败并清理短时覆盖。

## 6.6 消除顺序
1. 前端发 command，写入 pending 状态。
2. HTTP 返回 ack，转成 `acked`。
3. 对象型命令：写入 Ack Overlay；消息型命令：只保留 pending entry，不写入 overlay。
4. 若收到 `causedBy.clientCommandId` / `causedBy.ackId` 精确命中的事件：
   - 对象型命令：移除 overlay
   - 消息型命令：移除 optimistic tail
   - pending command -> `settled`
5. 若长时间未收到精确命中，但 `revision >= ack.revision`：
   - 对象型命令进入 `reconciling`
   - 触发一次局部 HTTP refetch
6. refetch 成功并确认 Projection 追平后，`settled`
7. refetch 失败或仍不一致时，进入 `desynced` / `sync_uncertain` 告警态，而不是静默删除 overlay
8. `desynced` 不是僵尸终点；UI 必须提供明确出路：
   - `Retry Sync`：按 `reconcileTarget` 再次触发对象级或 run 级 refetch
   - `Dismiss / Rollback`：本地放弃该 overlay / optimistic tail，界面退回当前 Projection，但**不得**向 Core 发送额外命令
8. 任意阶段若 Core 生命周期切换，则统一失败并清理

## 6.7 延迟协调 GC
`revision >= ack.revision` 不得再被定义为“静默删除 overlay”的条件。

原因很朴素，也很阴险：
- revision 只能证明“系统向前推进了”
- 不能证明“与你这次命令对应的那条事件，一定已经到达前端”

如果 SSE 在本地网络栈、代理、缓冲区中直接丢失，前端会遇到最恶心的场景：
- HTTP ack 成功
- UI 先看到乐观新值
- 定时器到点后把 overlay 删了
- Projection 因为没追平而回退成旧值
- 用户误以为操作失败，又来一刀

因此这节必须改成**延迟协调 GC**：

- 只有精确命中 `clientCommandId` / `ackId` 才允许立即移除 overlay。
- 若仅满足 `revision >= ack.revision`，应启动一个短延时定时器（建议 1000–2000ms）。
- 定时器触发后，不是“直接删 overlay”，而是：
  1. 将 overlay 状态切到 `reconciling`
  2. 触发一次局部 HTTP refetch（优先 entity detail，其次 run inspector / timeline）
  3. 用 refetch 结果确认 Projection 是否追平
- 只有 refetch 已证实真实新状态可见，才允许移除 overlay。
- 若 refetch 失败，或 refetch 结果仍旧不一致：
  - 不得静默闪回
  - 必须显示“状态已提交，但界面同步异常”的提示
  - 允许继续自动重试，或提供手动刷新入口

一句人话：兜底 GC 不是清洁阿姨，它是协调员。

## 6.7A `desynced` 的用户自愈路径
当命令或 overlay 进入 `desynced` 时，前端必须把它视为**需要处理的同步异常**，而不是永远挂在界面上的僵尸牌位。

必须提供两个动作：

1. `Retry Sync`
   - 优先按 `reconcileTarget` 调用对象级 probe API（如 `/api/memory/:memoryId`、`/api/approvals/:approvalId`）
   - 若无对象 probe，再回退到 `run inspector / timeline`
   - 成功确认 Projection 追平后，清理 overlay / optimistic tail，并将命令转为 `settled`

2. `Dismiss / Rollback`
   - 这是**纯前端本地动作**，不得再向 Core 发 command
   - 立即销毁本地 overlay / optimistic tail
   - UI 退回到当前 Projection / hot state 所表示的状态
   - 可将该命令记录为 `failed(code = COMMAND_DESYNC_DISMISSED)` 后进入清理队列

补充要求：
- `desynced` 卡片必须显示“最后一次同步尝试时间”和“下一步可执行动作”。
- 不允许只写一句“同步异常”然后把用户晾在那里。

---

## 6.8 Core 崩溃 / 重启时的处理
Pending Command 与 Ack Overlay **不得跨越 Core 生命周期存活**。

一旦出现以下任一情况：
- SSE 断开且确认 Core 不可用。
- `SystemHealthUpdated` 显示 core -> offline / rebooting。
- 新 snapshot / 新 SSE 流中的 `coreSessionId` 与旧值不同。

前端必须：
- 将所有 `pending` / `acked` 的 command 标记为 `failed: connection_lost`。
- 卸载这些 command 对应的 ack overlay。
- 重新拉取最新 snapshot，重建状态。

## 6.9 适用动作
- 创建 Run
- 审批 allow / reject
- Accept / Reject / Pin / Supersede / Edit memory
- Resolve Drift / Integration Gate 决策
- 关键策略切换（可选）

补充边界：
- `message` 命令仍然走 pending command 跟踪，但**不进入 Ack Overlay**。
- Timeline 的乐观追加属于“列表尾部临时拼接”，不是“对象覆盖”。

## 7. 离线 / 断线时的全局冻结态

当前端与 Core 失去连接时，不应继续让用户热情点击一堆注定失败的 command 按钮。

### 7.1 全局冻结规则
当以下任一条件成立时：
- `connectionState = disconnected | reconnecting`
- `health.core !== healthy`

前端必须进入“系统冻结态”。

### 7.2 冻结态下的交互规则
应禁用：
- 新建 Run
- 所有 Approval / Reject 按钮
- Memory Pin / Edit / Supersede 按钮
- Drift / Integration Gate 处置按钮
- 所有真正会发 command 的动作

允许：
- 浏览现有数据
- 切换 tab
- 输入框继续保留草稿输入

但发送动作必须禁用，并显示如：
`当前 Core 离线，草稿仅保存在本地。`

---

## 8. Timeline 与并行节点表达
由于 v0.1.x 支持单层并发、受控 fan-out / fan-in，前端必须同时支持：
- `mergedTimeline`
- `nodeThreads`

且保留：
- `laneOrder`
- `integrationMoments`
- `handoffMoments`
- `blockedMoments`

同时必须写死 Timeline 的乐观渲染规则：

1. Timeline 不是普通对象详情页，不能拿 `ackOverlayStore` 直接做 K-V 覆盖。
2. 对于 `send message`：
   - 前端在 `pendingCommandStore` 中写入 `entityType = message`
   - 附带 `runId`、`optimisticPayload`、`localSequence`
   - 在 `RunTimelinePane` 中按 `localSequence -> createdAt` 排序，作为 optimistic tail 追加在末尾
3. optimistic tail 需要明确视觉态：
   - `pending` -> “发送中”
   - `acked` 但未命中真实事件 -> “已送达，等待同步”
   - `desynced/sync_uncertain` -> “同步异常”
4. 一旦收到精确命中的真实事件，立即移除对应 optimistic tail。
5. 历史翻页与 optimistic tail 必须分层处理：
   - 向上加载历史只影响 timeline 头部
   - 本地乐观消息只挂在 timeline 尾部
   - 不允许因为翻页或无关 revision 推进而打乱尾部消息顺序

## 9. Drift / Governance / Checkpoint 前端落脚点

前端不能只显示异常而不能处置。至少需要：
- Resolve Drift command
- Integration Gate 决策 command
- Memory Pin / Supersede / Edit command

---

## 10. SOUL 前端契约建议

SOUL 不应只投影为普通文本列表。

并且对于 `scope = global-core | global-domain` 的记忆治理，前端必须做**爆炸半径提示与 Scope 拦截**。

最低要求：
- 编辑 / supersede 全局记忆前弹强确认
- 提供“仅在当前项目创建覆盖（project override）”选项
- UI 明确提示这将影响所有项目或某个技术域

---

## 11. Settings 与治理租约联动
设置页必须：
- 监听 `GovernanceLeaseUpdated`
- invalidate 对应 settings query
- 将被租约接管字段置为 readonly / disabled
- 显示“当前设置已被治理租约接管”

但这还不够，必须再补一条**租约打断保护**：

当以下条件同时成立时：
- 某字段当前正在本地编辑
- 表单处于 dirty 状态
- 新的 Governance Lease 突然锁住了该字段

前端不得直接把本地输入静默冲掉。必须执行：

1. 先把未提交值保存到 `interruptedDraft`（或等价本地快照）。
2. 再把字段切成 readonly / disabled。
3. 再 invalidate 并拉取服务器最新值。
4. 弹出明确提示，至少包含：
   - `leaseId`
   - 被锁住的字段
   - “你刚才的本地输入未生效，已被本地保留”

建议提供两个动作：
- 复制刚才的草稿
- 查看当前生效值 / 差异

不要搞默默抽地毯。那样用户会合理地想把显示器一起掀了。

## 12. Create Run 草稿隔离

Create Run 草稿必须按 `workspaceId` 隔离存储。

---

## 13. 错误码建议

建议保留少量稳定错误码：
- `WORKSPACE_NOT_FOUND`
- `RUN_NOT_FOUND`
- `APPROVAL_NOT_FOUND`
- `INVALID_TEMPLATE_TYPE`
- `INVALID_PARTICIPANTS`
- `ENGINE_UNAVAILABLE`
- `POLICY_DENIED`
- `INVALID_DECISION`
- `REVISION_TOO_OLD`
- `UNAUTHORIZED`
- `LEASE_CONFLICT`
- `INTEGRATION_GATE_BLOCKED`
- `COMMAND_CONNECTION_LOST`
- `GLOBAL_MEMORY_SCOPE_CONFIRM_REQUIRED`

---

## 14. 最小对接顺序

## 第 1 阶段：设置页
需完成被租约接管字段的只读态。

## 第 2 阶段：工作台空态
需记录 `coreSessionId`。

## 第 3 阶段：新建 Run
需按 workspace 隔离 draft，并支持模板注册表。

## 第 4 阶段：单个 Run 时间线
需支持 merged + threaded 双结构。

## 第 5 阶段：审批闭环
需支持 optimisticPayload、延迟兜底 GC、connection_lost 清理。

## 第 6 阶段：右栏 Projection
需接 drift / governance / checkpoint 基础摘要。

## 第 7 阶段：干预命令
需接 drift / gate / memory 治理命令。

## 第 8 阶段：SOUL 富投影
需接 scope / dimension / retention / claim / slot / global scope guard。

## 第 9 阶段：UI 设计源迁移清理
需删除独立 UI 设计源目录。

---

## 15. Codex 实施建议

为了避免 Codex 直接从页面猜协议，建议先让它做以下事情：

1. 生成 `packages/protocol/src/frontend-contract.ts`
2. 生成 `packages/app/src/lib/core-http-client.ts`
3. 生成 `packages/app/src/lib/core-event-client.ts`
4. 生成 `packages/app/src/lib/pending-command-manager.ts`
5. 生成 `packages/app/src/lib/core-session-guard.ts`
6. 生成 `packages/app/src/lib/template-registry-adapter.ts`
7. 为上述接口写 mock server / fixtures
8. 先让 workbench 用 mock data 跑通，再切真 Core
9. 明确 UI 设计源迁移任务，禁止长期并存两套前端资产

---

## 16. 一句话结论

本文件的核心不是定义“漂亮的接口名”，而是定义：

- 哪些界面块读快照
- 哪些界面块吃事件流
- 哪些动作走 command
- 哪些动作必须通过 Pending Command + Ack Overlay 防闪回
- 哪些异常状态必须有对应的治理命令
- 全局记忆修改如何防止爆炸半径失控
- 离线时界面如何进入系统冻结态
- Workflow 模板未来演化时，前端如何把影响控制在 descriptor / form schema 层
- 设计工地如何被收编进正式 `packages/app`

只要这九件事不乱，实际路由名和字段名即便有些出入，也能平稳接上当前前端。

