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

do-what 默认桌面链路不启用 router。orchestrator 中的 router 参数保留为历史兼容能力，不属于当前主链路验收范围。

## 常用参数

- `--workspace <path>`
- `--approval manual|auto`
- `--openwork-port <port>`
- `--sidecar-source auto|bundled|downloaded|external`
- `--opencode-source auto|bundled|downloaded|external`
- `--check` / `--check-events`


## 环境变量兼容（v0.6）

- 新变量前缀：`DOWHAT_*`（优先）
- 兼容前缀：`OPENWORK_*`（兼容期保留）
- 使用 `OPENWORK_*` 时会打印一次 deprecated 提示（非阻塞）

## 开发命令

```bash
pnpm --filter openwork-orchestrator dev
pnpm --filter openwork-orchestrator typecheck
pnpm --filter openwork-orchestrator build
```
