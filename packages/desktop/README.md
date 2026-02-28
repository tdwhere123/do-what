# packages/desktop

`packages/desktop` 提供 do-what 的 Tauri 桌面壳与系统桥接能力。

## 启动命令

```bash
pnpm --filter @different-ai/openwork dev
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

- `dev`：桌面开发（`scripts/dev.mjs`）
- `build`：`tauri build`
- `prepare:sidecar`：准备 sidecar 二进制与依赖

## Router 说明

- `opencode-router` 是可选能力。
- v0.6 默认主链路不以 router 作为启动前提。
- 任何 router 相关失败不应阻塞业务/桌面主链路验收。
