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

- opencode
- claude-code
- codex

可选 runtime 扩展：

- opencode-router（默认不作为主链路依赖）

## 设计原则

1. 主链路优先可运行。
2. 可选能力失败不阻塞核心流程。
3. 与 desktop/server 通过明确 CLI 与协议交互。
