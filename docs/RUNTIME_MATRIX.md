# do-what Runtime Matrix（v0.6）

| Runtime / 能力 | 默认状态 | 主链路依赖 | 典型用途 |
|---|---|---|---|
| opencode | 启用 | 是 | 默认会话执行 |
| claude-code | 启用 | 是 | 本地代理执行 |
| codex | 启用 | 是 | 本地代理执行 |
| opencode-router | 关闭（可选） | 否 | 外部消息通道桥接 |

## 默认策略

1. 主链路只要求 `opencode/claude-code/codex`。
2. router 作为扩展能力，不应阻塞安装、启动和验收。

## 命令映射

- 默认业务开发：`pnpm dev`
- 桌面联调：`pnpm run dev:desktop`
- Windows 初始化：
  - `pnpm run doctor:windows`
  - `pnpm run setup:windows`
  - `pnpm run bootstrap:windows`
