# Windows 安装指南（do-what）

## 目标

在全新 Windows 环境下，复现 do-what 的依赖安装与首次可运行状态。

## 推荐步骤

```powershell
pnpm run doctor:windows
pnpm run setup:windows
pnpm run bootstrap:windows
```

说明：

- `doctor:windows`：检测 Node/pnpm/Bun/Rust/Build Tools/WebView2。
- `setup:windows`：安装缺失基础依赖。
- `bootstrap:windows`：执行安装 + 依赖拉取 + 启动前准备。

## 手动安装（可选）

如果自动安装受公司策略限制，请至少确保：

1. Node.js
2. pnpm
3. Bun
4. Rust/Cargo
5. Visual Studio C++ Build Tools
6. WebView2 Runtime

## 安装后验证

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm run dev:desktop
```

- `pnpm dev` 先验证业务链路。
- `pnpm run dev:desktop` 再验证桌面链路。

## Router 说明

- `opencode-router` 在 v0.6 是可选能力。
- 未启用 router 不应阻塞上述安装/启动流程。
