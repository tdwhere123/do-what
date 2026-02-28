# do-what Project Framework (v0.6)

## 1) 产品定位

`do-what` 是一个以桌面体验为核心、以本地可运行为第一原则的 AI 工作台。

- **desktop-first**：最终交付桌面工作流。
- **local-first**：默认本地运行，不依赖云端控制面。
- **multi-runtime**：同一工作区中支持多个 runtime 协作。

## 2) v0.6 目标

1. 安装链路可复现。
2. 启动链路清晰可验证。
3. router 从硬依赖改为可选能力。
4. 文档叙事统一为 do-what，且与脚本一致。

## 3) 模块责任

- `packages/app`：业务前端与核心功能区块入口。
- `packages/desktop`：桌面壳、系统调用、sidecar 准备。
- `packages/orchestrator`：runtime 进程编排、健康检查、启停管理。
- `packages/server`：工作区文件、配置、服务接口。

## 4) 默认开发与验证策略

- 默认开发：`pnpm dev`（业务链路优先）。
- 桌面联调：`pnpm run dev:desktop`（前置满足后再执行）。
- Windows 机器初始化：
  - `pnpm run doctor:windows`
  - `pnpm run setup:windows`
  - `pnpm run bootstrap:windows`

## 5) 能力分级

### 核心能力（主链路）

- session / proto / scheduled / soul / skills / extensions（基础扩展能力）
- opencode / claude-code / codex runtime

### 可选能力

- `opencode-router`（默认关闭，不阻塞主链路）

## 6) Definition of Done（文档类改动）

1. 关键命令可运行或给出明确失败原因。
2. 根文档 + 包级文档 + docs 专题文档同步。
3. `plans/v0.6.md` 与 `plans/history.md` 记录本次变更。
