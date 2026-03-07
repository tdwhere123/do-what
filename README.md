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

> **当前阶段：v0.1 已完成，历史规划资料已归档，当前仓库作为后续规划基线。**

| 阶段 | 状态 |
|------|------|
| 方案定稿（v0.1） | ✅ 完成 |
| Ticket 拆解（T001~T027） | ✅ 完成 |
| E0 Protocol & Schema | ✅ 完成 |
| E1 Core Skeleton | ✅ 完成 |
| E1.5 Protocol Validation Gate | ✅ 完成 |
| E2 Claude Engine Adapter | ✅ 完成 |
| E3 Codex Engine Adapter | ✅ 完成 |
| E4 Soul Read Path | ✅ 完成 |
| E5 Soul Write Path | ✅ 完成 |
| E6 Worktree + Integrator | ✅ 完成 |
| E7 Memory Compiler | ✅ 完成 |

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

> v0.1 主线已完成；运行与构建产物默认不入库，需要时本地重新生成。

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
| [`docs/archive/v0.1/README.md`](./docs/archive/v0.1/README.md) | v0.1 归档索引与摘要 |
| [`docs/archive/v0.1/do-what-proposal-v0.1.md`](./docs/archive/v0.1/do-what-proposal-v0.1.md) | v0.1 主方案（归档） |
| [`docs/archive/v0.1/do-what-v0.1.x.md`](./docs/archive/v0.1/do-what-v0.1.x.md) | v0.1.x 收敛方案（归档） |
| [`docs/PLAN.md`](./docs/PLAN.md) | Epic/Ticket 总览、依赖 DAG、关键路径 |
| [`docs/INTERFACE_INDEX.md`](./docs/INTERFACE_INDEX.md) | 所有接口、事件、MCP Tool、HTTP 端点、DB 表索引 |
| [`docs/archive/v0.1/CODEX_QUEUE.md`](./docs/archive/v0.1/CODEX_QUEUE.md) | v0.1 的 Codex 执行指令块（归档） |
| [`docs/archive/v0.1/tasks/`](./docs/archive/v0.1/tasks/) | v0.1 的 T001~T027 Ticket 卡片（归档） |
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

- v0.1 的执行队列、Ticket 卡片与方案文档已归档到 `docs/archive/v0.1/`
- 若需追溯既有接口或实现依据，优先查看 `docs/INTERFACE_INDEX.md`、`docs/PLAN.md` 与 `docs/archive/v0.1/`
- 后续规划建议新增独立文档，不回写 v0.1 归档材料
