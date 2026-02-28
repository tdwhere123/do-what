# do-what

`do-what` 是一个 **desktop-first、local-first** 的多运行时 AI 工作台。当前主线运行时为：

- `opencode`
- `claude-code`
- `codex`

`opencode-router` 已从 do-what 主线移除，不参与安装与启动主链路。

- `packages/app`（`@do-what/ui`）：桌面 UI（SolidJS + Tailwind）
- `packages/desktop`（`@do-what/desktop`）：Tauri 壳 + 系统桥接命令
- `packages/orchestrator`（`@do-what/orchestrator`）：本地编排器（进程管理、健康检查、沙箱）
- `packages/server`（`@do-what/server`）：工作区配置/文件能力/API 代理

```bash
pnpm dev
```

根脚本中 `dev` 映射到 `dev:lite`，仅启动 `packages/app` 的 Vite 开发服务，适合先验证业务链路。

## 桌面启动链路（Tauri）

桌面开发命令：

```bash
pnpm run dev:desktop
```

前置要求：

1. Node.js + pnpm
2. Bun（orchestrator/server 运行需要）
3. Rust/Cargo（Tauri 需要）
4. Visual Studio C++ Build Tools（Windows）
5. WebView2 Runtime（Windows）

Windows 推荐先执行：

```powershell
pnpm run doctor:windows
pnpm run setup:windows
pnpm run bootstrap:windows

pnpm run dev:business
pnpm run dev:desktop
pnpm dev:ui
pnpm build
pnpm typecheck
```

## 仓库结构

- `packages/app`：业务 UI（会话、技能、扩展、设置）
- `packages/desktop`：Tauri 桌面壳与系统桥接
- `packages/orchestrator`：本地编排器，负责 runtime 进程管理
- `packages/server`：本地文件/配置/API 能力

## 核心功能区块

- `session`：主会话发送、回流、状态管理
- `proto`：协议与事件结构（UI/desktop/server 之间）
- `scheduled`：调度任务管理
- `soul`：长期记忆/上下文资产
- `skills`：本地技能管理与安装
- `extensions`：扩展与 MCP 配置

详见：`docs/CORE_LOGIC_AND_MODULES.md`。

router 连接链路已从主线彻底禁用；即使传入历史开关参数也会被忽略。

- Windows 安装：`docs/INSTALL_WINDOWS.md`
- 启动链路：`docs/STARTUP_GUIDE.md`
- 常见故障：`docs/TROUBLESHOOTING.md`
- 运行时矩阵：`docs/RUNTIME_MATRIX.md`

## 维护要求（v0.6）

文档或行为变更后，必须同步更新：

1. `plans/v0.6.md`
2. `plans/history.md`
3. 受影响模块 README
4. 结构瘦身/模块拆分时同步 `plans/v0.6-slimming-spec.md`
