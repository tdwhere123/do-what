# do-what

`do-what` 是一个本地单机的 AI 编码代理编排仓库。当前代码库包含一个独立的 Core daemon、一个 Electron + React UI、协议与事件 schema、Soul 记忆子系统、Claude/Codex 适配器，以及 worktree / git 辅助工具。

这份 README 只描述仓库当前已经落地的实现，不复述 archive 文档中的目标态。更详细的事实盘点见：

- [docs/project-inventory.md](./docs/project-inventory.md)
- [docs/architecture-as-built.md](./docs/architecture-as-built.md)
- [docs/implementation-status-v0.1.md](./docs/implementation-status-v0.1.md)
- [docs/architecture-evidence-index.md](./docs/architecture-evidence-index.md)

## 当前代码库实际做成了什么

- `packages/core` 实现了 Core HTTP/SSE 服务、SQLite 事件日志、HotState 聚合、UI 查询面、审批队列、worktree 生命周期和集成治理相关逻辑。
- `packages/app` 实现了 Electron + React 工作台，包含 workbench、timeline、inspector、settings、乐观消息 tail、ack overlay 和与 Core 对接的 HTTP/SSE 客户端。
- `packages/protocol` 提供协议、事件、UI 合同、治理与 Soul 相关 Zod schema。
- `packages/soul` 实现了独立的 `soul.db`、memory search、pointer open/healing、proposal/review、memory_repo Git 持久化等能力。
- `packages/engines/claude` 与 `packages/engines/codex` 提供适配器和测试，但当前仓库里的 Core 进程没有看到直接拉起这两个适配器的接线。

## 需要先知道的限制

- UI 默认运行在 `mock` 传输模式，不是默认直连 Core。
- Core 的 UI 命令面只部分闭环。`create run`、`send message`、`approval decision`、`settings update`、`memory proposal review` 有真实路径；`memory pin/edit/supersede`、`drift resolution`、`integration gate decision` 目前会返回失败或进入 desynced overlay。
- `SettingsStore` 当前是 Core 进程内内存态，不是持久化配置中心。
- 根仓库没有一键同时启动 Core 和 App 的脚本，需要分别启动。
- `docs/archive/` 下是历史设计与任务记录，不应直接视为当前实现状态。

## 仓库结构

```text
packages/
  app/                 Electron + React UI
  core/                Fastify daemon, event log, hot state, query/command surface
  protocol/            Zod schemas and shared contracts
  soul/                Memory storage, retrieval, proposal/review, memory_repo
  tools/               git/worktree helpers
  toolchain/           目前基本为空包
  engines/
    claude/            Claude Hooks/MCP adapter package
    codex/             Codex JSONL adapter package
docs/
  archive/             历史方案与任务文档
  INTERFACE_INDEX.md   接口索引
scripts/               协议/适配器校验脚本
```

## 快速开始

### 1. 安装与构建

```powershell
pnpm install
pnpm -w build
```

### 2. 启动 Core

`@do-what/core` 的 `start` 脚本直接运行 `dist/server/index.js`，因此通常应先构建。

```powershell
pnpm --filter @do-what/core start
```

默认监听：

- `http://127.0.0.1:3847`
- Bearer token 文件：`~/.do-what/run/session_token`

### 3. 启动 UI

默认启动的是 Electron 工作台，但默认传输模式仍是 `mock`：

```powershell
pnpm --filter @do-what/app start
```

如果要让 UI 直连已经启动的 Core，可以在启动 App 前设置：

```powershell
$env:VITE_CORE_TRANSPORT = "http"
pnpm --filter @do-what/app start
```

可选地覆盖 Core 地址：

```powershell
$env:VITE_CORE_TRANSPORT = "http"
$env:VITE_CORE_BASE_URL = "http://127.0.0.1:3847"
pnpm --filter @do-what/app start
```

UI 预加载脚本会尝试从 `~/.do-what/run/session_token` 读取 token，因此直连模式下通常应先启动 Core，再启动 App。

## 架构摘要

```text
Electron UI
  -> HTTP snapshot + command routes
  -> SSE event stream

Core daemon
  -> state.db event_log / runs / workspaces / approvals / governance
  -> HotStateManager / UiQueryService / UiCommandService
  -> Soul dispatcher (same process, separate soul.db)
  -> worktree lifecycle / integrator / policy engine

Soul
  -> soul.db
  -> memory_repo Git storage under ~/.do-what/memory/<fingerprint>/memory_repo
```

更详细的模块边界、数据流和术语映射见 [docs/architecture-as-built.md](./docs/architecture-as-built.md)。

## 常用命令

```powershell
pnpm -w build
pnpm -w test
pnpm --filter @do-what/core test
pnpm --filter @do-what/soul test
pnpm --filter @do-what/app test
pnpm --filter @do-what/app typecheck
```

补充说明：

- 根仓库定义了 `build`、`test`、`lint` 三个 turbo 入口。
- 当前仓库中没有看到统一的 ESLint / Prettier 配置文件，`lint` 是否可直接作为有效质量门取决于后续补齐情况；更稳妥的是优先使用各包自己的 `test` / `typecheck` / `build`。

## 文档导航

- [docs/project-inventory.md](./docs/project-inventory.md)：仓库结构、运行方式、关键目录与证据盘点
- [docs/architecture-as-built.md](./docs/architecture-as-built.md)：当前实际架构、模块边界、数据流与术语映射
- [docs/implementation-status-v0.1.md](./docs/implementation-status-v0.1.md)：按子系统整理的实现状态、缺口与限制
- [docs/architecture-evidence-index.md](./docs/architecture-evidence-index.md)：关键架构结论与代码证据索引
- [docs/INTERFACE_INDEX.md](./docs/INTERFACE_INDEX.md)：接口索引
