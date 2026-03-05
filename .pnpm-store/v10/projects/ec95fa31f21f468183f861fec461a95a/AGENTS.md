# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

---

## 当前任务来源

所有实现任务来自 **`CODEX_QUEUE.md`**。每次执行一个 Ticket，流程如下：

1. 读取对应 `tasks/T###-*.md`（完整 Ticket 说明）
2. 按 `CODEX_QUEUE.md` 中对应块的 **Exact tasks checklist** 逐条实现
3. 运行 **Acceptance** 中的命令，确认全部通过
4. 停止，等待人工确认后再继续下一个 Ticket

**不要跨 Ticket 连续实现。每个 Ticket 必须独立验收。**

---

## 依赖顺序（必须遵守）

```
T001 → T002 → T003 → T004          # E0: Protocol（先于一切）
T005 → T006 → T007 → T008 → T009   # E1: Core（依赖 E0）
T010                                # 门控：必须通过才能继续 E2/E3
T011 → T012 → T013                  # E2: Claude 适配器
T014 → T015 → T016                  # E3: Codex 适配器
T017 → T018 → T019                  # E4: Soul 读路径（可与 E2/E3 并行）
T020 → T021 → T022                  # E5: Soul 写路径
T023 → T024                         # E6: Worktree + Integrator
T025 → T026 → T027                  # E7: Memory Compiler
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
- [ ] `CODEX_QUEUE.md` 中对应 Ticket 的 **Acceptance** 命令输出符合预期
- [ ] 没有修改本 Ticket **Files to touch** 列表之外的文件
- [ ] 更新 `docs/INTERFACE_INDEX.md`（若有新增/修改接口，见下方规则）
- [ ] 更新 `README.md` 的状态表格（若 Ticket 完成使某个 Epic 状态变化）

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
| 某个 Ticket 的完整要求 | `tasks/T###-*.md` |
| 所有接口/端点/表结构速查 | `docs/INTERFACE_INDEX.md` |
| 事件类型 / zod schema 源码 | `packages/protocol/src/events/` |
| MCP tool schema 源码 | `packages/protocol/src/mcp/` |
| Policy 默认配置 | `packages/protocol/src/policy/defaults.ts` |
| 状态机 context/event 类型 | `packages/protocol/src/machines/` |
| Core HTTP 端点实现 | `packages/core/src/server/routes.ts` |
| SQLite 表结构（Core） | `packages/core/src/db/migrations/v1.ts` |
| SQLite 表结构（Soul） | `packages/soul/src/db/migrations/v1.ts` |
