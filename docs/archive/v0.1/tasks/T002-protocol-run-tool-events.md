# T002 · Protocol: RunLifecycle + ToolExecution Events

**Epic:** E0 – Protocol & Schema
**依赖:** T001
**估算改动:** ~350 行

---

## 目标

在 `packages/protocol` 中用 zod 定义 `RunLifecycle` 和 `ToolExecution` 两个核心事件族的完整 schema，并导出对应 TypeScript 类型。每条事件必须包含 `revision`（单调递增）、`timestamp`、`runId`、`source` 字段。

---

## 范围

**做什么：**
- `RunLifecycleEvent` zod union schema，状态：`created | started | waiting_approval | completed | failed | cancelled | interrupted`
- `ToolExecutionEvent` zod union schema，状态：`requested | approved | denied | executing | completed | failed`
- `BaseEvent` 公共字段：`revision: number, timestamp: string (ISO8601), runId: string, source: string`
- 所有 zod schema 使用 `.passthrough()`（前向兼容未知字段）
- 导出类型：`RunLifecycleEvent`, `ToolExecutionEvent`, `BaseEvent`
- 单元测试：每个事件状态的 parse + 非法输入拒绝

**不做什么：**
- 不定义 MemoryOperation / EngineOutput / SystemHealth（留 T003）
- 不实现任何运行时逻辑

---

## 假设

- 事件格式基于 JSON，通过 SSE 传输（`event: <type>` + `data: <json>`）
- `runId` 为 UUIDv4 格式字符串
- `revision` 由 Core 分配，Protocol 层只做类型约束（`z.number().int().nonnegative()`）
- `source` 枚举：`"core" | "engine.claude" | "engine.codex" | "hook_runner" | "soul" | "ui"`

---

## 文件清单

```
packages/protocol/src/events/base.ts
packages/protocol/src/events/run.ts
packages/protocol/src/events/tool.ts
packages/protocol/src/events/index.ts
packages/protocol/src/index.ts          (re-export all)
packages/protocol/src/__tests__/run.test.ts
packages/protocol/src/__tests__/tool.test.ts
packages/protocol/package.json          (添加 zod 依赖)
```

---

## 接口与 Schema 引用

本 Ticket 定义的类型，是后续所有 Ticket 的基础：
- `RunLifecycleEvent` — T008 (xstate 状态机转换) 消费
- `ToolExecutionEvent` — T009 (Policy Engine) 消费
- `BaseEvent` — T005 (SSE server)、T006 (Event Bus) 消费

---

## 实现步骤

1. 在 `packages/protocol/package.json` 添加 `zod: "^3.x"` 依赖
2. 创建 `src/events/base.ts`：定义 `BaseEventSchema`（revision/timestamp/runId/source）
3. 创建 `src/events/run.ts`：
   - `RunCreatedEventSchema`, `RunStartedEventSchema` 等各状态的具体 schema
   - `RunLifecycleEventSchema = z.discriminatedUnion("status", [...])`
4. 创建 `src/events/tool.ts`：
   - `ToolRequestedEventSchema`（含 `toolName: string`, `args: z.record(z.unknown())`）
   - `ToolApprovedEventSchema`, `ToolDeniedEventSchema`（含 `reason: string`）
   - `ToolExecutingEventSchema`, `ToolCompletedEventSchema`, `ToolFailedEventSchema`
   - `ToolExecutionEventSchema = z.discriminatedUnion("status", [...])`
5. 创建 `src/events/index.ts`：re-export 所有 schema + 类型
6. 更新 `src/index.ts`：re-export events
7. 编写测试（vitest）：合法 payload 可 parse、缺字段报错、未知字段透传（passthrough）

---

## DoD + 验收命令

```bash
# 安装依赖
pnpm install

# 类型检查
pnpm --filter @do-what/protocol exec tsc --noEmit

# 单元测试
pnpm --filter @do-what/protocol test
# 预期：所有 parse 测试通过，非法输入测试通过

# 验证导出可用（smoke test）
node -e "
import('@do-what/protocol').then(p => {
  const result = p.RunLifecycleEventSchema.safeParse({
    status: 'created', revision: 1, timestamp: new Date().toISOString(),
    runId: 'test-uuid', source: 'core', workspaceId: 'ws1'
  });
  console.log('valid:', result.success);
  process.exit(result.success ? 0 : 1);
})
"
```

---

## 风险与降级策略

- **风险：** `z.discriminatedUnion` 在复杂嵌套时 TypeScript 推断变慢
  - **降级：** 改用 `z.union` + 手动类型断言，在 PR 注释中标注性能考量
- **风险：** `source` 枚举今后需要扩展（新引擎接入）
  - **降级：** `source` 改为 `z.string()`，在注释中写明预期值，不用 `z.enum` 强制约束
