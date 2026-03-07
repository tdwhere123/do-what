# AGENTS.md — do-what v0.1.x 项目引导规则（Codex 原生）

本文件是 Codex 引擎的原生入口文档，提供项目规则、当前阶段状态和关键约束。
与 `CLAUDE.md` 内容互补（CLAUDE.md 面向 Claude Code，AGENTS.md 面向 Codex）。

---

## 项目定位

do-what 是一个 AI 编码代理编排系统：
- **Core**：常驻 daemon（127.0.0.1:3847），管理所有 Run 状态、Policy 决策和 Soul 记忆摄取
- **引擎**：Claude Code（Hooks 协议）+ Codex（App Server JSONL 协议）
- **Soul**：记忆系统，三轴模型（formation_kind/dimension/focus_surface），证据可溯源
- **目标**：让 AI 引擎在有限授权下安全执行代码任务，所有危险操作经 Policy Engine 仲裁

---

## 四条承重墙（绝对约束，不可破坏）

1. **单一真相源** — 所有状态只写 Core（Event Log + SQLite Snapshot）。UI/引擎不持有状态。
2. **危险动作收口** — 文件写入/Shell 执行/网络访问必须经 `packages/core` 的 Policy Engine 仲裁，走 Tools API MCP 通道。
3. **证据可溯源** — 所有记忆结论必须有 Pointer（`git_commit:sha + repo_path:path + symbol:name`）；结论不常驻上下文，按需展开。
4. **Token 预算契约** — 注入预算写死在 Protocol 层（Hint ≤ 600 tokens，Excerpt ≤ 500 tokens，Full ≤ 1500 tokens）；超预算必须降级，不允许静默超支。

---

## 当前阶段（v0.1.x — 进行中）

**v0.1 主线（E0–E7，T001–T027）已全部交付，40 个 soul 测试全通过。**

v0.1.x 是收敛/清理/补魂阶段，4 个 Phase：

| Phase | Tickets | 主题 | 状态 |
|-------|---------|------|------|
| Phase 0 | T028–T030 | 清理减法（shim 删除/事件合并/命名统一） | 待开始 |
| Phase 1 | T031–T037 | SOUL 补全（dormant 字段激活/ContextLens/ClaimForm/记忆动力学） | 待开始 |
| Phase 2 | T038–T041 | Core 四层分离（HotState/Projection/AckOverlay/memory_repo 降格） | 待开始 |
| Phase 3 | T042–T045 | 编排与治理（FocusSurface/IntegrationGate/GovernanceLease/拓扑约束） | 待开始 |

**实现新功能前，必须阅读对应 Task 卡片：`docs/archive/v0.1.x/tasks/T028-T045`。**
**历史实现参考：`docs/archive/v0.1/tasks/T001-T027`。**

---

## v0.1.x 关键新增约束

### 1. dormant 字段启用流程

`memory_cues` 表中以下字段已建表但 dormant，**必须经 migration v6（T031）激活后才能写入**：
- `formation_kind`：`'observation' | 'inference' | 'synthesis' | 'interaction'`
- `dimension`：`'technical' | 'behavioral' | 'contextual' | 'relational'`
- `focus_surface`：字符串（T042 后细化为结构化类型）
- `claim_draft`、`claim_confidence`、`claim_gist`、`claim_mode`、`claim_source`

**禁止在 migration v6 运行前写入上述字段。**

### 2. Claim Form 只能经 checkpoint 写入

`claim_*` 字段只能通过 `checkpoint-writer.ts` 的 `writeClaimAtCheckpoint()` 函数写入，
该函数只在接收到 `run_checkpoint` 事件时触发。
引擎不允许直接写入 `claim_*` 字段，只能提交 `ClaimDraft` 进入队列。

### 3. memory_repo 只存 Canon 级

`~/.do-what/memory/<fingerprint>/memory_repo/` Git 仓库只接受 `level = 'canon'` 的 cue 写入。
Working 级和 Consolidated 级 cue 只写 `soul.db`，不写 memory_repo。
所有 git 写入必须经过 `packages/soul/src/memory/repo-writer.ts` 的门控函数 `writeToRepo()`。

### 4. 编排拓扑约束

编排系统只允许以下 4 种拓扑，提交前经 `TopologyValidator` 验证：
1. `linear`：线性链，无分叉
2. `parallel_merge`：最多 5 个并行 Worker → 单一 Merge 节点
3. `revise_loop`：受控返回循环，最多 3 次
4. `bounded_fan_out`：最多 3 个扇出 → 收口

禁止任意自由 DAG、嵌套并行、多重循环。

---

## v0.1.x 执行计划（4 个板块，按顺序逐板块交付）

**v0.1（T001–T027）已全部完成，不要碰历史代码。**
历史 Ticket 仅供参考：`docs/archive/v0.1/tasks/T001-T027`。

当前任务全部在 `docs/archive/v0.1.x/tasks/` 下，共 18 张卡片（T028–T045）。
**每完成一个板块，等待人工验收通过后再启动下一个板块。**

---

### 板块 1：Phase 0 清理减法（T028 → T029 → T030）

**任务卡片：**
- `docs/archive/v0.1.x/tasks/T028-adapter-layer-cleanup.md`
- `docs/archive/v0.1.x/tasks/T029-event-state-reduction.md`
- `docs/archive/v0.1.x/tasks/T030-doc-naming-cleanup.md`

**执行顺序：** T028 → T029 → T030（严格串行，每步完成后跑测试再继续）

**每步完成条件：**
```bash
pnpm -w test                    # 全量测试不减少
pnpm -w exec tsc --noEmit       # 类型检查通过
```

**板块 1 验收命令：**
```bash
# 无 shim/debug 标记残留
grep -rn "TODO: remove\|// DEBUG\|// TEMP\|// shim" packages/engines/

# hook-runner 无直连 Core
grep -rn "fetch.*3847\|localhost:3847" packages/engines/claude/src/hook-runner/

# GLOSSARY.md 存在
ls packages/protocol/src/GLOSSARY.md

# 全量测试通过，行数不少于 v0.1 基线
pnpm -w test
```

---

### 板块 2：Phase 1 SOUL 补全（T031 → T032–T035 → T036 → T037）

**任务卡片（按顺序）：**
- `docs/archive/v0.1.x/tasks/T031-soul-concept-unification.md`（必须最先跑，激活 migration v6）
- `docs/archive/v0.1.x/tasks/T032-context-lens.md`
- `docs/archive/v0.1.x/tasks/T033-claim-form-memory-slot.md`
- `docs/archive/v0.1.x/tasks/T034-memory-dynamics.md`
- `docs/archive/v0.1.x/tasks/T035-graph-recall-bounded.md`
- `docs/archive/v0.1.x/tasks/T036-evidence-capsule.md`（依赖 T033）
- `docs/archive/v0.1.x/tasks/T037-user-ledger.md`（依赖 T036）

**执行顺序：**
```
T031（必须首先完成，migration v6）
  ↓
T032、T033、T034、T035（T031 完成后可并行）
  ↓
T036（T033 完成后）
  ↓
T037（T036 完成后）
```

**T031 完成门控（继续前必须验证）：**
```bash
pnpm --filter @do-what/soul exec ts-node src/db/run-migrations.ts
sqlite3 ~/.do-what/state/soul.db \
  "SELECT COUNT(*) FROM memory_cues WHERE formation_kind IS NULL"
# 必须为 0
```

**板块 2 验收命令：**
```bash
# soul 包全量测试（基线 40 个，板块 2 完成后应 >= 52 个）
pnpm --filter @do-what/soul test

# 类型检查
pnpm --filter @do-what/soul exec tsc --noEmit
pnpm --filter @do-what/protocol exec tsc --noEmit

# user ledger 文件权限验证
ls -la ~/.do-what/evidence/user_decisions.jsonl
# 预期：-rw------- (0600)

# ContextLens budget 约束（输出不超过 600 tokens）
pnpm --filter @do-what/soul test -- --testNamePattern "budget-constraint"
```

---

### 板块 3：Phase 2 Core 四层分离（T038 + T041 → T039 → T040）

**任务卡片（按顺序）：**
- `docs/archive/v0.1.x/tasks/T038-core-hot-state.md`
- `docs/archive/v0.1.x/tasks/T041-memory-repo-demotion.md`（与 T038 可并行）
- `docs/archive/v0.1.x/tasks/T039-projection-layer.md`（T038 完成后）
- `docs/archive/v0.1.x/tasks/T040-ack-overlay-sync-async.md`（T039 完成后）

**执行顺序：**
```
T038、T041（可并行）
  ↓
T039（T038 完成后）
  ↓
T040（T039 完成后）
```

**板块 3 验收命令：**
```bash
# core 包全量测试
pnpm --filter @do-what/core test

# HotState bootstrap 性能（1000 事件 < 50ms）
pnpm --filter @do-what/core test -- --testNamePattern "hot-state-bootstrap"

# 同步路径性能（P99 < 10ms）
pnpm --filter @do-what/core exec vitest bench src/__tests__/sync-path.bench.ts

# memory_repo 只写 canon（Working 级跳过验证）
pnpm --filter @do-what/soul test -- --testNamePattern "memory-tier"

# 全量测试
pnpm -w test
```

---

### 板块 4：Phase 3 编排与治理（T042 + T045 → T043 → T044）

**任务卡片（按顺序）：**
- `docs/archive/v0.1.x/tasks/T042-focus-surface-baseline-lock.md`
- `docs/archive/v0.1.x/tasks/T045-orchestration-template-constraints.md`（与 T042 可并行）
- `docs/archive/v0.1.x/tasks/T043-integration-gate.md`（T042 完成后）
- `docs/archive/v0.1.x/tasks/T044-governance-lease.md`（T043 完成后）

**执行顺序：**
```
T042、T045（可并行）
  ↓
T043（T042 完成后）
  ↓
T044（T043 完成后）
```

**板块 4 验收命令：**
```bash
# 四种合法拓扑验证
pnpm --filter @do-what/core test -- --testNamePattern "topology-validator"

# 三类漂移判定
pnpm --filter @do-what/core test -- --testNamePattern "integration-gate"

# 防活锁：第二次 Hard-Stale 降级串行
pnpm --filter @do-what/core test -- --testNamePattern "reconcile-tracker"

# GovernanceLease migration 验证
sqlite3 ~/.do-what/state/state.db ".schema governance_leases"

# 全量测试（最终验收）
pnpm -w test
pnpm -w exec tsc --noEmit
```

---

## 构建与测试命令

```bash
# 安装依赖（首次或添加新包后）
pnpm install

# 构建全部包
pnpm -w build

# 构建单个包
pnpm --filter @do-what/<pkg> build

# 全量测试
pnpm -w test

# 单包测试
pnpm --filter @do-what/<pkg> test

# 按名称过滤测试（调试单个 case）
pnpm --filter @do-what/<pkg> test -- --testNamePattern "<pattern>"

# 类型检查（每次写完代码后必须跑）
pnpm --filter @do-what/<pkg> exec tsc --noEmit

# 启动 Core（验收用）
pnpm --filter @do-what/core start
# session_token 位置：~/.do-what/run/session_token
```

---

## 包结构

```
packages/
  protocol/        ← 所有 zod schema + MCP schema + 状态机类型（先写这里）
  core/            ← 常驻 daemon（HTTP/SSE/EventBus/SQLite/xstate）
  app/             ← Electron + React UI（本阶段不实现）
  engines/
    claude/        ← Claude Code 适配器（Hook Runner + MCP Server）
    codex/         ← Codex 适配器（App Server JSONL 通道）
  soul/            ← 记忆系统（SQLite + Git + Compiler）
  tools/           ← Tool Runner（file/git/shell/docker/wsl）
  toolchain/       ← 工具链断言与托管
```

包名格式：`@do-what/<name>`（例如 `@do-what/protocol`、`@do-what/core`）。

---

## 不可违反的规则

### 1. Protocol 是唯一类型真相源
新增任何接口/事件/Schema，**必须先在 `packages/protocol/src/` 中写 zod schema**，其他包通过 `@do-what/protocol` 引用。禁止在 core/soul/engines 中单独定义类型。

### 2. SQLite 写操作只走 DatabaseWorker
`packages/core` 和 `packages/soul` 各有独立的 `worker_threads` DatabaseWorker。主线程只用只读连接。禁止在主线程调用 `better-sqlite3` 的写方法。

### 3. Hook Runner 不能 import Core 模块
`packages/engines/claude/src/hook-runner.ts` 是独立进程，不能引用 `packages/core` 的任何模块。策略决策必须 < 50ms（纯缓存路径，无 async/await）。

### 4. 引擎不能直接写工作区
Claude/Codex 只在分配的 `worktree`（`~/.do-what/worktrees/<runId>/`）中操作。合入主工作区由 Integrator 串行完成。

### 5. 所有 zod schema 使用 `.passthrough()`
引擎事件 schema 必须容忍未知字段（CLI 版本随时更新）。关键字段缺失时降级 + warn，不 throw。

### 6. 危险操作走 Tools API 通道
Shell 执行 / 文件写入 / 网络请求必须通过 `tools.shell_exec` / `tools.file_write` / `tools.web_fetch` MCP 工具，经 Policy Engine 仲裁。禁止在适配器中直接 `child_process.exec` 执行用户命令。

---

## 每个 Ticket 完成前的检查清单

- [ ] `pnpm --filter @do-what/<pkg> exec tsc --noEmit` 无错误
- [ ] `pnpm --filter @do-what/<pkg> test` 全部通过
- [ ] 运行 `docs/archive/v0.1.x/tasks/T###-*.md` 中 **DoD + 验收命令** 段的所有命令，输出符合预期
- [ ] 没有修改本 Ticket **文件清单** 之外的文件
- [ ] 更新 `docs/INTERFACE_INDEX.md`（若有新增/修改接口，见下方规则）
- [ ] 更新 `docs/archive/v0.1.x/README.md` 中对应 Ticket 的状态（待开始 → 完成）

---

## 文档维护规则

**强制提醒：只要新增/修改接口（event schema、MCP schema、HTTP、DB、状态机类型），必须同步更新 `docs/INTERFACE_INDEX.md` 并追加变更记录。**

### docs/INTERFACE_INDEX.md — 接口索引

**触发更新的操作：**

| 操作类型 | 需要更新的章节 |
|---------|--------------|
| 新增/修改 zod event schema | Protocol 事件类型 对应表格行 |
| 新增/修改 MCP tool schema | MCP Tools 对应表格行 |
| 新增/修改 Core HTTP 端点 | Core HTTP 端点 表格 |
| 新增/修改 SQLite 表或列 | SQLite 表结构 对应行（标注迁移版本）|
| 新增/修改 xstate 状态或转换 | xstate 状态机 对应图和说明 |
| 新增/修改 Pointer 格式 | Pointer 格式规范 |
| 新增内部通信消息类型 | 内部通信协议 对应表格 |

**更新格式要求：**
- 在对应表格中直接修改行（不要追加重复行）
- 在文件末尾的**变更记录**表追加一行：`日期 · T### · 变更说明`
- 若新增字段有枚举值，在表格的"关键字段"列或注释中列出所有合法值

**不需要更新的情况：**
- 内部实现细节变更（算法、性能优化、重构，接口签名不变）
- 测试文件变更
- 配置常量变更（不影响对外接口）

### README.md — 项目说明

**触发更新的操作：**

| 操作类型 | 需要更新的内容 |
|---------|--------------|
| 某个 Epic 的全部 Ticket 完成 | **项目状态**表格中对应行：`🔲 待实现` → `✅ 完成` |
| 快速开始步骤发生变化 | **快速开始**章节 |
| 新增重要的运行时文件或目录 | **运行时文件布局**章节 |

**不需要更新 README 的情况：**
- 单个 Ticket 完成（只在 Epic 全部完成时更新状态）
- 内部实现细节
- docs/ 下的文档变更（README 只维护文档索引表，索引内容不变则不更新）

---

## 代码规范（Code Conventions）

### TypeScript 命名规范

| 类别 | 规则 | 示例 |
|------|------|------|
| Interface | PascalCase，**禁止** `I` 前缀 | `RunContext`, `EventBus` |
| Type alias | PascalCase | `RunId`, `ToolName` |
| Zod schema 变量 | PascalCase + `Schema` 后缀 | `BaseEventSchema`, `PolicyRuleSchema` |
| Zod 推断类型 | PascalCase，与 schema 同名去掉后缀 | `BaseEvent`（from `BaseEventSchema`）|
| 函数 / 方法 | camelCase，动词开头 | `createReadConnection`, `broadcastEvent` |
| 模块级常量 | SCREAMING_SNAKE_CASE | `MAX_QUEUE_LENGTH`, `DEFAULT_PORT` |
| 文件名 | kebab-case | `database-worker.ts`, `run-types.ts` |
| 测试文件 | 与被测文件同名 + `.test.ts` | `run.test.ts` |
| 类 | PascalCase | `WorkerClient`, `SseManager` |
| 枚举值（zod enum） | snake_case 字符串 | `'agent_stuck'`, `'claude'` |

### Zod Schema 规范

```typescript
// ✅ 正确
export const RunStartedEventSchema = z.object({ ... });
export type RunStartedEvent = z.infer<typeof RunStartedEventSchema>;

// ❌ 禁止：直接 interface，跳过 zod schema
export interface RunStartedEvent { ... }

// ✅ 所有引擎事件 schema 必须加 .passthrough()
export const EngineTokenEventSchema = z.object({ ... }).passthrough();

// ✅ timestamp 字段必须用 .datetime() 强制 ISO 8601
timestamp: z.string().datetime(),

// ✅ 同一语义字段在所有 schema 中类型约束必须一致
// 正确：所有涉及引擎类型的字段统一用同一枚举
engineType: z.enum(['claude', 'codex']),
// ❌ 禁止：同字段一处 z.enum 一处 z.string
```

### 错误处理规范

```typescript
// ❌ 禁止：空 catch 静默吞噬
try { ... } catch { return []; }

// ✅ 正确：记录 warn，明确区分可恢复场景
try {
  return stmt.all(revision);
} catch (err) {
  logger.warn({ err }, 'getEventsSince failed, returning empty');
  return [];
}

// ✅ 不可恢复时直接 throw
throw new Error(`DatabaseWorker init failed: ${String(err)}`);
```

### 不可变性规范（xstate context）

```typescript
// ❌ 禁止：原地修改 context 数组
context.queue.push(item);

// ✅ 正确：spread 产生新数组
assign({ queue: ({ context }) => [...context.queue, item] })

// ✅ 类型层面强制 readonly
export interface ApprovalContext {
  readonly queue: readonly ApprovalItem[];
  readonly activeItem?: ApprovalItem;
}
```

### SQLite 连接规范

```typescript
// ❌ 禁止：只读连接以读写模式打开
new Database(path, { readonly: false })

// ✅ 正确：readonly: true + query_only 双重防护
const db = new Database(path, { readonly: true });
db.pragma('query_only = true');
```

### 存根/占位实现规范

```typescript
// ❌ 禁止：无注释的空存根
app.get('/state', async () => { return {}; });

// ✅ 正确：附加 TODO 引用 Ticket 编号
app.get('/state', async () => {
  // TODO(T008): implement state snapshot
  return { _stub: true };
});
```

### 禁止模式清单

- 禁止在主线程调用 `better-sqlite3` 写方法（`run` / `prepare + stmt.run`）
- 禁止在 `worker_threads` 子文件中 `import` `packages/core` 任何模块
- 禁止空 `catch {}` 或无日志的 `catch { return fallback }`
- 禁止同一语义字段在不同 schema 中使用不同约束宽度（如一处 `z.enum` 一处 `z.string`）
- 禁止 `any` 类型（改用 `unknown` + 类型收窄）
- 禁止文件超过 800 行（按功能拆分）
- 禁止函数超过 50 行（提取辅助函数）
- 禁止在 Worker `close()` 内部创建新 Worker（关闭就是关闭，不替换）

---

## 关键文件速查

| 需要了解什么 | 读哪里 |
|-------------|--------|
| v0.1.x Ticket 的完整要求 | `docs/archive/v0.1.x/tasks/T###-*.md`（T028–T045） |
| v0.1 历史 Ticket | `docs/archive/v0.1/tasks/T###-*.md`（T001–T027，参考用） |
| 所有接口/端点/表结构速查 | `docs/INTERFACE_INDEX.md` |
| 事件类型 / zod schema 源码 | `packages/protocol/src/events/` |
| MCP tool schema 源码 | `packages/protocol/src/mcp/` |
| Policy 默认配置 | `packages/protocol/src/policy/defaults.ts` |
| 状态机 context/event 类型 | `packages/protocol/src/machines/` |
| Core HTTP 端点实现 | `packages/core/src/server/routes.ts` |
| SQLite 表结构（Core） | `packages/core/src/db/migrations/v1.ts` |
| SQLite 表结构（Soul） | `packages/soul/src/db/migrations/v1.ts` |
