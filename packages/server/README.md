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

- 保持 local-first，不把云端作为必需依赖。
- router 连接链路已从主线摘除，本包不再将其作为能力入口。
