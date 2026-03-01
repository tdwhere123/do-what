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

router 连接链路已从主线代码中摘除，不再作为可配置能力存在。

- Windows 安装：`docs/INSTALL_WINDOWS.md`
- 启动链路：`docs/STARTUP_GUIDE.md`
- 常见故障：`docs/TROUBLESHOOTING.md`
- 运行时矩阵：`docs/RUNTIME_MATRIX.md`

## 维护要求（v0.8）

文档或行为变更后，必须同步更新：

1. `plans/history.md`
2. 受影响模块 README
3. 更新涉及的小版本计划文件

## v0.8 完成记录 (2026-03-01)

- Web 安全 Tauri invoke fallback（`packages/app/src/app/lib/tauri.ts`）
- localStorage 迁移：`openwork.* → dowhat.*`（`packages/app/src/app/entry.tsx`）
- 移除遗留 `openwork_*` 桥接命令，桌面端仅暴露 `dowhat_*` 命令
- orchestrator `opencode-config` 目录处理（NUL 过滤 + 目录创建）
- 暗色主题改为暖棕色方案，默认浅色主题
- 底栏主题切换按钮 + 汉化
- do-what-logo + 星星闪烁动画
- 系统通知文本全部汉化
- `theme.ts` key: `dowhat.themePref`


## v0.10 Update (2026-03-01)
- OpenWork compatibility branches were hard-removed in core runtime/env/header paths; current prefix is DOWHAT_*.
- Hub default source is now empty by design. Use external install flows or configure custom hub source via DOWHAT_HUB_* / VITE_DOWHAT_HUB_*.
- Detailed implementation record: plans/v0.10-record.md.
