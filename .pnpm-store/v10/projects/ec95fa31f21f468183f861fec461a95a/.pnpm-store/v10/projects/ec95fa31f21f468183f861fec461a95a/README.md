# do-what

> 本地单机 AI 开发工作台 · 单人 + AI 辅助 · Windows 为主

do-what 是一个可本地安装的 AI 开发工作台，以 **Core daemon** 为控制平面，统一接入 Claude Code 和 Codex 两个引擎，提供多 Agent 并行协作、Soul 记忆外挂、强权限审计与可回放的执行历史。

---

## 核心特性

| 特性 | 说明 |
|------|------|
| **统一 UI 入口** | 对话多个引擎、并行跑任务、像工作流一样看状态 |
| **多 Agent 协作** | 并行只读 / 隔离并行写（独立 worktree）/ 可交接 |
| **Soul 记忆外挂** | 模糊层（线索/抽象）+ 证据层（原文），渐进显影与遗忘 |
| **强权限与审计** | 危险动作收口、Checkpoint 记忆审阅、事件可回放 |

**本版约束：** 仅支持 Claude Code + Codex，Windows 为主开发/运行平台（允许 WSL2/Docker）。

---

## 项目状态

> **当前阶段：规划完成，代码实现中。**

| 阶段 | 状态 |
|------|------|
| 方案定稿（v0.1） | ✅ 完成 |
| Ticket 拆解（T001~T027） | ✅ 完成 |
| E0 Protocol & Schema | 🔲 待实现 |
| E1 Core Skeleton | 🔲 待实现 |
| E1.5 Protocol Validation Gate | 🔲 待实现 |
| E2 Claude Engine Adapter | 🔲 待实现 |
| E3 Codex Engine Adapter | 🔲 待实现 |
| E4~E7 Soul / Integrator / Compiler | 🔲 待实现 |

---

## 架构概览

```
┌─────────────────────────────────────────────┐
│                 UI (Electron + React)        │
│          HTTP + SSE → 127.0.0.1:3847        │
└──────────────────────┬──────────────────────┘
                       │ Bearer Token
┌──────────────────────▼──────────────────────┐
│              Core daemon (Node.js)           │
│  Event Bus · SQLite · xstate · Policy Engine │
└──────┬──────────────┬───────────────┬────────┘
       │              │               │
┌──────▼─────┐ ┌──────▼─────┐ ┌──────▼──────┐
│   Claude   │ │   Codex    │ │    Soul     │
│  (Hooks +  │ │(App Server │ │  (SQLite +  │
│ MCP Server)│ │   JSONL)   │ │ memory_repo)│
└──────┬─────┘ └──────┬─────┘ └─────────────┘
       │              │
┌──────▼──────────────▼──────┐
│     packages/tools         │
│  file · git · shell        │
│  docker · wsl              │
└────────────────────────────┘
```

**所有状态流经 Core，引擎只是执行侧，UI 只是渲染侧。**

---

## 技术栈

| 层 | 技术 |
|----|------|
| Monorepo | pnpm workspace + turborepo |
| 语言 | TypeScript（全栈，Node.js >= 20） |
| Core daemon | Node.js + Fastify + xstate v5 |
| 数据库 | better-sqlite3（WAL 模式，worker_threads 写） |
| Schema 校验 | zod（所有 API/事件类型） |
| 测试 | vitest |
| UI | Electron + React（待实现） |

---

## 快速开始

> 代码实现完成后更新此节。

**前提条件：**
- Node.js >= 20
- pnpm >= 9
- Git
- Claude Code CLI（已登录）或 Codex CLI（已配置 API Key）

```bash
# 克隆仓库
git clone <repo-url>
cd do-what-new

# 安装依赖
pnpm install

# 构建
pnpm -w build

# 启动 Core
pnpm --filter @do-what/core start

# Core 运行于 127.0.0.1:3847
# session_token 在 ~/.do-what/run/session_token
curl http://127.0.0.1:3847/health
```

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [`do-what-proposal-v0.1.md`](./do-what-proposal-v0.1.md) | 完整方案（权威来源） |
| [`docs/PLAN.md`](./docs/PLAN.md) | Epic/Ticket 总览、依赖 DAG、关键路径 |
| [`docs/INTERFACE_INDEX.md`](./docs/INTERFACE_INDEX.md) | 所有接口、事件、MCP Tool、HTTP 端点、DB 表索引 |
| [`CODEX_QUEUE.md`](./CODEX_QUEUE.md) | Codex 执行指令块（逐 Ticket） |
| [`tasks/`](./tasks/) | T001~T027 详细 Ticket 卡片 |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code 工作指南 |
| [`AGENTS.md`](./AGENTS.md) | Codex Agent 工作指南 |

---

## 运行时文件布局

```
~/.do-what/
  run/
    session_token          # Core HTTP 鉴权 token（权限 600）
    hook-policy-cache.json # Hook Runner 策略缓存
  state/
    state.db               # Core SQLite（Run/Workspace/Event Log）
    soul.db                # Soul SQLite（memory_cues/edges/evidence）
  memory/
    <fingerprint>/
      memory_repo/         # Git 版本锚（证据真相层）
  worktrees/
    <runId>/               # 每个 Run 的隔离 worktree（临时）
  policy.json              # 工具审批策略配置
  soul-config.json         # Soul 计算后端配置
```

---

## 四条承重墙

1. **单一真相源** — 状态只在 Core，可恢复、可回放
2. **危险动作收口** — 文件/命令/网络 → Tools API → Policy Engine 仲裁
3. **证据可溯源** — 结论可引用原文；证据不常驻上下文，按需拉取
4. **Token 预算契约** — 注入预算写死；超预算本地熔断并降级

---

## 贡献指南

本项目为单人 + AI 辅助开发模式。

- 代码改动通过 `CODEX_QUEUE.md` 的 Ticket 驱动
- 每个 Ticket 完成后更新 `docs/INTERFACE_INDEX.md`（若有新增接口）
- 方案变更必须先修改 `do-what-proposal-v0.1.md`，再同步 `docs/PLAN.md` 和受影响的 `tasks/T###`
