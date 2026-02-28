# do-what

`do-what` 是一个本地优先的桌面 AI 工作台，采用多运行时并列架构：
- OpenCode
- Claude Code
- Codex

`opencode-router` 仅作为遗留可选扩展，不在 v0.6 默认主链路中，不再阻塞安装和启动。

## 1. 当前仓库结构

- `packages/app`（`@do-what/ui`）：桌面 UI（SolidJS + Tailwind）
- `packages/desktop`（`@do-what/desktop`）：Tauri 壳 + 系统桥接命令
- `packages/orchestrator`（`@do-what/orchestrator`）：本地编排器（进程管理、健康检查、沙箱）
- `packages/server`（`@do-what/server`）：工作区配置/文件能力/API 代理

## 2. Windows 快速启动（推荐）

```powershell
pnpm run bootstrap:windows
pnpm dev
```

`bootstrap:windows` 会执行：
1. 环境检测（Node/pnpm/bun/Rust/Cargo/Build Tools/WebView2）
2. 缺失环境自动安装（winget）
3. `pnpm install --frozen-lockfile`
4. `prepare:sidecar`

说明：
- `pnpm dev` 默认是瘦身模式（仅 UI，不编译桌面 Rust）。
- 桌面模式请用：`pnpm run dev:desktop`

## 3. 常用命令

```bash
pnpm run doctor:windows
pnpm run setup:windows
pnpm run bootstrap:windows

pnpm run dev:business
pnpm run dev:desktop
pnpm dev:ui
pnpm build
pnpm typecheck
```

## 4. Router 状态（v0.6）

router 已从默认桌面链路下线，不再作为当前版本运行前提。
`DOWHAT_ROUTER_ENABLED` 在 v0.6 主链路中不再生效（会被忽略）。

## 5. 文档索引

- `docs/INSTALL_WINDOWS.md`：Windows 安装与自动补环境
- `docs/STARTUP_GUIDE.md`：启动模式与启动顺序
- `docs/TROUBLESHOOTING.md`：常见报错与定位
- `docs/CORE_LOGIC_AND_MODULES.md`：核心逻辑与功能区块
- `ARCHITECTURE.md`：运行时与数据流
- `INFRASTRUCTURE.md`：基础设施与依赖策略

## 6. 版本内维护规则

- 任何功能变更必须同步：
  - `plans/v0.6.md`
  - `plans/history.md`
  - 受影响模块 README
