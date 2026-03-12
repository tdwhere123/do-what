# do-what v0.1 架构证据索引

本文档用于把关键架构结论和证据文件对齐，便于复查。

| 结论 | 状态判定 | 关键证据 | 关键符号 / 路由 / 表 |
| --- | --- | --- | --- |
| Core 是实际 HTTP/SSE 中心 | 已实现 | `packages/core/src/server/http.ts`, `packages/core/src/server/routes.ts` | `startHttpServer`, `registerRoutes` |
| Core 通过 Bearer token 保护大多数路由 | 已实现 | `packages/core/src/server/auth.ts` | `authMiddleware`, `generateAndSaveToken` |
| Core SSE 使用 envelope 广播 event + cause + coreSessionId | 已实现 | `packages/core/src/server/sse.ts`, `packages/protocol/src/core/ui-contract.ts` | `SseManager.broadcast`, `CoreSseEnvelopeSchema` |
| EventLog 写入 `state.db.event_log` | 已实现 | `packages/core/src/eventbus/event-bus.ts`, `packages/core/src/db/schema.ts` | `EventBus.publish`, `TABLE_EVENT_LOG` |
| App 启动时先拉 snapshot，再启动 event client | 已实现 | `packages/app/src/app/core-services-bootstrap.tsx`, `packages/app/src/stores/app-store-runtime.ts` | `CoreServicesBootstrap`, `startAppStoreRuntime` |
| App 默认 transport 是 mock | 已实现 | `packages/app/src/lib/runtime/runtime-config.ts`, `packages/app/src/lib/runtime/app-services.ts` | `readTransportMode`, `createAppServices` |
| App 只有 workbench 与 settings 两个页面 | 已实现 | `packages/app/src/app/App.tsx` | `WorkbenchPage`, `SettingsPage` |
| App preload 会读取 `~/.do-what/run/session_token` | 已实现 | `packages/app/src/preload/preload.ts` | `CORE_SESSION_TOKEN_PATH`, `readCoreSessionToken` |
| UI store 分层为 hot-state / projection / pending / ack-overlay / settings-bridge / ui | 已实现 | `packages/app/src/stores/*` | 各 store 文件 |
| ack overlay 有 probe/refetch/reconciling/desynced 逻辑 | 已实现 | `packages/app/src/lib/reconciliation/ack-overlay-reconciliation.ts`, `packages/core/src/state/ack-tracker.ts` | `probeOrRefetchAckOverlay`, `AckTracker` |
| Core 暴露 workbench/timeline/inspector/settings 查询面 | 已实现 | `packages/core/src/server/routes.ts`, `packages/core/src/server/ui-query-service.ts` | `/api/workbench/snapshot`, `/api/runs/:runId/timeline`, `/api/runs/:runId/inspector`, `/api/settings` |
| Core 暴露 create-run / send-message / approval / settings / memory proposal review 命令面 | 已实现 | `packages/core/src/server/routes.ts`, `packages/core/src/server/ui-command-service.ts` | `/api/runs`, `/api/runs/:runId/messages`, `/api/approvals/:approvalId/decide`, `/api/memory/proposals/:proposalId/review`, `/api/settings` |
| memory pin/edit/supersede 当前未接通真实后端写路径 | 部分实现 | `packages/core/src/server/ui-command-service.ts` | `rejectUnsupportedMemoryPin`, `rejectUnsupportedMemoryEdit`, `rejectUnsupportedMemorySupersede` |
| drift resolution 当前未接通真实后端写路径 | 部分实现 | `packages/core/src/server/ui-command-service.ts` | `rejectUnsupportedDriftAction` |
| integration gate decision 当前未接通真实后端写路径 | 部分实现 | `packages/core/src/server/ui-command-service.ts` | `rejectUnsupportedGateAction` |
| Settings 当前是进程内内存态，不是磁盘持久化配置 | 部分实现 | `packages/core/src/server/settings-store.ts` | `SettingsStore`, `updateFields` |
| Soul 是真实子系统，不只是概念 | 已实现 | `packages/soul/src/mcp/dispatcher.ts`, `packages/soul/src/db/schema.ts` | `createSoulToolDispatcher`, `TABLE_MEMORY_CUES` 等 |
| Soul 有独立 `soul.db` | 已实现 | `packages/core/src/server/http.ts`, `packages/soul/src/config.ts` | `soulDbPath`, `SOUL_DB_PATH` |
| Soul 会创建 `memory_repo` Git 仓 | 已实现 | `packages/soul/src/repo/memory-repo-manager.ts` | `MemoryRepoManager`, `getOrInit`, `commit` |
| 当前 UI/Core 查询面主要依赖 SQLite 和 projection，而不是直接读取 `memory_repo` | 已实现 | `packages/core/src/server/ui-query-service.ts`, `packages/soul/src/repo/memory-repo-manager.ts` | `UiQueryService`, `MemoryRepoManager` |
| Core 通过 `/mcp/call` 暴露 Soul 工具调用入口 | 已实现 | `packages/core/src/server/mcp-routes.ts` | `/mcp/call` |
| Core 通过 `/soul/proposals` 和 `/soul/healing/stats` 暴露 Soul 只读视图 | 已实现 | `packages/core/src/server/soul-routes.ts` | `/soul/proposals`, `/soul/healing/stats` |
| worktree 生命周期已在 Core 中落地 | 已实现 | `packages/core/src/run/worktree-lifecycle.ts`, `packages/tools/src/git/worktree-manager.ts` | `WorktreeLifecycle`, `WorktreeManager` |
| 集成治理与 baseline/focus surface 在协议和 Core 中都有落点 | 已实现 | `packages/protocol/src/core/governance.ts`, `packages/protocol/src/core/focus-surface.ts`, `packages/protocol/src/core/baseline-lock.ts`, `packages/core/src/governance/*`, `packages/core/src/integrator/*` | `GovernanceLeaseSchema`, `CoreFocusSurfaceSchema`, `BaselineLockSchema` |
| `state.db` 中存在 governance lease 表 | 已实现 | `packages/core/src/db/schema.ts`, `packages/core/src/db/migrations/v4.ts` | `TABLE_GOVERNANCE_LEASES` |
| 引擎适配器包已经存在并有测试 | 已实现 | `packages/engines/claude/src/claude-adapter.ts`, `packages/engines/codex/src/codex-adapter.ts` | `ClaudeAdapter`, `CodexAdapter` |
| 当前 Core 启动流程未看到直接拉起 Claude/Codex 适配器 | 部分实现 | `packages/core/src/server/http.ts`, `packages/core/src/machines/run-registry.ts` | `startHttpServer`, `RunRegistry` |
| Run machine 当前主要管理状态迁移与事件，不直接体现外部引擎启动 | 部分实现 | `packages/core/src/machines/run-machine.ts` | `createRunActor`, `runMachine` |
| `@do-what/toolchain` 当前基本为空包 | 占位 | `packages/toolchain/src/index.ts` | `export {}` |
| App 有真实 Core 集成测试，不只是 mock 测试 | 已实现 | `packages/app/src/__tests__/real-core.integration.test.ts` | `describe('real-core integration', ...)` |
