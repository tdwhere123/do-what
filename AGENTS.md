# AGENTS.md

## Project Identity

- Repo: `do-what`
- Product mode: desktop-first, local-first, multi-runtime
- Primary runtimes: `opencode`, `claude-code`, `codex`
- Optional legacy module: `opencode-router` (not in v0.6 mainline)

## Development Guardrails

1. 任何新功能必须先保证安装与启动链路不回归。
2. 可选能力不得阻塞主链路。
3. 变更必须可通过 CLI 复现与验证。
4. 文档与代码行为必须一致。

## Mandatory Maintenance Rules

每次改动后必须同步维护以下文件：
1. 当前版本计划文件（当前为 `plans/v0.6.md`）
2. 版本历史（`plans/history.md`）
3. 受影响模块 README（根 README 或 package README）
4. 涉及结构瘦身/模块拆分时，必须同步 `plans/v0.6-slimming-spec.md`

## Intake Format

开始执行前的首条进度更新必须包含：
1. `Target repo: <path>`
2. `Out of scope repos: <list>`
3. `Planned output: <files/commands/tests>`

## Runtime Defaults

- Router v0.6 mainline: removed from default runtime path
  - `prepare-sidecar` ignores router build requests
  - sandbox host startup enforces `--no-opencode-router`
- 若要恢复 Router，请走独立分支，不要影响主链路验收。

## Windows Bootstrap Commands

```powershell
pnpm run doctor:windows
pnpm run setup:windows
pnpm run bootstrap:windows
```

## Definition of Done (per change)

1. 关键命令可运行或给出明确失败原因
2. 相关文档已更新
3. `plans/` 已记录本次变更
