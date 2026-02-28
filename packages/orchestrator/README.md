# openwork-orchestrator

本包提供本地编排入口：拉起 OpenCode + openwork-server，并向桌面端提供稳定连接面。

## 快速使用

```bash
pnpm --filter openwork-orchestrator dev -- --workspace /path/to/workspace
```

或运行编译后可执行文件：

```bash
openwork start --workspace /path/to/workspace
```

## Router 状态（v0.6）

do-what 默认桌面链路不启用 router。可通过 `--opencode-router`（或环境变量 `DOWHAT_ROUTER_ENABLED=1`）显式启用。
若 router 二进制缺失且未设置 `--opencode-router-required`，orchestrator 会给出 warning 并继续主链路。

## 常用参数

- `--workspace <path>`
- `--approval manual|auto`
- `--openwork-port <port>`
- `--sidecar-source auto|bundled|downloaded|external`
- `--opencode-source auto|bundled|downloaded|external`
- `--check` / `--check-events`

## 开发命令

```bash
pnpm --filter openwork-orchestrator dev
pnpm --filter openwork-orchestrator typecheck
pnpm --filter openwork-orchestrator build
```
