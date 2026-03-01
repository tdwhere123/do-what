# packages/desktop

`packages/desktop` 提供 do-what 的 Tauri 桌面壳与系统桥接能力。

## 启动命令

```bash
pnpm --filter @do-what/desktop dev
```

根命令对应为：`pnpm run dev:desktop`。

## 前置依赖（尤其 Windows）

1. Bun
2. Rust/Cargo
3. Visual Studio C++ Build Tools
4. WebView2 Runtime

建议先运行：

```powershell
pnpm run doctor:windows
pnpm run setup:windows
```

## 关键脚本

桌面主线已移除 router 连接链路，不再参与 sidecar/启动链路。

## 多助手状态接口（Track 2）

桌面端通过 Tauri 暴露统一运行时状态接口：

- `check_assistant_statuses`：一次返回 `opencode` / `claude-code` / `codex` 的安装与登录状态
- `check_opencode_status`
- `check_claude_code_status`
- `check_codex_status`

返回结构统一包含：`installed`、`loggedIn`、`version`、`details`，用于 Settings 页并列渲染。

## 5. 环境变量兼容（v0.6）

- 新变量前缀：`DOWHAT_*`（优先读取）
- 兼容前缀：`OPENWORK_*`（兼容期保留）
- 使用旧变量时会打印一次 deprecated 提示（不会阻塞脚本）
- 开发脚本默认注入 `DOWHAT_DATA_DIR`，并同时写入 `OPENWORK_DATA_DIR` 以保持兼容

## 5. 常用命令

- `opencode-router` 已从 do-what 主线代码路径摘除。

## v0.8 完成记录 (2026-03-01)

- Tauri 命令面仅保留 do-what 命名：
  - `dowhat_server_info`
  - `reset_dowhat_state`
  - `sandbox_cleanup_dowhat_containers`
  - `workspace_dowhat_read/write`
- Orchestrator 启动前确保 `data_dir` 存在

