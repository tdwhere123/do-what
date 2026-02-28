# packages/server

`packages/server` 是 do-what 的本地服务层，负责工作区文件、配置与 API 能力。

## 常用命令

```bash
pnpm --filter openwork-server dev
pnpm --filter openwork-server build
pnpm --filter openwork-server test
pnpm --filter openwork-server typecheck
```

## 模块职责

- 工作区配置读写
- 文件系统访问与校验
- 对上游（app/desktop/orchestrator）提供稳定接口

## 与核心区块关系

- `session/proto`：提供配置和协议承载
- `scheduled`：任务配置与落盘支持
- `soul/skills/extensions`：本地资源与配置存取能力

## 约束

- 保持 local-first，不把云端作为必需依赖。
- router 不属于本包主链路硬依赖。
