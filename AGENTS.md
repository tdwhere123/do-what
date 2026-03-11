# AGENTS.md — do-what v0.1-UI 项目引导规则（Codex 原生）

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

## 当前阶段（v0.1-UI — 进行中）

**后端全部完成：v0.1（E0–E7）+ v0.1.x（Phase 0–3），core 104/104，soul 61/61。**
**当前任务：`packages/app` Electron + React UI 工程，共 34 个 Ticket。**
**按仓库现状核对（2026-03-11）：`docs/archive/v0.1-UI/task-breakdown.md` 已记录 `T001A–T012` 完成，下一步从 `T013` 开始。**

| 分组 | Tickets | 主题 | 状态 |
|------|---------|------|------|
| Foundation | T001A–T007 | scaffold / contract / mock / token / HTTP client / SSE client | 已完成 |
| State Stores | T008–T012 | hot-state / projection / pending / ack-overlay / ui-store | 已完成 |
| Workbench / UI | T013–T029 | Workbench Shell / Timeline / Approval / Inspector / Soul / Settings | 进行中（下一步 T013） |
| Core API 对齐 | T030–T032 | snapshot surface / command routes / SSE envelope | 待开始 |
| 验收 / 清理 | T033–T034 | 集成测试 / 视觉对照 + 清理 UI/ | 待开始 |



### 进度维护与上下文压缩规则

1. **AGENTS 不允许落后于仓库真实进度**：每完成一个 UI Ticket，至少同步更新本节的“当前阶段”与“已完成上下文压缩”。
2. **task-breakdown 是任务状态真相源**：每完成一个 Ticket，必须同步更新 `docs/archive/v0.1-UI/task-breakdown.md` 对应状态；若 `AGENTS.md` 与其冲突，以仓库实际代码 + `task-breakdown` 为准，并立即修正 `AGENTS.md`。
3. **接口变更必须同步索引**：凡新增或修改 protocol schema、Core HTTP、SSE envelope、MCP schema、SQLite、状态机类型，提交前必须更新 `docs/INTERFACE_INDEX.md` 并追加变更记录。


**实现任何 UI Ticket 前，必须先读：**
- `docs/archive/v0.1-UI/frontend_backend_contract_v0.1.md`（接口/事件流/状态来源）
- `docs/archive/v0.1-UI/workbench_state_model_v0.1.md`（状态分层）
- 对应任务卡 `docs/archive/v0.1-UI/tasks/T###-*.md`

**历史实现参考（只读）：**
- v0.1 后端：`docs/archive/v0.1/tasks/T001-T027`
- v0.1.x 收敛：`docs/archive/v0.1.x/tasks/T028-T045`

---

## v0.1-UI 关键约束

### 1. Core 单一真相源（UI 侧）

前端**不得**自行推断关键控制态，读取来源严格分层：

| 数据类型 | 来源 | 禁止 |
|---------|------|------|
| 控制态（Run status / policy / lease） | `CoreHotState`（SSE + HTTP snapshot） | 前端自行推导 |
| 展示态（timeline events / files diff / plan diff） | `ProjectionStore`（HTTP query + SSE merge） | 把 Projection 当控制态 |
| 本地 UI 态（active panel / modal / theme） | `UiShellStore`（Zustand，纯本地） | 与 Core 同步 |
| 待确认命令 | `PendingCommandStore`（乐观 tail） | 写回 Core |

### 2. message 不进入 ackOverlayStore

- message optimistic 只来自 `pendingCommandStore`
- Timeline 只追加 optimistic tail，不做 K-V overlay
- `ackOverlayStore` 只跟踪 command → ack 的生命周期

### 3. overlay 超时不能静默删除

- `revision >= ack.revision` 时触发 `reconciling`，必须经 probe/refetch
- 不一致则进入 `desynced` 状态，必须提供 `Retry Sync` 或 `Dismiss/Rollback` 出路
- 禁止把 overlay item 静默删除（会造成乐观渲染失忆）

### 4. Timeline 必须支持分页

- 默认只拉最新一页（`beforeRevision + limit`）
- 历史翻页不得打乱尾部 optimistic tail
- 对应任务：T018、T019、T020、T030

### 5. Settings lease 打断 dirty form

- 先保存 interrupted draft → 再锁字段 → 再 refresh → 再提示用户
- 不允许直接覆盖用户未提交的配置变更

### 6. 工程前提（T001A 已决策，不可改变）

| 关注点 | 选型 |
|--------|------|
| bundler | Vite |
| Electron dev runner | Electron Forge + Vite 插件 |
| packaging | Electron Forge makers |
| routing | React Router + HashRouter |
| state | TanStack Query（服务端）+ Zustand（本地）|
| styling | 全局 design token (CSS variables) + CSS Modules |

以上前提直接影响所有 `packages/app` 任务，**不在任务实现阶段重新讨论**。

---

## v0.1-UI 执行计划（6 批，按顺序逐批交付）

**历史后端代码（packages/core / soul / engines / tools / protocol）已全部完成，不要改动。**
当前任务全部在 `docs/archive/v0.1-UI/tasks/` 下，共 34 个 Ticket（T001A–T034）。
**每完成一批，等待人工验收通过后再启动下一批。**

批次依赖关系：第1批→第2批→第3批→（第4批 + 第5批 可同时跑）→第6批

---

### 第1批：Foundation — scaffold / contract / mock / token / client（T001B–T007）

**任务卡片（7 张，T001A 已完成）：**
- `docs/archive/v0.1-UI/tasks/T001B-packages-app-bootstrap.md`
- `docs/archive/v0.1-UI/tasks/T002-frontend-contract-baseline.md`
- `docs/archive/v0.1-UI/tasks/T003-mock-fixtures-and-adapters.md`
- `docs/archive/v0.1-UI/tasks/T004-design-tokens-and-theme-base.md`
- `docs/archive/v0.1-UI/tasks/T005-svg-icon-and-empty-assets.md`
- `docs/archive/v0.1-UI/tasks/T006-core-http-client.md`
- `docs/archive/v0.1-UI/tasks/T007-core-event-client-and-session-guard.md`

**执行顺序：**
```
T001B → T002 → T003/T004（并行）→ T005/T006/T007（并行）
```

**验收命令：**
```bash
pnpm --filter @do-what/app exec tsc --noEmit
pnpm --filter @do-what/protocol exec tsc --noEmit
pnpm --filter @do-what/app test -- --testNamePattern "mock-adapter"
pnpm --filter @do-what/app test -- --testNamePattern "event-client"
```

---

### 第2批：State Stores — hot-state / projection / pending / ack-overlay / ui-store（T008–T012）

**任务卡片（5 张）：**
- `docs/archive/v0.1-UI/tasks/T008-hot-state-store.md`
- `docs/archive/v0.1-UI/tasks/T009-projection-store.md`
- `docs/archive/v0.1-UI/tasks/T010-pending-command-store.md`
- `docs/archive/v0.1-UI/tasks/T011-ack-overlay-and-reconciliation.md`
- `docs/archive/v0.1-UI/tasks/T012-ui-store-and-settings-bridge.md`

**执行顺序：**
```
T008/T009/T012（并行）→ T010（T008 后）→ T011（T009+T010 后）
```

**验收命令：**
```bash
pnpm --filter @do-what/app test -- --testNamePattern "store"
pnpm --filter @do-what/app test -- --testNamePattern "ack-overlay"
pnpm --filter @do-what/app exec tsc --noEmit
```

---

### 第3批：Workbench Shell + Create Run — shell骨架 / sidebar / empty-states / modal（T013–T017）

**任务卡片（5 张）：**
- `docs/archive/v0.1-UI/tasks/T013-workbench-shell-bootstrap.md`（必须最先完成，是所有后续 UI 的父容器）
- `docs/archive/v0.1-UI/tasks/T014-workspace-sidebar.md`
- `docs/archive/v0.1-UI/tasks/T015-workbench-empty-states.md`
- `docs/archive/v0.1-UI/tasks/T016-template-registry-and-create-run-draft.md`
- `docs/archive/v0.1-UI/tasks/T017-create-run-modal-and-command-flow.md`

**执行顺序：**
```
T013 → T014/T015/T016（并行）→ T017（T014+T016 后）
```

**验收命令：**
```bash
pnpm --filter @do-what/app test -- --testNamePattern "workbench-shell"
pnpm --filter @do-what/app test -- --testNamePattern "create-run"
pnpm --filter @do-what/app exec tsc --noEmit
```

---

### 第4批：Timeline + Approval — 时间线分页 / 渲染 / optimistic tail / 审批卡（T018–T021）

> 第3批完成后可与第5批同时启动（各自独立 worktree）。

**任务卡片（4 张）：**
- `docs/archive/v0.1-UI/tasks/T018-timeline-data-model-and-pagination.md`
- `docs/archive/v0.1-UI/tasks/T019-timeline-render-merged-and-threaded.md`
- `docs/archive/v0.1-UI/tasks/T020-timeline-optimistic-message-tail.md`
- `docs/archive/v0.1-UI/tasks/T021-approval-card-and-cli-overlay.md`

**执行顺序：**
```
T018 → T019/T021（并行）→ T020（T018+T011 后）
```

**验收命令：**
```bash
pnpm --filter @do-what/app test -- --testNamePattern "timeline"
pnpm --filter @do-what/app test -- --testNamePattern "approval"
pnpm --filter @do-what/app exec tsc --noEmit
```

---

### 第5批：Inspector + Governance + Soul + Settings（T022–T029）

> 第3批完成后可与第4批同时启动（各自独立 worktree）。

**任务卡片（8 张，4 个子模块，顺序执行）：**
- `docs/archive/v0.1-UI/tasks/T022-inspector-files-plan-history.md`
- `docs/archive/v0.1-UI/tasks/T023-inspector-collaboration-and-git.md`
- `docs/archive/v0.1-UI/tasks/T024-governance-checkpoint-panels.md`
- `docs/archive/v0.1-UI/tasks/T025-drift-resolution-panels.md`
- `docs/archive/v0.1-UI/tasks/T026-soul-panel-and-memory-projections.md`
- `docs/archive/v0.1-UI/tasks/T027-memory-governance-and-proposal-review.md`
- `docs/archive/v0.1-UI/tasks/T028-settings-query-tabs.md`
- `docs/archive/v0.1-UI/tasks/T029-settings-lease-interruption.md`

**执行顺序：**
```
T022 → T023（Inspector）
T024/T025（Governance，T022 后并行）
T026 → T027（Soul）
T028 → T029（Settings）
```

**验收命令：**
```bash
pnpm --filter @do-what/app test -- --testNamePattern "inspector"
pnpm --filter @do-what/app test -- --testNamePattern "governance"
pnpm --filter @do-what/app test -- --testNamePattern "soul-panel"
pnpm --filter @do-what/app test -- --testNamePattern "settings"
pnpm --filter @do-what/app exec tsc --noEmit
```

---

### 第6批：Core API 对齐 + 集成验收 + 清理（T030–T034）

> 必须等第4批 + 第5批全部通过后再启动。需要 Core daemon 实际运行（`pnpm --filter @do-what/core start`）。

**任务卡片（5 张，严格串行）：**
- `docs/archive/v0.1-UI/tasks/T030-core-api-snapshot-and-query-surface.md`
- `docs/archive/v0.1-UI/tasks/T031-core-command-and-probe-routes.md`
- `docs/archive/v0.1-UI/tasks/T032-core-sse-envelope-and-event-alignment.md`
- `docs/archive/v0.1-UI/tasks/T033-real-core-integration-tests.md`
- `docs/archive/v0.1-UI/tasks/T034-visual-parity-and-ui-design-source-cleanup.md`

**执行顺序：** T030 → T031 → T032 → T033 → T034（严格串行）

**验收命令：**
```bash
# 后端测试不退步
pnpm --filter @do-what/core test
pnpm --filter @do-what/soul test
pnpm --filter @do-what/core exec tsc --noEmit

# 前后端集成测试（mock → real Core）
pnpm --filter @do-what/app test -- --testNamePattern "integration"

# UI/ 临时设计源清理确认（T034 完成后应已移除）
ls UI/

# 全量验收
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
  protocol/        ← 所有 zod schema + MCP schema + 状态机类型（类型真相源）
  core/            ← 常驻 daemon（HTTP/SSE/EventBus/SQLite/xstate）【已完成，勿动】
  app/             ← Electron + React UI【当前开发主战场】
    src/main/      ← Electron 主进程
    src/preload/   ← contextBridge IPC
    src/renderer/  ← React renderer 入口
    src/app/       ← 路由/页面（workbench-page / settings-page）
    src/stores/    ← Zustand stores（hot-state / projection / pending / ack / ui-shell）
    src/services/  ← HTTP client / SSE client / session-guard
    src/components/← 共享组件
    src/styles/    ← design tokens + global CSS + CSS Modules
  engines/
    claude/        ← Claude Code 适配器【已完成，勿动】
    codex/         ← Codex 适配器【已完成，勿动】
  soul/            ← 记忆系统【已完成，勿动】
  tools/           ← Tool Runner【已完成，勿动】
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
- [ ] 运行 `docs/archive/v0.1-UI/tasks/T###-*.md` 中 **DoD + 验收命令** 段的所有命令，输出符合预期
- [ ] 没有修改本 Ticket **文件清单** 之外的文件（历史后端代码禁止改动）
- [ ] 若新增/修改 Core HTTP 端点或 protocol 类型，更新 `docs/INTERFACE_INDEX.md`
- [ ] 更新 `docs/archive/v0.1-UI/task-breakdown.md` 中对应 Ticket 的状态（待实现 → 完成）

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
| v0.1-UI 前后端契约 | `docs/archive/v0.1-UI/frontend_backend_contract_v0.1.md` |
| v0.1-UI 状态分层模型 | `docs/archive/v0.1-UI/workbench_state_model_v0.1.md` |
| v0.1-UI 任务总览 | `docs/archive/v0.1-UI/task-breakdown.md` |
| v0.1-UI Ticket 的完整要求 | `docs/archive/v0.1-UI/tasks/T###-*.md`（T001A–T034） |
| v0.1.x 历史 Ticket（参考用） | `docs/archive/v0.1.x/tasks/T###-*.md`（T028–T045） |
| v0.1 历史 Ticket（参考用） | `docs/archive/v0.1/tasks/T###-*.md`（T001–T027） |
| 所有接口/端点/表结构速查 | `docs/INTERFACE_INDEX.md` |
| 事件类型 / zod schema 源码 | `packages/protocol/src/events/` |
| MCP tool schema 源码 | `packages/protocol/src/mcp/` |
| 状态机 context/event 类型 | `packages/protocol/src/machines/` |
| Core HTTP 端点实现 | `packages/core/src/server/routes.ts` |
| UI 视觉参考（临时，T034 后清理） | `UI/preview-active.html`、`UI/preview-empty.html`、`UI/preview-settings.html` |
