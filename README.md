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
- `packages/engines/claude` 与 `packages/engines/codex` 提供适配器和测试，但当前仓库里的 Core 进程不会自动拉起这两个适配器。

## v0.1 已知限制

| 限制 | 说明 | 计划版本 |
| --- | --- | --- |
| Settings 不持久化 | 设置只保存在进程内快照，重启后恢复默认值 | v0.2 |
| 引擎需手动接入 | Create Run 会创建 RunMachine，但 Core 不会自动拉起 Claude/Codex 适配器 | v0.2 |
| 部分 Inspector 操作不可用 | `memory pin/edit/supersede`、`drift resolution`、`integration gate decision` 当前仅保留可见 disabled 入口 | v0.2 |

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

### 前置条件

- Node.js >= 20
- pnpm 10.x

### 安装

```powershell
pnpm install
pnpm -w build
```

### 启动（默认单入口）

```powershell
pnpm dev
```

`pnpm dev` 会先探测默认 Core 地址的 `/health`，若已有健康 Core 则直接复用；否则先拉起 Core，等待其健康后再启动 App。
默认探测地址优先使用 `VITE_CORE_BASE_URL`，否则回退到 `http://127.0.0.1:${DOWHAT_PORT || 3847}`。

> **注意：** 若 `pnpm dev` 自己拉起了 Core，则 App 退出时会一并关闭该 Core；若复用的是已有健康 Core，则不会代为关闭。

### 调试入口（保留双终端）

**终端 1：启动 Core daemon**

```powershell
pnpm dev:core
# Core 监听 127.0.0.1:3847，token 写入 ~/.do-what/run/session_token
```

**终端 2：启动 UI**

```powershell
pnpm dev:app
# Electron 窗口打开后会默认通过 HTTP 连接 Core
```

`dev:core` / `dev:app` 继续保留给调试使用；单独运行 `dev:app` 且 Core 未启动时，UI 仍会展示“Core 未运行”离线页，而不是静默退回 mock。

### 开发调试（Mock 模式）

不启动 Core、只验证 UI 组件时，需显式开启 mock：

```powershell
pnpm dev:app
# 然后在 Electron 开发地址后追加 ?transport=mock
```

或使用环境变量：

```powershell
$env:VITE_CORE_TRANSPORT = 'mock'
pnpm dev:app
```

UI 预加载脚本会尝试从 `~/.do-what/run/session_token` 读取 token，因此真实 Core 模式下通常应先启动 Core，再启动 App。

当 Core 已可达但 `~/.do-what/run/session_token` 尚未写出时，App 不会立刻判定启动失败，而是按 3 秒间隔自动重试 bootstrap，直到 token 可读或 Core 真正离线。

## 引擎接入（高级）

v0.1 中 Claude/Codex 适配器代码与测试已经存在，但需要人工外部接入；Core 不会自动拉起它们。

**Claude Code 适配器**

```powershell
pnpm --filter @do-what/claude build
# 然后将 Claude Code hooks 指向 packages/engines/claude/dist/hook-runner.js
```

**Codex 适配器**

```powershell
pnpm --filter @do-what/codex build
# 之后按本地集成方式手动启动 codex adapter 入口；Core 不负责自动接线
```

若未手动接入引擎，`create-run` 只会创建 run 并停留在 waiting / idle，不会自动产生执行进展。

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
pnpm dev
pnpm -w build
pnpm -w test
pnpm --filter @do-what/core test
pnpm --filter @do-what/soul test
pnpm --filter @do-what/app test
pnpm --filter @do-what/app typecheck
```

补充说明：

- 根仓库定义了 `build`、`test`、`typecheck` 三个 turbo 入口。
- 当前仓库中没有统一的 ESLint / Prettier 配置文件，更稳妥的是优先使用各包自己的 `test` / `typecheck` / `build`。

## 文档导航

- [docs/project-inventory.md](./docs/project-inventory.md)：仓库结构、运行方式、关键目录与证据盘点
- [docs/architecture-as-built.md](./docs/architecture-as-built.md)：当前实际架构、模块边界、数据流与术语映射
- [docs/implementation-status-v0.1.md](./docs/implementation-status-v0.1.md)：按子系统整理的实现状态、缺口与限制
- [docs/architecture-evidence-index.md](./docs/architecture-evidence-index.md)：关键架构结论与代码证据索引
- [docs/INTERFACE_INDEX.md](./docs/INTERFACE_INDEX.md)：接口索引
