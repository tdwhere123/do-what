# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 项目状态

**当前阶段：v0.1.x 进行中（Phase 0–1 已完成，Phase 2–3 待实现）。**

规划文档：
- `docs/archive/v0.1/do-what-proposal-v0.1.md` — v0.1 完整方案（归档，约 800 行，所有架构决策来源）
- `docs/archive/v0.1/do-what-v0.1.x.md` — v0.1.x 收敛/清理方案（归档）
- `docs/PLAN.md` — Epic/Ticket 总览 + 依赖 DAG + 关键路径 + **当前进度表**
- `docs/archive/v0.1/tasks/T001~T027` — v0.1 Ticket 详细实现卡（归档，参考用）
- `docs/archive/v0.1/CODEX_QUEUE.md` — v0.1 可直接执行的 Codex 指令块
- `docs/archive/v0.1.x/tasks/T028~T045` — v0.1.x 每个 Ticket 的详细实现卡（含文件清单、DoD、验收命令）
- `AGENTS.md` — Codex 原生引导规则（四条承重墙 + v0.1.x 阶段状态 + 新增约束）

已完成（v0.1）：E0（T001–T004）、E1（T005–T009）、E1.5/T010 门控、E2（T011–T013）、E3（T014–T016）、E4（T017–T019）、E5（T020–T022）、E6（T023–T024）、**E7（T025–T027）**。
**全部 E0–E7 已交付，40 个 soul 测试全通过。**

v0.1.x 阶段进度：
- Phase 0（T028–T030）：清理减法 — 已完成
- Phase 1（T031–T037）：SOUL 补全 — 已完成（61/61 soul 测试，29/29 protocol 测试）
- Phase 2（T038–T041）：Core 四层分离 — 已完成（core 47/47 测试，soul 61/61 测试）
- Phase 3（T042–T045）：编排与治理 — 待开始

**若任务涉及 v0.1 历史实现，先读 `docs/archive/v0.1/tasks/` 归档 Ticket；若是 v0.1.x 新实现，读 `docs/archive/v0.1.x/tasks/`。**

---

## 构建与测试命令

以下命令基于规划的技术栈（pnpm workspace + turborepo + vitest），代码编写后适用：

```bash
# 安装依赖
pnpm install

# 构建所有包（增量，带缓存）
pnpm -w build

# 构建单个包
pnpm --filter @do-what/core build

# 全量测试
pnpm -w test

# 运行单包测试
pnpm --filter @do-what/protocol test

# 运行单个测试文件
pnpm --filter @do-what/core exec vitest run src/__tests__/run-machine.test.ts

# 按名称过滤测试
pnpm --filter @do-what/soul test -- --testNamePattern "search"

# 类型检查（全量）
pnpm -w exec tsc --noEmit

# 启动 Core daemon（开发模式）
pnpm --filter @do-what/core start
# Core 监听 127.0.0.1:3847，token 在 ~/.do-what/run/session_token
```

---

## 四条承重墙（绝对约束，不可破坏）

1. **单一真相源** — 所有状态只写 Core（Event Log + SQLite Snapshot）。UI/引擎不持有状态。
2. **危险动作收口** — 文件写入/Shell 执行/网络访问必须经 `packages/core` 的 Policy Engine 仲裁，走 Tools API MCP 通道（`tools.shell_exec`、`tools.file_write` 等），不走引擎原生工具。
3. **证据可溯源** — 所有记忆结论必须有 Pointer（`git_commit:sha + repo_path:path + symbol:name`）；结论不常驻上下文，按需展开。
4. **Token 预算契约** — 注入预算写死在 Protocol 层（Hint ≤ 600 tokens，Excerpt ≤ 500 tokens，Full ≤ 1500 tokens）；超预算必须降级，不允许静默超支。

---

## 架构总览

```
packages/
  protocol/     ← 唯一类型真相源（zod schema + MCP schema + 状态机类型）
  core/         ← 常驻 daemon（Event Bus + SQLite + xstate + Policy Engine）
  app/          ← Electron + React UI（纯客户端，只连 Core）
  engines/
    claude/     ← Hooks 驱动（hook-runner 独立进程 + MCP Server）
    codex/      ← App Server 双向 JSONL 通道
  soul/         ← 记忆系统（SQLite + Git memory_repo + Compiler）
  tools/        ← Tool Runner（file/git/shell/docker/wsl）
  toolchain/    ← 工具链断言 + 可移植 binary 托管
```

**通信方向（单向，不可反转）：**
```
UI → Core（HTTP + SSE，127.0.0.1:3847，Bearer token 鉴权）
Claude/Codex → Core（通过 hook 事件 / app-server 事件回传）
Core → 引擎（spawn 子进程，Job Object 管理进程树）
```

**所有运行时事件必须流经 `packages/core` 的 EventBus，UI 只订阅渲染。**

---

## 关键实现规则

**`packages/protocol` 是所有类型的唯一来源：**
- 新增任何 API/事件/Schema，必须先在 `packages/protocol/src/` 中定义 zod schema，其他包通过 `@do-what/protocol` 引用。
- 不允许在 core/soul/engines 中单独定义接口类型——这会破坏 Protocol 单一真相源。

**SQLite 写操作必须走 `DatabaseWorker`（`worker_threads`）：**
- `packages/core` 和 `packages/soul` 各有独立的 DatabaseWorker 线程。
- 主线程只做轻量只读查询（`PRAGMA query_only=true` 的独立连接）。
- 违反此规则会导致 SQLite 同步 API 阻塞 SSE 事件推送。

**状态机（xstate v5）：**
- 三台机器：`RunMachine`（每个 Run 一实例）、`EngineMachine`（全局各一台）、`ApprovalMachine`（全局一台）。
- 所有 Machine 的 context/event 类型来自 `@do-what/protocol/src/machines/`。
- Machine action 中的 DB 写入必须是 fire-and-forget（不 await），否则阻塞状态转换。

**Hook Runner（Claude 适配器）：**
- 独立进程，与 Core 物理隔离。
- 决策路径必须 < 50ms（纯缓存查询），不能有任何 async/await 导致的延迟。
- 不能 import 任何 `packages/core` 模块。

**两种引擎接入方式（不可混淆）：**
- Claude Code：Hook 事件（PreToolUse/PostToolUse stdin/stdout JSON）→ deny + reroute 到 MCP 工具
- Codex：App Server JSONL 双向通道（`codex app-server --stdio`）→ 事件归一化

**zod schema 容错规则：**
- 所有引擎事件 schema 必须使用 `.passthrough()`，保持对未知字段的前向兼容。
- 关键字段缺失/类型错误时：降级 + 上报 warn，不 throw（不能因 CLI 版本更新崩溃适配器）。

**v0.1.x 新增约束：**
- **dormant 字段启用**：`formation_kind`/`dimension`/`focus_surface`/`claim_*` 必须经 migration v6（T031）激活，不允许在 v5 schema 上直接写入。
- **Claim 写入门控**：`claim_*` 字段只能通过 `checkpoint-writer.ts` 的 `writeClaimAtCheckpoint()` 写入（仅 `run_checkpoint` 事件触发），引擎不得直接写入。
- **memory_repo 降格**：Working/Consolidated 级 cue 只写 SQLite；只有 `level = 'canon'` 的 cue 才经 `writeToRepo()` 门控写入 memory_repo。
- **编排拓扑约束**：仅允许 4 种合法拓扑（linear/parallel_merge ≤5/revise_loop ≤3/bounded_fan_out ≤3），提交前经 `TopologyValidator` 验证，禁止任意自由 DAG。

---

## 数据存储

| 文件 | 用途 | 负责包 |
|------|------|--------|
| `~/.do-what/state/state.db` | Run/Workspace/Agent/Approval/Event Log | `packages/core` |
| `~/.do-what/state/soul.db` | memory_cues(包含三轴模型及dormant字段)/edges/evidence_index/proposals | `packages/soul` |
| `~/.do-what/memory/<fingerprint>/memory_repo/` | Git 版本锚（证据真相层）| `packages/soul` |
| `~/.do-what/run/session_token` | Core HTTP 鉴权 token（权限 600）| `packages/core` |
| `~/.do-what/run/hook-policy-cache.json` | Hook Runner 策略缓存（无 Core 即可读）| `packages/core` 写，`packages/engines/claude` 读 |
| `~/.do-what/policy.json` | 工具审批策略配置 | `packages/core` |
| `~/.do-what/worktrees/<runId>/` | 每个 Run 的 git worktree（临时）| `packages/tools` |
| `~/.do-what/evidence/user_decisions.jsonl` | 用户决策 append-only ledger（T037 新增）| `packages/soul` |
