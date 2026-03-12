# do-what v0.1 实际架构说明（as-built）

本文档描述当前仓库代码体现出的实际架构，而不是 archive 文档中的理想拓扑。

## 1. 当前实际 runtime topology

当前代码呈现出的运行拓扑是：

```text
Electron main/preload/renderer
  -> 通过 HTTP snapshot / command routes 访问 Core
  -> 通过 SSE 订阅 Core 事件流

Core daemon（Node + Fastify）
  -> state.db（event_log / runs / workspaces / approvals / governance）
  -> HotStateManager
  -> UiQueryService / UiCommandService
  -> worktree lifecycle / integrator / policy engine
  -> 进程内挂载 Soul dispatcher

Soul subsystem
  -> soul.db
  -> memory_repo Git 仓
  -> search / pointer / evidence / proposal / review / compiler

Claude/Codex adapters
  -> 作为独立包存在
  -> 当前未看到在 Core 启动流程中被直接拉起
```

这意味着：

- Core 是当前仓库里真正的状态与 API 中心。
- Soul 不是独立 daemon，而是在 Core 进程内通过 dispatcher 被装配，但使用单独的 `soul.db` 和 `memory_repo`。
- UI 既有真实 HTTP/SSE 客户端，也有 mock 适配器；默认选择 mock。
- 引擎适配器已经是独立模块，但当前默认运行拓扑不等于“启动 Core 后自动带起真实 Claude/Codex 进程”。

## 2. 模块边界

### 2.1 App

`packages/app` 的职责是：

- 提供 Electron 壳和 renderer 路由。
- 管理本地展示态、交互态、乐观消息 tail、ack overlay。
- 消费 Core 的 query 与 event stream。
- 把用户动作封装成 `CoreCommandRequest` 并发送给 Core。

它不持有系统真相源。当前代码里真正持久状态都不在 App 内。

对应代码：

- `packages/app/src/lib/runtime/app-services.ts`
- `packages/app/src/stores/*`
- `packages/app/src/pages/workbench/workbench-page-content.tsx`
- `packages/app/src/pages/settings/settings-page-content.tsx`

### 2.2 Core

`packages/core` 的职责是：

- 持有运行时状态、HTTP/SSE 面、事件写入、查询聚合、命令处理。
- 用 `state.db` 维护 run / workspace / approval / governance 等主数据。
- 通过 `EventBus` 写入 `event_log` 并向 HotState、SSE、projection 异步分发。
- 管理 worktree 生命周期和 integration 相关逻辑。
- 装配 Soul dispatcher，并把部分 Soul 能力暴露到 HTTP 路由。

对应代码：

- `packages/core/src/server/http.ts`
- `packages/core/src/eventbus/event-bus.ts`
- `packages/core/src/state/hot-state-manager.ts`
- `packages/core/src/server/ui-query-service.ts`
- `packages/core/src/server/ui-command-service.ts`
- `packages/core/src/run/worktree-lifecycle.ts`

### 2.3 Protocol

`packages/protocol` 是共享类型与 schema 真相源：

- UI contract
- 事件 schema
- governance / focus surface / baseline lock / drift / topology
- Soul cue / claim / evidence / user decision
- MCP tools schema

对应代码：

- `packages/protocol/src/core/*`
- `packages/protocol/src/events/*`
- `packages/protocol/src/soul/*`
- `packages/protocol/src/mcp/*`

### 2.4 Soul

`packages/soul` 的职责是：

- 维护 `soul.db`
- 管理 cue / evidence / graph / proposal / claim / ledger / budget
- 提供 memory search、pointer open、graph exploration、proposal/review
- 维护 `memory_repo` 作为 Git 版本化记忆仓

对应代码：

- `packages/soul/src/mcp/dispatcher.ts`
- `packages/soul/src/db/schema.ts`
- `packages/soul/src/repo/memory-repo-manager.ts`
- `packages/soul/src/search/*`
- `packages/soul/src/pointer/*`

### 2.5 Engine adapters

`packages/engines/claude` 和 `packages/engines/codex` 的职责是：

- 适配外部引擎协议
- 归一化事件
- 处理审批事件
- 对外暴露 adapter / process manager / forwarder

但在当前代码中，它们尚未在 Core 的默认启动链路中接通。

## 3. 数据流、事件流、状态流

### 3.1 Core 事件流

当前实际事件流大致是：

1. Core 命令面或内部入口生成事件。
2. `EventBus.publish()` 为事件分配 revision，并异步写入 `state.db.event_log`。
3. 进程内监听器收到事件：
   - `HotStateManager` 更新控制态
   - `SseManager` 广播给 UI
   - `ProjectionManager` 失效部分投影缓存

对应代码：

- `packages/core/src/eventbus/event-bus.ts`
- `packages/core/src/event-handler/sync-path.ts`
- `packages/core/src/event-handler/async-path.ts`
- `packages/core/src/server/sse.ts`

### 3.2 UI 状态流

UI 启动时的状态流：

1. `CoreServicesBootstrap` 先拉取 `WorkbenchSnapshot`。
2. `startAppStoreRuntime()` 用 snapshot 初始化多个 store。
3. Event client 打开 `/api/events/stream`。
4. 后续事件经 `NormalizedEventBus` 分发到 HotState / Projection / Pending / AckOverlay runtime。

当前 store 分层是实际存在的：

- `hot-state`：连接状态、workspace/run/approval 概览、健康态
- `projection`：timeline、inspector、soul 面板等投影
- `pending-command`：本地乐观消息与命令状态
- `ack-overlay`：命令 ack 生命周期与 reconciling/desynced
- `settings-bridge`：settings lease 打断与脏表单桥接
- `ui`：页面、选中项、modal、draft

对应代码：

- `packages/app/src/app/core-services-bootstrap.tsx`
- `packages/app/src/stores/app-store-runtime.ts`
- `packages/app/src/stores/hot-state/*`
- `packages/app/src/stores/projection/*`
- `packages/app/src/stores/pending-command/*`
- `packages/app/src/stores/ack-overlay/*`

### 3.3 命令流与 ack overlay

当前命令流是：

1. UI 调用 `dispatchCoreCommand()`
2. HTTP 适配器把抽象命令映射到具体 REST 路由
3. Core 创建 ack，执行对应命令
4. UI 本地进入 optimistic / acked / reconciling / desynced / settled
5. 对 approval、memory、settings、workbench 等会通过 probe 或 refetch 做二次确认

这说明 ack overlay 不是文档概念，而是实际代码中的 UI 机制。

对应代码：

- `packages/app/src/lib/commands/app-command-actions.ts`
- `packages/app/src/lib/core-http-client/http-core-api-adapter.ts`
- `packages/core/src/server/ui-command-service.ts`
- `packages/app/src/lib/reconciliation/ack-overlay-reconciliation.ts`

## 4. 术语与代码中的真实映射

### 4.1 Core 作为单一真相源

这个概念在代码里有明显落点：

- `state.db` 持有 `runs`、`workspaces`、`approval_queue`、`governance_leases`、`event_log`
- App 只消费 snapshot 与 SSE，不自己持久化核心状态

但需补一句现实限制：

- UI 默认 transport 是 `mock`，所以“Core 是唯一控制面”只在 HTTP 模式下成立；默认开发体验并不是直接围绕真实 Core。

### 4.2 HotState

`HotState` 已真实落地：

- Core 侧 `HotStateManager`
- Protocol 侧 `CoreHotState` schema
- UI 侧 `hot-state-store`

它用于控制态而不是细节历史。

### 4.3 Projection

`Projection` 已真实落地，但当前作用更偏查询/视图层：

- Core 侧有 `ProjectionManager`
- UI 侧有 `projection-store`
- timeline、inspector、soul panel 都从 projection store 或 query surface 派生

需要避免的误写：

- 当前仓库没有看到一个独立的“Archive runtime layer”与 Projection 并列落地。
- `docs/archive/` 是历史文档目录，不是运行时 Archive 子系统。

### 4.4 EventLog

`EventLog` 已真实落地：

- 表：`event_log`
- 入口：`EventBus.publish()`
- UI timeline/inspector 查询会读取事件与 run metadata

### 4.5 Ack overlay

`ack overlay` 已真实落地：

- Core 侧 `AckTracker`
- Protocol 侧 ack schema / SSE cause
- UI 侧 `ack-overlay-store` 与 reconciliation

状态机上至少存在：

- pending
- committed
- failed
- reconciling
- desynced
- settled

### 4.6 Focus surface / baseline lock / governance lease / integration gate

这些概念在当前仓库中都不是空词：

- Protocol 侧有 schema
- Core 侧有对应模块、SQLite 表或测试
- Inspector 会展示部分 governance 信息

但现实边界是：

- 它们更多落地在后端治理逻辑、投影和测试中
- UI 上的部分决策按钮目前没有对应的真实可写路径

因此应表述为：

- “治理语义和后端模块已实现，前端可写闭环部分实现”

### 4.7 Soul / 记忆 / memory_repo

这部分已经超出纯概念层：

- `soul.db` 是独立数据库
- `memory_repo` 是独立 Git 仓
- proposal / review / search / pointer open / healing 都有实际代码和测试

当前更贴近代码的表述是：

- `soul.db` 承担查询、检索、proposal、ledger、pointer 等主运行数据职责。
- `memory_repo` 承担 Git 版本化的记忆持久化职责。
- 当前 UI 和 Core 查询面主要依赖 SQLite / projection，而不是直接读取 `memory_repo`。

但需要避免夸大：

- UI 对既有 memory 的直接治理动作尚未全部接通真实写路径
- 当前默认 App 也不会自动把用户带入真实 Core + Soul 运行链路

### 4.8 Settings lease

UI 的 settings lease 打断逻辑存在，Core 也会返回 lease snapshot。

但当前 `SettingsStore` 是进程内快照，不是磁盘持久化配置系统。写入 settings 目前只更新内存 sections。

## 5. 与 v0.1 历史目标相比的落地情况

基于当前代码，可做如下保守判断：

- Core daemon、协议层、SQLite、事件总线、HotState、UI query surface、Soul 子系统、worktree/integration 基建均已落地。
- UI 不是纯 demo，已经具备工作台、timeline、inspector、settings、真实 Core 集成测试。
- 但“默认产品闭环”仍不完整：
  - App 默认 mock
  - 引擎适配器未在 Core 默认运行时接线
  - 若干治理/记忆修改命令是 failure/desynced 路径
  - settings 不是持久化配置中心

因此，当前更准确的描述是：

- 这是一个已经具备多子系统真实实现和测试的 v0.1 仓库
- 但默认运行体验和若干可写工作流仍停留在“部分闭环”阶段
