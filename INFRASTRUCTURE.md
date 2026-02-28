# do-what Infrastructure

## 1. 基础设施原则

1. **CLI-first**：安装、启动、排错都可命令行复现。
2. **主链路优先**：默认先跑通业务，再扩展桌面与可选能力。
3. **可选模块不阻塞**：router 等扩展失败不影响主流程。
4. **文档即操作说明**：文档命令与脚本实现一致。

## 2. 根级脚本（当前事实）

来自根 `package.json`：

- `pnpm dev` -> `pnpm run dev:lite`
- `pnpm run dev:lite` -> UI 开发服务
- `pnpm run dev:desktop` -> 桌面链路
- `pnpm run doctor:windows`
- `pnpm run setup:windows`
- `pnpm run bootstrap:windows`
- `pnpm build` / `pnpm build:ui` / `pnpm typecheck`

## 3. 桌面链路前置（Windows）

- Node.js
- pnpm
- Bun
- Rust/Cargo
- Visual Studio C++ Build Tools
- WebView2 Runtime

上述项由 `doctor/install/bootstrap` 脚本负责检测和安装引导。

## 4. Sidecar 与运行时

- `packages/desktop/scripts/prepare-sidecar.mjs` 负责 sidecar 准备。
- v0.6 主链路默认不依赖 `opencode-router`。
- router 仅作为扩展能力保留，不应阻塞安装/启动验收。

## 5. 可复现验证命令

建议最小验证序列：

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm run dev:desktop
pnpm typecheck
```

在 Windows 新机上可替换为：

```powershell
pnpm run bootstrap:windows
pnpm dev
pnpm run dev:desktop
```

## 6. 运维与排错入口

- 安装问题：`docs/INSTALL_WINDOWS.md`
- 启动顺序：`docs/STARTUP_GUIDE.md`
- 故障定位：`docs/TROUBLESHOOTING.md`
- 运行时选择：`docs/RUNTIME_MATRIX.md`
