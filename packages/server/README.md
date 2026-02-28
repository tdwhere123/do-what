# openwork-server

`openwork-server` 提供工作区配置、文件能力、审批、以及对 OpenCode 的代理能力。

## 快速使用

```bash
pnpm --filter openwork-server dev -- --workspace /path/to/workspace --approval auto
```

或使用已发布二进制：

```bash
openwork-server --workspace /path/to/workspace --approval auto
```

## 核心端点

- `GET /health`
- `GET /status`
- `GET /workspaces`
- `GET /workspace/:id/config`
- `PATCH /workspace/:id/config`
- `POST /workspace/:id/engine/reload`
- `GET|POST|... /opencode/*`

Router 相关端点仍在代码中保留，但不属于 v0.6 默认运行链路。

## 关键环境变量

> v0.6 起优先读取 `DOWHAT_*`，并继续兼容 `OPENWORK_*`。
> 若使用旧变量（`OPENWORK_*`）会打印一次 deprecated 提示，但不阻塞启动。

- `DOWHAT_HOST` / `OPENWORK_HOST`
- `DOWHAT_PORT` / `OPENWORK_PORT`
- `DOWHAT_TOKEN` / `OPENWORK_TOKEN`
- `DOWHAT_HOST_TOKEN` / `OPENWORK_HOST_TOKEN`
- `DOWHAT_APPROVAL_MODE` / `OPENWORK_APPROVAL_MODE`
- `DOWHAT_OPENCODE_BASE_URL` / `OPENWORK_OPENCODE_BASE_URL`
- `DOWHAT_OPENCODE_DIRECTORY` / `OPENWORK_OPENCODE_DIRECTORY`
- `DOWHAT_OPENCODE_USERNAME` / `OPENWORK_OPENCODE_USERNAME`
- `DOWHAT_OPENCODE_PASSWORD` / `OPENWORK_OPENCODE_PASSWORD`

## 开发命令

```bash
pnpm --filter openwork-server dev
pnpm --filter openwork-server test
pnpm --filter openwork-server typecheck
```
