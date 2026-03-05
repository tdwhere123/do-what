# do-what 重构总览 PLAN.md

> 基于 `do-what-proposal-v0.1.md` 生成
> 生成时间：2026-03-04
> 技术栈：全栈 TypeScript · pnpm workspace · turborepo · Node.js daemon · Electron + React · SQLite · xstate v5

---

## 架构一句话

**Core** 是唯一真相源（常驻 daemon），UI / Claude / Codex 都是客户端。
所有状态、权限仲裁、审计、Soul 记忆统一流经 Core。

---

## 四条承重墙（绝不破坏）

| # | 原则 | 工程落点 |
|---|------|---------|
| 1 | 单一真相源 | 所有状态只写 Core（Event Log + SQLite Snapshot） |
| 2 | 危险动作收口 | 文件/命令/网络 → Tools API → Core Policy Engine 仲裁 |
| 3 | 证据可溯源 | Pointer 体系 + memory_repo Git 版本锚 |
| 4 | Token 预算契约 | 协议层写死；超预算本地熔断并降级 |

---

## Monorepo 包结构

```
packages/
  protocol/     ← 事件类型 + zod schema + 状态机类型 + MCP schema（地基）
  core/         ← 常驻 daemon
  app/          ← Electron + React UI
  engines/
    claude/     ← Hooks 驱动适配器
    codex/      ← App Server 双向适配器
  soul/         ← 记忆系统
  tools/        ← Tool Runner（file/git/shell/docker/wsl）
  toolchain/    ← 工具链断言 + 可移植托管
```

---

## Epic 结构总览

| Epic | Step | 名称 | 票数 | 依赖 |
|------|------|------|------|------|
| E0 | Step 0 | Protocol & Schema（地基） | 4 | 无 |
| E1 | Step 1 | Core Skeleton | 5 | E0 |
| E1.5 | Step 1.5 | Protocol Validation Gate | 1 | E1 |
| E2 | Step 2 | Claude Engine Adapter | 3 | E1.5 |
| E3 | Step 3 | Codex Engine Adapter | 3 | E1.5 |
| E4 | Step 4 | Soul Read Path | 3 | E1 |
| E5 | Step 5 | Soul Write Path | 3 | E4 |
| E6 | Step 6 | Worktree 并行 + Integrator | 2 | E2,E3 |
| E7 | Step 7 | Memory Compiler + 自我进化 | 3 | E5 |

**总计：27 个 Ticket**

---

## Ticket 总列表

### E0 – Protocol & Schema

| ID | 标题 | 关键产物 |
|----|------|---------|
| T001 | Monorepo Scaffold | pnpm workspace, turborepo, 所有 package stub |
| T002 | Protocol: RunLifecycle + ToolExecution events | zod schema, TypeScript 类型 |
| T003 | Protocol: EngineOutput + MemoryOperation + SystemHealth + Tools API MCP schema | zod schema, MCP JSON Schema |
| T004 | Protocol: Soul MCP schema + Policy 配置格式 + StateMachine 类型 | zod schema, xstate 类型骨架 |

### E1 – Core Skeleton

| ID | 标题 | 关键产物 |
|----|------|---------|
| T005 | Core HTTP Server + SSE + session_token 鉴权 | Express/Fastify server, 127.0.0.1 鉴权中间件 |
| T006 | Core Event Bus + State Store + DatabaseWorker | EventEmitter bus, worker_threads DB worker |
| T007 | Core SQLite DDL + 迁移 | state.db schema, better-sqlite3 迁移 |
| T008 | Core xstate 状态机（Run + Engine + Approval） | RunMachine, EngineMachine, ApprovalMachine |
| T009 | Core Policy Engine 骨架 | policy.json reader, 审批判定逻辑 |

### E1.5 – Protocol Validation Gate

| ID | 标题 | 关键产物 |
|----|------|---------|
| T010 | 协议验证门控（Claude Hooks + Codex App Server smoke test） | 验证报告, 风险记录 |

### E2 – Claude Engine Adapter

| ID | 标题 | 关键产物 |
|----|------|---------|
| T011 | Hook Runner 独立进程 + 策略缓存 + 事件转发 Core | hook-runner 进程, policy-cache.json |
| T012 | Claude 适配器：deny+reroute + AgentStuckException + MCP Server 注册 | claude adapter, MCP server |
| T013 | Claude 适配器：Contract Tests（录制/回放） | fixture JSONL, vitest contract tests |

### E3 – Codex Engine Adapter

| ID | 标题 | 关键产物 |
|----|------|---------|
| T014 | Codex App Server 进程管理 + JSONL 双向通道 | codex adapter process manager |
| T015 | Codex 事件归一化 + 审批流 + Tools API MCP Server | codex event normalizer |
| T016 | Codex Contract Tests | fixture JSONL, vitest contract tests |

### E4 – Soul Read Path

| ID | 标题 | 关键产物 |
|----|------|---------|
| T017 | Soul SQLite DDL（memory_cues + memory_graph_edges + evidence_index） | soul schema, DDL migrations |
| T018 | soul.memory_search（FTS5 + 预算控制） | memory_search MCP tool |
| T019 | soul.open_pointer（Hint/Excerpt/Full）+ soul.explore_graph | open_pointer + explore_graph MCP tools |

### E5 – Soul Write Path

| ID | 标题 | 关键产物 |
|----|------|---------|
| T020 | memory_repo Git 初始化 + project_fingerprint | memory_repo manager |
| T021 | soul.propose_memory_update + Checkpoint 队列 | propose tool, checkpoint queue |
| T022 | soul.review_memory_proposal + commit + Bootstrapping Phase | review tool, bootstrapping logic |

### E6 – Worktree 并行 + Integrator

| ID | 标题 | 关键产物 |
|----|------|---------|
| T023 | GitOps 队列 + Worktree 分配 + Run 隔离 | GitOpsQueue, WorktreeManager |
| T024 | Integrator 流程 + Fast Gate（增量诊断） | Integrator, FastGate |

### E7 – Memory Compiler + 自我进化

| ID | 标题 | 关键产物 |
|----|------|---------|
| T025 | LocalHeuristics ComputeProvider（diff 熵 + 启发式 cue 草稿） | LocalHeuristics provider |
| T026 | ComputeProvider 接口 + OfficialAPI/CustomAPI + Memory Compiler 触发器 | ComputeProvider interface, Compiler |
| T027 | Lazy Pointer 自愈（Refactor Event + 按需重定位链） | pointer relocation chain |

---

## 依赖 DAG（简化）

```
T001
 └─ T002 → T003 → T004
             └─────────────┐
T005 ──────────────────────┤
T006 ──────────────────────┤
T007 ──────────────────────┤ (E1 并行执行，T006 需在T007前)
T008 ──────────────────────┤
T009 ──────────────────────┘
              ↓ E1 全部完成
             T010 (Gate)
              ↓
    ┌─────────┼─────────┐
   E2        E3        E4(可与E2/E3并行，仅依赖E1)
  T011       T014      T017
  T012       T015      T018
  T013       T016      T019
    │          │          ↓
    └────┬─────┘         E5
        E6             T020
       T023            T021
       T024            T022
                         ↓
                        E7
                       T025
                       T026
                       T027
```

---

## 关键路径（Critical Path）

```
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009
→ T010(Gate) → T011 → T012 → T014 → T015 → T023 → T024
```

预计关键路径上最长依赖链：**14 个 Ticket**。
E4/E5/E7 可以在 E2/E3 并行进行，不阻塞。

---

## 最小可运行 Demo 路径（Minimal Viable Demo）

**目标：一条完整的 end-to-end 事件流**
`SSE → Claude hook 事件 → Tool 审批 → audit log → Soul snapshot`

所需 Ticket（最少）：

```
T001 (scaffold)
→ T002 (RunLifecycle events)
→ T003 (ToolExecution + Tools API schema)
→ T005 (HTTP/SSE server)
→ T006 (Event Bus + DB Worker)
→ T007 (SQLite DDL)
→ T009 (Policy Engine)
→ T010 (Protocol Gate)
→ T011 (Hook Runner)
→ T012 (Claude adapter + deny/reroute)
```

**验收命令序列：**
```bash
# 1. 启动 Core
pnpm --filter core start

# 2. 启动 Claude Code（带 do-what hooks）
claude --config hooks.json "列出当前目录文件"

# 3. 验证 SSE 事件流
curl -N -H "Authorization: Bearer $(cat ~/.do-what/run/session_token)" \
  http://127.0.0.1:3847/events

# 预期输出（按顺序）：
# event: RunLifecycle.created  {...}
# event: ToolExecution.requested {"tool":"Bash",...}
# event: ToolExecution.denied   {"reason":"reroute_to_mcp"}
# event: ToolExecution.requested {"tool":"tools.shell_exec",...}
# event: ToolExecution.approved {...}
# event: ToolExecution.completed {...}
# event: RunLifecycle.completed {...}

# 4. 验证审计日志（SQLite）
sqlite3 ~/.do-what/state/state.db \
  "SELECT event_type, source, revision FROM event_log ORDER BY revision DESC LIMIT 10;"
```

---

## 工程纪律

1. **Protocol 是唯一真相源**：任何新 API/事件/Schema 必须先更新 `packages/protocol`，再让其他包引用。
2. **不解析 TTY**：Claude/Codex 适配器只消费 JSON 事件，永不解析 ANSI/进度条。
3. **所有 DB 写入走 DatabaseWorker**：主线程只做轻量读。
4. **Token 预算必须在注入前计算**：任何向引擎注入内容的操作必须先检查预算，超预算立即降级。
5. **Ticket 完成 = DoD + 验收命令全部通过**：lint + test + 具体验收命令三者缺一不可。

---

## 技术选型备忘

| 关注点 | 选型 | 理由 |
|--------|------|------|
| Monorepo | pnpm workspace + turborepo | 增量构建，workspace 协议 |
| DB | better-sqlite3 (WAL) | 同步API，WAL 读写分离 |
| 状态机 | xstate v5 | 可视化，TypeScript 类型完整 |
| Schema 校验 | zod | 运行时校验 + 静态类型推断 |
| 测试 | vitest | ESM native，速度快 |
| HTTP/SSE | fastify | 高性能，插件生态好 |
| 进程管理 (Win) | windows-process-tree / Job Object | Windows 进程树终止 |
| 嵌入式向量 | SQLite BLOB + 线性扫描 / hnswlib-node | 不引入额外向量DB |
