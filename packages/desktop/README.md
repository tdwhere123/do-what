# @different-ai/openwork (desktop)

`packages/desktop` 是 do-what 的桌面壳（Tauri）与本机命令桥接层。

## 1. 核心职责

1. 启动桌面窗口与 WebView
2. 暴露 Tauri commands（进程编排、文件系统、runtime 执行）
3. 准备 sidecar 二进制（OpenCode / orchestrator / openwork-server）

## 2. 关键目录

- `src-tauri/src/lib.rs`: 命令注册入口
- `src-tauri/src/commands/agent_run.rs`: `claude-code` / `codex` 本地运行命令
- `src-tauri/src/commands/orchestrator.rs`: 工作区与 orchestrator 管理
- `scripts/prepare-sidecar.mjs`: sidecar 准备脚本
- `scripts/dev.mjs`: Tauri dev 启动脚本

## 3. 安装与产物位置

- Rust 编译产物: `packages/desktop/src-tauri/target`
- sidecar 产物: `packages/desktop/src-tauri/sidecars`

说明：这些目录是构建产物，不是业务源码，已通过根 `.gitignore` 忽略。

## 4. Router 状态（v0.6）

桌面默认链路不再构建/启动 router。即使设置 `DOWHAT_ROUTER_ENABLED=1`，`prepare-sidecar` 也会忽略该请求。


## 5. 环境变量兼容（v0.6）

- 新变量前缀：`DOWHAT_*`（优先读取）
- 兼容前缀：`OPENWORK_*`（兼容期保留）
- 使用旧变量时会打印一次 deprecated 提示（不会阻塞脚本）

## 5. 常用命令

```bash
pnpm --filter @different-ai/openwork run prepare:sidecar
pnpm --filter @different-ai/openwork dev
pnpm --filter @different-ai/openwork build
```
