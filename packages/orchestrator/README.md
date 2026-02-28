# packages/orchestrator

`packages/orchestrator` 是 do-what 的本地编排器，负责 runtime 的启动、健康检查与生命周期管理。

## 常用命令

```bash
pnpm --filter openwork-orchestrator dev
pnpm --filter openwork-orchestrator build
pnpm --filter openwork-orchestrator typecheck
pnpm --filter openwork-orchestrator test:router
```

## 运行时定位

主线 runtime：

do-what 默认桌面链路不启用 router。可通过 `--opencode-router`（或环境变量 `DOWHAT_ROUTER_ENABLED=1`）显式启用。
若 router 二进制缺失且未设置 `--opencode-router-required`，orchestrator 会给出 warning 并继续主链路。

可选 runtime 扩展：

- opencode-router（默认不作为主链路依赖）


## 环境变量兼容（v0.6）

- 新变量前缀：`DOWHAT_*`（优先）
- 兼容前缀：`OPENWORK_*`（兼容期保留）
- 使用 `OPENWORK_*` 时会打印一次 deprecated 提示（非阻塞）

## 开发命令

1. 主链路优先可运行。
2. 可选能力失败不阻塞核心流程。
3. 与 desktop/server 通过明确 CLI 与协议交互。
