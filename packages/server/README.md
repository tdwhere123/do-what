# packages/server

`packages/server` 是 do-what 的本地服务层，负责工作区文件、配置与 API 能力。

## 常用命令

```bash
pnpm --filter @do-what/server dev
pnpm --filter @do-what/server build
pnpm --filter @do-what/server test
pnpm --filter @do-what/server typecheck
```

## 模块职责

- 工作区配置读写
- 文件系统访问与校验
- 对上游（app/desktop/orchestrator）提供稳定接口

## 与核心区块关系

- `session/proto`：提供配置和协议承载
- `scheduled`：任务配置与落盘支持
- `soul/skills/extensions`：本地资源与配置存取能力

> v0.6 起优先读取 `DOWHAT_*`，并继续兼容 `DOWHAT_*`。
> 若使用旧变量（`DOWHAT_*`）会打印一次 deprecated 提示，但不阻塞启动。

- `DOWHAT_HOST` / `DOWHAT_HOST`
- `DOWHAT_PORT` / `DOWHAT_PORT`
- `DOWHAT_TOKEN` / `DOWHAT_TOKEN`
- `DOWHAT_HOST_TOKEN` / `DOWHAT_HOST_TOKEN`
- `DOWHAT_APPROVAL_MODE` / `DOWHAT_APPROVAL_MODE`
- `DOWHAT_OPENCODE_BASE_URL` / `DOWHAT_OPENCODE_BASE_URL`
- `DOWHAT_OPENCODE_DIRECTORY` / `DOWHAT_OPENCODE_DIRECTORY`
- `DOWHAT_OPENCODE_USERNAME` / `DOWHAT_OPENCODE_USERNAME`
- `DOWHAT_OPENCODE_PASSWORD` / `DOWHAT_OPENCODE_PASSWORD`

- 保持 local-first，不把云端作为必需依赖。
- router 连接链路已从主线摘除，本包不再将其作为能力入口。


## v0.10 Update (2026-03-01)
- Server now treats hub source as optional and empty by default.
- Set DOWHAT_HUB_OWNER + DOWHAT_HUB_REPO (+ optional DOWHAT_HUB_REF) to enable Hub listing/install.
- Legacy OpenWork env compatibility mapping has been removed; server reads DOWHAT_* only.

