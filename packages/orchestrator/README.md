# packages/orchestrator

`packages/orchestrator` 是 do-what 的本地编排器，负责 runtime 的启动、健康检查与生命周期管理。

## 常用命令

```bash
pnpm --filter @do-what/orchestrator dev
pnpm --filter @do-what/orchestrator build
pnpm --filter @do-what/orchestrator typecheck
pnpm --filter @do-what/orchestrator test
```

## 运行时定位

主线 runtime：

do-what 主线已移除 router 连接链路，不再提供该能力入口。

可选 runtime 扩展：
- N/A（router 模块已从主线摘除）


## 环境变量兼容（v0.6）

- 新变量前缀：`DOWHAT_*`（优先）
- 兼容前缀：`DOWHAT_*`（兼容期保留）
- 使用 `DOWHAT_*` 时会打印一次 deprecated 提示（非阻塞）
- 数据目录可通过 `DOWHAT_DATA_DIR`（兼容 `DOWHAT_DATA_DIR`）显式指定

## 开发命令

1. 主链路优先可运行。
2. 可选能力失败不阻塞核心流程。
3. 与 desktop/server 通过明确 CLI 与协议交互。

## v0.8 完成记录 (2026-03-01)

- `opencode-config` 路径生成现在会过滤 NUL 字节并提前创建目标目录
- 防止守护进程/启动流程中因无效路径字符导致的 ENOENT 错误
- 移除守护进程内部遗留的 router 命名，状态文件改为 `dowhat-orchestrator-state.json`



## v0.10 Update (2026-03-01)
- Orchestrator env compatibility mapper now reads DOWHAT_* directly.
- CLI/help and runtime flags were unified under the dowhat-* naming scheme where applicable.

