# do-what v0.1 仓库事实盘点

本文档只记录当前仓库中的可观察事实，不把 `docs/archive/` 中的目标态当成已实现状态。

## 1. 顶层结构

仓库当前没有 `apps/` 目录，工作区主体都在 `packages/` 下。

```text
.
├─ packages/
│  ├─ app/
│  ├─ core/
│  ├─ protocol/
│  ├─ soul/
│  ├─ tools/
│  ├─ toolchain/
│  └─ engines/
│     ├─ claude/
│     └─ codex/
├─ docs/
│  ├─ archive/
│  └─ INTERFACE_INDEX.md
├─ scripts/
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
└─ tsconfig.base.json
```

关键事实：

- 根工作区由 `pnpm-workspace.yaml` 定义，仅包含 `packages/*` 和 `packages/engines/*`。
- 根 `package.json` 只定义了 `build`、`test`、`lint` 三个 turbo 入口，没有统一 `start`。
- 本次盘点未发现仓库级 ESLint / Prettier 配置文件。

## 2. 工程配置与构建入口

### 根配置

| 文件 | 当前事实 |
| --- | --- |
| `package.json` | Node `>=20`，包管理器 `pnpm@10.27.0`，根脚本为 `build/test/lint` |
| `pnpm-workspace.yaml` | 工作区只覆盖 `packages/*` 与 `packages/engines/*` |
| `turbo.json` | `build` 依赖上游 `^build`，`test/lint` 也依赖 `^build` |
| `tsconfig.base.json` | TypeScript 基线配置为 `ES2022 + Node16`，`strict: true` |

### 各包脚本

| 包 | build | start/package | test | 当前判断 |
| --- | --- | --- | --- | --- |
| `@do-what/core` | `tsc` | `node ./dist/server/index.js` | 串行执行大量 Node 测试文件 | 已有真实运行入口 |
| `@do-what/app` | 3 个 Vite build | `electron-forge start` / `package` / `make` | `vitest run` | 已有真实 UI 入口 |
| `@do-what/protocol` | `tsc` | 无 | `vitest run` | 类型与 schema 包 |
| `@do-what/soul` | `tsc` | 无 | 构建后执行 `dist/run-tests.js` | 真实子系统 |
| `@do-what/claude` | `tsc` | `start-mcp` | 构建后执行 Node 测试 | 适配器包 |
| `@do-what/codex` | `tsc` | 无 | `vitest run` | 适配器包 |
| `@do-what/tools` | `tsc` | 无 | `vitest run` | git/worktree 工具包 |
| `@do-what/toolchain` | `tsc` | 无 | `vitest run --passWithNoTests` | 当前基本为空包 |

### 运行入口

当前仓库里可直接作为运行入口的主要命令：

```powershell
pnpm install
pnpm -w build
pnpm --filter @do-what/core start
pnpm --filter @do-what/app start
pnpm -w test
```

补充事实：

- `@do-what/core start` 运行 `dist` 产物，所以通常要先构建。
- `@do-what/app start` 启动 Electron Forge 开发环境。
- 根仓库没有一个命令同时启动 Core 和 App。

## 3. 关键目录与模块职责

### 3.1 `packages/protocol`

职责：

- 统一定义事件 schema、UI/Core 合同、治理与 Soul 相关类型。

已观察到的内容：

- `src/events/` 定义 run / engine / tool / system / memory / soul / integration 事件 schema。
- `src/core/ui-contract.ts` 定义 workbench snapshot、timeline page、inspector snapshot、settings snapshot、Core command/ack/probe 等 UI 合同。
- `src/core/` 还定义 hot-state、projection、ack、focus-surface、governance、baseline-lock、drift、topology。
- `src/mcp/tools-api.ts` 与 `src/mcp/soul-tools.ts` 定义 Tools API 与 Soul 工具 schema。

证据：

- `packages/protocol/src/core/ui-contract.ts`
- `packages/protocol/src/events/index.ts`
- `packages/protocol/src/mcp/tools-api.ts`
- `packages/protocol/src/mcp/soul-tools.ts`

### 3.2 `packages/core`

职责：

- 提供 Core daemon、HTTP/SSE 面、SQLite 状态与事件日志、查询面、命令面、治理逻辑、worktree 生命周期。

已观察到的内容：

- HTTP 入口在 `src/server/index.ts`，由 `startHttpServer()` 拉起。
- 路由集中在 `src/server/routes.ts`，包括 `/health`、`/api/workbench/snapshot`、`/api/runs/:runId/timeline`、`/api/settings`、`/api/runs`、`/api/runs/:runId/messages`、`/api/approvals/:approvalId/decide` 等。
- SSE 由 `src/server/sse.ts` 管理，广播 `CoreSseEnvelope`。
- `src/eventbus/event-bus.ts` 把事件写入 `event_log`，并向进程内监听器广播。
- `src/state/hot-state-manager.ts` 与 `src/state/ack-tracker.ts` 提供 HotState 与 ack 跟踪。
- `src/server/ui-query-service.ts` 与 `src/server/ui-command-service.ts` 是 UI 查询与命令面。
- `src/run/worktree-lifecycle.ts` 与 `src/integrator/*` 提供 worktree 捕获、patch 收集、集成判定。
- `src/policy/policy-engine.ts` 提供工具级 allow/ask/deny 决策。

当前限制：

- Core 侧对部分 UI 命令只返回 failure ack，不提供真实可写路径：
  - `rejectUnsupportedMemoryPin`
  - `rejectUnsupportedMemoryEdit`
  - `rejectUnsupportedMemorySupersede`
  - `rejectUnsupportedDriftAction`
  - `rejectUnsupportedGateAction`
- `RunRegistry` 和 `run-machine` 已存在，但在 `packages/core` 中没有看到直接拉起 `@do-what/claude` / `@do-what/codex` 适配器的接线。

证据：

- `packages/core/src/server/http.ts`
- `packages/core/src/server/routes.ts`
- `packages/core/src/server/ui-command-service.ts`
- `packages/core/src/server/ui-query-service.ts`
- `packages/core/src/eventbus/event-bus.ts`
- `packages/core/src/run/worktree-lifecycle.ts`
- `packages/core/src/policy/policy-engine.ts`

### 3.3 `packages/app`

职责：

- 提供 Electron 主进程、preload、React renderer、workbench 与 settings 页面、本地 store、HTTP/SSE 客户端。

已观察到的内容：

- Electron 主进程入口在 `src/main/main.ts`。
- preload 在 `src/preload/preload.ts`，会把 `~/.do-what/run/session_token` 暴露给前端。
- React 根入口在 `src/app/app-root.tsx`，使用 `HashRouter` 和 `React Query`。
- 路由只有两个页面：`/` 对应 workbench，`/settings` 对应 settings。
- `src/lib/runtime/runtime-config.ts` 定义传输模式；默认是 `mock`，不是 `http`。
- `src/lib/runtime/app-services.ts` 根据 transport mode 创建真实 HTTP 适配器或 mock 适配器。
- `src/stores/` 下有 `hot-state`、`projection`、`pending-command`、`ack-overlay`、`settings-bridge`、`ui`。
- `src/pages/workbench/workbench-page-content.tsx` 组合 sidebar、timeline、inspector、create-run modal。
- `src/pages/settings/settings-page-content.tsx` 展示 settings tabs、lease interruption 提示、overlay 状态。

当前限制：

- UI 默认不是直连 Core。
- `InspectorRail` 中的治理和 memory 动作按钮是存在的，但其中多项后端写路径未接通，因此运行时会落入 desynced overlay。

证据：

- `packages/app/src/lib/runtime/runtime-config.ts`
- `packages/app/src/lib/runtime/app-services.ts`
- `packages/app/src/app/App.tsx`
- `packages/app/src/pages/workbench/workbench-page-content.tsx`
- `packages/app/src/pages/settings/settings-page-content.tsx`
- `packages/app/src/components/inspector/inspector-rail.tsx`

### 3.4 `packages/soul`

职责：

- 提供独立的记忆存储、检索、proposal/review、pointer、evidence、memory_repo 持久化。

已观察到的内容：

- `src/mcp/dispatcher.ts` 会初始化 `soul.db`、compute provider、search、context lens、memory repo manager、proposal/review、pointer healing、compiler trigger 等。
- `src/db/schema.ts` 定义 `memory_cues`、`memory_graph_edges`、`evidence_index`、`memory_proposals`、`projects`、`soul_budgets` 等表。
- `src/repo/memory-repo-manager.ts` 在 `~/.do-what/memory/<fingerprint>/memory_repo` 下初始化 Git 仓库并提交记忆文件。
- `src/search/memory-search.ts`、`src/context/lens.ts`、`src/pointer/*`、`src/write/*`、`src/claim/*` 都有真实实现。

当前限制：

- Soul 的部分能力当前主要通过 dispatcher、tests 或 Core 的 review/proposal 路径使用；UI 直接修改既有 memory 的 pin/edit/supersede 未在 Core 中接通。

证据：

- `packages/soul/src/mcp/dispatcher.ts`
- `packages/soul/src/db/schema.ts`
- `packages/soul/src/repo/memory-repo-manager.ts`
- `packages/soul/src/search/memory-search.ts`

### 3.5 `packages/engines/claude` 与 `packages/engines/codex`

职责：

- 封装外部引擎协议与事件归一化逻辑。

已观察到的内容：

- `@do-what/claude` 提供 `ClaudeAdapter`、hook runner、MCP server、policy cache、Core forwarder。
- `@do-what/codex` 提供 `CodexAdapter`、process manager、JSONL reader/writer、event normalizer、approval handler。
- 两个包都有独立测试。

当前限制：

- 在当前 `core` 运行时路径中，未看到自动拉起这些适配器的接线。

证据：

- `packages/engines/claude/src/claude-adapter.ts`
- `packages/engines/codex/src/codex-adapter.ts`
- `packages/core/src/server/http.ts`

### 3.6 `packages/tools` 与 `packages/toolchain`

职责：

- `tools` 提供 worktree 和 git 辅助。
- `toolchain` 目前基本为空包。

已观察到的内容：

- `packages/tools/src/git/worktree-manager.ts` 管理 Git worktree 分配、释放、孤儿清理。
- `packages/toolchain/src/index.ts` 当前只有 `export {}`。

证据：

- `packages/tools/src/git/worktree-manager.ts`
- `packages/toolchain/src/index.ts`

## 4. 运行时文件与默认目录

当前代码中可观察到的默认运行时路径：

| 路径 | 来源 | 用途 |
| --- | --- | --- |
| `~/.do-what/run/session_token` | `packages/core/src/config.ts` | Core Bearer token |
| `~/.do-what/state/state.db` | `packages/core/src/server/http.ts` | Core SQLite 状态库 |
| `~/.do-what/state/soul.db` | `packages/core/src/server/http.ts` / `packages/soul/src/config.ts` | Soul SQLite 状态库 |
| `~/.do-what/memory/<fingerprint>/memory_repo` | `packages/soul/src/repo/memory-repo-manager.ts` | Soul 记忆 Git 仓 |
| `~/.do-what/worktrees/<runId>` | `packages/core/src/server/http.ts` / `packages/tools/src/git/worktree-manager.ts` | Run 对应 worktree |
| `~/.do-what/policy.json` | `packages/core/src/server/http.ts` | Policy 文件 |
| `~/.do-what/run/hook-policy-cache.json` | `packages/core/src/server/http.ts` | Hook policy cache |

## 5. 环境变量与运行参数

当前代码里能明确看到的环境变量入口：

| 变量 | 来源 | 用途 |
| --- | --- | --- |
| `DOWHAT_PORT` | `packages/core/src/config.ts` | 覆盖 Core 端口，默认 `3847` |
| `DOWHAT_AGENT_STUCK_THRESHOLD` | `packages/core/src/config.ts` | 覆盖 agent stuck 阈值，默认 `3` |
| `VITE_CORE_TRANSPORT` | `packages/app/src/lib/runtime/runtime-config.ts` | 选择 `mock` 或 `http`，默认 `mock` |
| `VITE_CORE_BASE_URL` | `packages/app/src/lib/runtime/runtime-config.ts` | 覆盖 UI 访问 Core 的基地址 |
| `VITE_CORE_SESSION_TOKEN` | `packages/app/src/lib/runtime/runtime-config.ts` | 显式覆盖 UI 使用的 token；未提供时会尝试使用 preload 注入值 |
| `VITE_CORE_MOCK_SCENARIO` | `packages/app/src/lib/runtime/runtime-config.ts` | 指定 mock 场景 |
| `VITE_CORE_RECONNECT_DELAY_MS` | `packages/app/src/lib/runtime/runtime-config.ts` | 指定 SSE 重连间隔 |

补充事实：

- UI 也支持通过 URL search 参数切换 `transport`、`mockScenario`、`coreBaseUrl`。
- Core 侧 policy、soul config、state dir、worktree dir 等路径可以通过 `startHttpServer()` 选项覆盖，但当前根脚本没有直接暴露这些参数。

## 6. Core API、SSE 与内部路由盘点

### 对 UI 暴露的主要 HTTP / SSE 面

| 路径 | 用途 |
| --- | --- |
| `GET /health` | 健康检查 |
| `GET /api/events/stream` | SSE 事件流 |
| `GET /state` | Core snapshot |
| `GET /api/workbench/snapshot` | Workbench snapshot |
| `GET /api/workflows/templates` | 模板列表 |
| `GET /api/runs/:runId/timeline` | timeline 分页 |
| `GET /api/runs/:runId/inspector` | inspector snapshot |
| `GET /api/settings` | settings snapshot |
| `GET /api/approvals/:approvalId` | approval probe |
| `GET /api/memory/:memoryId` | memory probe |
| `POST /api/runs` | create run |
| `POST /api/runs/:runId/messages` | run message |
| `POST /api/approvals/:approvalId/decide` | approval decision |
| `POST /api/memory/proposals/:proposalId/review` | memory proposal review |
| `PATCH /api/settings` | settings patch |
| `GET /acks/:ackId` | ack probe |

### 非 UI 路由

| 路径 | 用途 |
| --- | --- |
| `POST /internal/hook-event` | 从外部 hook forward event 到 Core |
| `POST /mcp/call` | Soul MCP tool 调用入口 |
| `GET /soul/proposals` | Soul proposal projection |
| `GET /soul/healing/stats` | pointer healing stats |
| `POST /_dev/start-run` | 开发辅助，仅 loopback |
| `POST /_dev/publish` | 开发态注入事件 |

## 7. 测试面盘点

当前仓库确实有较多测试文件，但没有从代码中直接看到覆盖率报告。按主题可观察到：

- `protocol`：schema 合法性与兼容性测试
- `core`：migration、event bus、database worker、run/engine/approval machine、policy、hot state、projection、baseline lock、focus surface、integration gate、UI API
- `app`：runtime config、mock adapter、core event client、HTTP client、各个 store、preload、real-core integration
- `soul`：DDL、memory search、proposal/review、pointer open/healing、memory compiler、budget、memory repo、context lens、claim form、user ledger
- `engines/claude`：adapter、hook runner、MCP server、policy cache、contract replay
- `engines/codex`：adapter、process transport、event normalizer、contract replay
- `tools`：GitOpsQueue、WorktreeManager

## 8. 当前仓库的几条高风险误读点

这些点在后续 README 和架构文档中必须显式避免误写：

- UI 默认是 `mock`，不是默认直连 Core。
- `RunRegistry`/`run-machine` 已实现，但当前 Core 运行路径里未看到自动启动 Claude/Codex 适配器。
- Soul 不是概念层，已经有真实 schema、检索和 memory_repo。
- Settings 当前不是持久化配置系统，而是进程内 `SettingsStore` 快照。
- Inspector 中的 memory / governance 按钮不等于后端已完全支持对应写操作。
