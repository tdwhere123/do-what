# OpenWork（桌面定制版骨架）

这个仓库已收敛为**桌面完整体验优先**的改造基线：
- 保留桌面端完整链路（UI + Tauri + Orchestrator + Server）。
- 删除 web/landing/services/packaging 等配套层，降低后续个人化改造复杂度。

## 保留的核心模块

- `packages/app`：桌面 UI（SolidJS + Tailwind）。
- `packages/desktop`：Tauri 桌面壳与系统能力。
- `packages/orchestrator`：本地编排器（`openwork`）。
- `packages/server`：服务端控制面。
- `packages/opencode-router`：编排链路依赖的连接器包。

## 建议阅读顺序

1. `PROJECT_FRAMEWORK.md`
2. `ARCHITECTURE.md`
3. `INFRASTRUCTURE.md`

## 常用命令

```bash
pnpm install
pnpm dev
pnpm dev:ui
pnpm build
pnpm typecheck
pnpm test:e2e
```

## 改造建议（个人使用）

- 优先改 `packages/app/src`（交互与信息密度）。
- 需要系统能力时改 `packages/desktop/src-tauri`。
- 涉及执行流程与会话控制，再改 `packages/orchestrator/src`、`packages/server/src`。
