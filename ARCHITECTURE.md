# do-what Architecture

## 1. 分层概览

`do-what` 采用四层结构：

1. **App 层**（`packages/app`）：业务 UI 与交互。
2. **Desktop 层**（`packages/desktop`）：Tauri 壳与系统命令桥接。
3. **Orchestrator 层**（`packages/orchestrator`）：本地 runtime 编排与进程生命周期。
4. **Server 层**（`packages/server`）：工作区配置、文件能力、接口代理。

## 2. 两条启动主线

### 2.1 业务启动链路（默认）

命令：`pnpm dev`

- 实际执行根脚本 `dev -> dev:lite`。
- `dev:lite` 仅启动 `@different-ai/openwork-ui`（Vite）。
- 用于最快验证会话、页面与业务逻辑，不依赖 Rust/Tauri 编译。

### 2.2 桌面启动链路（完整）

命令：`pnpm run dev:desktop`

- 实际执行 `@different-ai/openwork` 的 `scripts/dev.mjs`。
- 需要桌面前置（Rust、Build Tools、WebView2 等）。
- 会触发 sidecar 准备与桌面壳集成流程。

## 3. 运行时与可选能力

主线运行时：

- `opencode`
- `claude-code`
- `codex`

可选能力：

- `opencode-router`：默认不参与 v0.6 主链路；只在显式启用或独立分支恢复时使用。

## 4. 核心业务区块

- `session`：消息收发、事件流渲染、会话切换。
- `proto`：跨模块通信协议、命令/事件形态。
- `scheduled`：计划任务创建、执行与清理。
- `soul`：长期记忆与工作上下文沉淀。
- `skills`：技能包加载、配置与安装。
- `extensions`：扩展能力管理（MCP、可选 router、其他外部集成）。

## 5. 设计约束

1. 安装和启动链路优先，不因可选能力失败而阻塞。
2. 文档命令必须能在 CLI 复现。
3. 默认路径优先业务可运行，再进入桌面链路验证。
4. 文档与脚本行为保持一致。
