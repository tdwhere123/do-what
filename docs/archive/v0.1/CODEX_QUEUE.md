# CODEX_QUEUE.md — do-what 重构执行指令块

> 格式：每个 Ticket 一个指令块，可直接复制粘贴发给 Codex。
> 执行前提：按顺序执行，确认前一个 Ticket 的 DoD 已通过再开始下一个。
> 生成时间：2026-03-04

---

## 执行前须知

1. **每个 Ticket 必须先确认依赖 Ticket 的验收命令已通过**，再开始执行
2. **不要修改 `packages/protocol` 以外的类型定义**——所有接口变更必须从 Protocol 层流出
3. **所有新文件必须通过 `pnpm --filter <pkg> exec tsc --noEmit`**
4. **每个 Ticket 完成后运行对应验收命令**，截图/粘贴输出作为 DoD 证明

---

## E0 – Protocol & Schema

---

### T001 · Monorepo Scaffold

**Context:** 这是整个项目的骨架。目标是搭建 pnpm workspace + turborepo，创建 8 个 package 目录的 stub，确保 `pnpm install` 和 `pnpm -w build` 无报错。此 Ticket 无依赖。

**Files to touch:**
```
package.json (root)
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
.gitignore
.nvmrc
packages/protocol/package.json + src/index.ts
packages/core/package.json + src/index.ts
packages/app/package.json + src/index.ts
packages/engines/claude/package.json + src/index.ts
packages/engines/codex/package.json + src/index.ts
packages/soul/package.json + src/index.ts
packages/tools/package.json + src/index.ts
packages/toolchain/package.json + src/index.ts
```

**Exact tasks:**
- [ ] 创建根 `package.json`：`private: true`，`type: "module"`，workspaces 包含 `packages/*` 和 `packages/engines/*`，scripts: `build: "turbo build"`, `test: "turbo test"`, `lint: "turbo lint"`
- [ ] 创建 `pnpm-workspace.yaml`：packages 列表
- [ ] 创建 `turbo.json`：build/test/lint pipeline，`build` 的 `dependsOn: ["^build"]`，`outputs: ["dist/**"]`
- [ ] 创建 `tsconfig.base.json`：`target: "ES2022"`, `module: "Node16"`, `moduleResolution: "Node16"`, `strict: true`, `declaration: true`, `declarationMap: true`, `sourceMap: true`
- [ ] 为每个 package 创建 `package.json`（`name: "@do-what/<name>"`, `version: "0.1.0"`, `type: "module"`, `main: "./dist/index.js"`, `exports: { ".": "./dist/index.js" }`, `scripts: { "build": "tsc", "test": "vitest run" }`）
- [ ] 每个 package 创建 `tsconfig.json`（extends tsconfig.base.json）
- [ ] 每个 package 创建 `src/index.ts`（`export {}`）
- [ ] 创建 `.gitignore`：node_modules, dist, .turbo, *.db, session_token
- [ ] 安装 devDependencies：`turborepo`, `typescript`, `vitest`, `@types/node`（根 package）

**Acceptance:**
```bash
pnpm install
pnpm -w build
# 预期：所有 package build 成功，无错误
pnpm list --depth 0 -w
# 预期：列出所有 8 个 @do-what/* package
```

**Constraints:**
- 不要写任何业务逻辑
- 不要安装 runtime 依赖（better-sqlite3、xstate 等留给后续 Ticket）
- package.json 中 `engines` 字段锁定 Node.js >= 20

---

### T002 · Protocol: RunLifecycle + ToolExecution Events

**Context:** 定义核心事件 zod schema。依赖 T001。每条事件必须包含 `revision, timestamp, runId, source` 四个基础字段。使用 zod `.passthrough()` 保持前向兼容。

**Files to touch:**
```
packages/protocol/src/events/base.ts
packages/protocol/src/events/run.ts
packages/protocol/src/events/tool.ts
packages/protocol/src/events/index.ts
packages/protocol/src/index.ts
packages/protocol/src/__tests__/run.test.ts
packages/protocol/src/__tests__/tool.test.ts
packages/protocol/package.json  (添加 zod)
```

**Exact tasks:**
- [ ] `package.json` 添加 `zod: "^3.x"` 依赖
- [ ] `src/events/base.ts`：`BaseEventSchema = z.object({ revision: z.number().int().nonneg(), timestamp: z.string(), runId: z.string(), source: z.string() }).passthrough()`
- [ ] `src/events/run.ts`：7 个状态（created/started/waiting_approval/completed/failed/cancelled/interrupted）的 schema，`RunLifecycleEventSchema = z.discriminatedUnion("status", [...])`
- [ ] `src/events/tool.ts`：6 个状态（requested/approved/denied/executing/completed/failed）的 schema，`ToolExecutionEventSchema`；`requested` 包含 `toolName: z.string()` 和 `args: z.record(z.unknown())`
- [ ] `src/events/index.ts`：re-export 所有 schema + TypeScript 类型（`z.infer<...>`）
- [ ] `src/index.ts`：re-export events module
- [ ] 编写测试：合法 payload parse 成功；必填字段缺失 parse 失败；未知字段 passthrough 后保留

**Acceptance:**
```bash
pnpm --filter @do-what/protocol test
pnpm --filter @do-what/protocol exec tsc --noEmit
# 预期：所有测试通过，无类型错误
```

**Constraints:**
- 只修改 `packages/protocol` 内的文件
- 不要添加运行时逻辑，只有 zod schema 和类型定义
- 所有 schema 使用 `.passthrough()`

---

### T003 · Protocol: EngineOutput + MemoryOperation + SystemHealth + Tools API MCP Schema

**Context:** 完成 Protocol 剩余事件族和 Tools API MCP schema。依赖 T002（需要 BaseEventSchema）。`zod-to-json-schema` 用于生成 MCP 标准 JSON Schema。

**Files to touch:**
```
packages/protocol/src/events/engine.ts
packages/protocol/src/events/memory.ts
packages/protocol/src/events/system.ts
packages/protocol/src/mcp/tools-api.ts
packages/protocol/src/mcp/index.ts
packages/protocol/src/types/cue.ts
packages/protocol/src/__tests__/engine.test.ts
packages/protocol/src/__tests__/memory.test.ts
packages/protocol/src/__tests__/tools-api.test.ts
packages/protocol/package.json  (添加 zod-to-json-schema)
```

**Exact tasks:**
- [ ] `src/types/cue.ts`：`CueRefSchema = z.object({ cueId: z.string(), gist: z.string(), score: z.number(), pointers: z.array(z.string()), why: z.string().optional() })`
- [ ] `src/events/engine.ts`：`EngineOutputEventSchema`（token_stream/plan_node/diff 三个状态）
- [ ] `src/events/memory.ts`：`MemoryOperationEventSchema`（search/open/propose/commit 四个状态）
- [ ] `src/events/system.ts`：`SystemHealthEventSchema`（engine_connect/engine_disconnect/circuit_break/network_status 四个状态）
- [ ] `src/mcp/tools-api.ts`：10 个工具的 zod input schema（见 tasks/T003 文档中的完整工具列表），用 `zodToJsonSchema` 生成 `ToolsApiJsonSchemas` 对象
- [ ] `sandbox` 字段：`z.enum(['native','wsl','docker']).default('native')`
- [ ] 更新 `src/events/index.ts`、`src/index.ts` re-export 新内容

**Acceptance:**
```bash
pnpm --filter @do-what/protocol test
node -e "
import('@do-what/protocol').then(p => {
  const s = p.ToolsApiJsonSchemas['tools.shell_exec'];
  console.assert(s.type === 'object');
  console.assert(s.properties.command);
  console.log('tools.shell_exec JSON Schema OK');
})
"
```

**Constraints:**
- `sandbox` 字段的 `default('native')` 不影响 TypeScript 类型（用 `.default()` 不用 `optional()`）
- 10 个工具的 schema 必须与方案 10.2 节完全对应
- 不修改 T002 已定义的 schema

---

### T004 · Protocol: Soul MCP Schema + Policy 配置格式 + StateMachine 类型

**Context:** 完成 Protocol 的最后部分：Soul 5 个工具 schema、Policy 配置格式、xstate 类型骨架。依赖 T003。这些类型是后续所有实现 Ticket 的类型约束。

**Files to touch:**
```
packages/protocol/src/mcp/soul-tools.ts
packages/protocol/src/policy/config.ts
packages/protocol/src/policy/hook-cache.ts
packages/protocol/src/policy/defaults.ts
packages/protocol/src/policy/index.ts
packages/protocol/src/machines/run-types.ts
packages/protocol/src/machines/engine-types.ts
packages/protocol/src/machines/approval-types.ts
packages/protocol/src/machines/index.ts
packages/protocol/src/__tests__/policy.test.ts
packages/protocol/package.json  (添加 xstate@5 类型依赖)
```

**Exact tasks:**
- [ ] `src/mcp/soul-tools.ts`：5 个工具（memory_search/open_pointer/explore_graph/propose_memory_update/review_memory_proposal）的完整 zod input schema + JSON Schema 导出
- [ ] `open_pointer.level`：`z.enum(['hint','excerpt','full'])`
- [ ] `review_memory_proposal.action`：`z.enum(['accept','edit','reject','hint_only'])`
- [ ] `src/policy/config.ts`：`PolicyRuleSchema = z.object({ default: z.enum(['allow','ask','deny']), allow_paths: z.array(z.string()).optional(), deny_paths: z.array(z.string()).optional(), allow_commands: z.array(z.string()).optional(), allow_domains: z.array(z.string()).optional() })`；`PolicyConfigSchema = z.record(z.string(), PolicyRuleSchema)`
- [ ] `src/policy/defaults.ts`：DEFAULT_POLICY 常量，file_read→allow，file_write/shell_exec/web_fetch/docker_run/wsl_exec→ask，按方案 10.3 节
- [ ] `src/policy/hook-cache.ts`：`HookPolicyCacheSchema = z.object({ version: z.string(), updatedAt: z.string(), rules: PolicyConfigSchema })`
- [ ] `src/machines/run-types.ts`：`RunContext` interface + `RunEvent` discriminated union（所有 RunLifecycle 触发事件）—— 仅类型定义，不含机器实现
- [ ] `src/machines/engine-types.ts` + `approval-types.ts`：同上

**Acceptance:**
```bash
pnpm --filter @do-what/protocol test
node -e "
import('@do-what/protocol').then(p => {
  console.assert(p.DEFAULT_POLICY['tools.shell_exec'].default === 'ask');
  console.assert(p.DEFAULT_POLICY['tools.file_read'].default === 'allow');
  console.log('DEFAULT_POLICY OK');
})
"
```

**Constraints:**
- 不要在 protocol 包中引入 xstate 运行时（只引入 xstate 类型）
- `cue_draft` 字段暂用 `z.record(z.unknown())`（留 T021 收紧）
- 不修改 T001-T003 已定义的任何 schema

---

## E1 – Core Skeleton

---

### T005 · Core: HTTP Server + SSE + session_token 鉴权T00

**Context:** 启动 Core daemon 的 HTTP 服务器。依赖 T002/T003（需要 BaseEvent 类型）。绑定 127.0.0.1:3847，强制 Bearer token 鉴权。session_token 启动时生成，写入 `~/.do-what/run/session_token`。

**Files to touch:**
```
packages/core/src/server/http.ts
packages/core/src/server/sse.ts
packages/core/src/server/auth.ts
packages/core/src/server/routes.ts
packages/core/src/server/index.ts
packages/core/src/config.ts
packages/core/src/__tests__/server.test.ts
packages/core/package.json  (添加 fastify)
```

**Exact tasks:**
- [ ] `config.ts`：导出 `PORT = parseInt(process.env.DOWHAT_PORT ?? '3847')`, `HOST = '127.0.0.1'`, `SESSION_TOKEN_PATH = path.join(os.homedir(), '.do-what/run/session_token')`, `STATE_DIR`, `RUN_DIR`；Core 启动时创建这些目录（`fs.mkdirSync(..., { recursive: true })`）
- [ ] `server/auth.ts`：`generateAndSaveToken()`（crypto.randomBytes(32).toString('hex') + writeFile + chmod 0o600）；`loadToken()`；`authMiddleware()`（检查 Authorization: Bearer，无效返回 401）
- [ ] `server/sse.ts`：`SseManager` 类，`subscribe(res)` 设置 SSE headers、维护 connections Set；`broadcast(event: BaseEvent)` 序列化并推送；`closeAll()`
- [ ] `server/routes.ts`：`GET /health`（无鉴权）；`GET /events`（鉴权 + SSE）；`GET /state`（鉴权，暂返回 `{}`）；`POST /_dev/publish`（**仅开发模式**，鉴权，接收事件体并发布到 SseManager）
- [ ] `server/http.ts`：组合 Fastify 实例，注册 auth hook（`onRequest`），挂载所有路由，处理 SIGTERM/SIGINT 优雅关闭
- [ ] 编写集成测试：无 token → 401；有效 token → 200；SSE 握手成功（检查 Content-Type: text/event-stream）；`_dev/publish` 后 SSE 推送事件

**Acceptance:**
```bash
pnpm --filter @do-what/core test
# 手动验证
pnpm --filter @do-what/core start &
CORE_PID=$!
sleep 1
curl -s http://127.0.0.1:3847/health
# 预期：{"ok":true,...}
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3847/state
# 预期：401
TOKEN=$(cat ~/.do-what/run/session_token)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3847/state
# 预期：{}
kill $CORE_PID
```

**Constraints:**
- `_dev/publish` 端点仅在 `NODE_ENV=development` 时激活，生产模式不暴露
- Windows 下 chmod 失败时记录 warn 日志，不阻塞启动
- 所有路由处理错误必须返回 JSON 格式的错误信息

---

### T006 · Core: Event Bus + State Store + DatabaseWorker

**Context:** Core 的事件传播核心。依赖 T005（SseManager）和 T002（BaseEvent）。DatabaseWorker 必须在 worker_threads 中运行，主线程只做读操作。

**Files to touch:**
```
packages/core/src/eventbus/event-bus.ts
packages/core/src/eventbus/revision-counter.ts
packages/core/src/eventbus/index.ts
packages/core/src/db/database-worker.ts
packages/core/src/db/worker-client.ts
packages/core/src/db/read-connection.ts
packages/core/src/db/state-store.ts
packages/core/src/db/index.ts
packages/core/src/__tests__/event-bus.test.ts
packages/core/src/__tests__/database-worker.test.ts
packages/core/package.json  (添加 better-sqlite3, @types/better-sqlite3)
```

**Exact tasks:**
- [ ] `src/eventbus/revision-counter.ts`：`RevisionCounter` 类，`next(): number`（内部 `count++`）
- [ ] `src/db/database-worker.ts`（Worker 线程脚本）：接收 `{ type: 'write', id: string, sql: string, params: unknown[] }` → 执行 `db.prepare(sql).run(params)` → 回传 `{ type: 'result', id, ok, error? }`；批次 5 条，批间 `setImmediate` yield
- [ ] `src/db/worker-client.ts`：`WorkerClient` 类，内部维护 `Map<id, {resolve, reject}>`，`write(sql, params): Promise<void>`；Worker crash 时自动重启（最多 3 次）
- [ ] `src/db/read-connection.ts`：只读 better-sqlite3 连接，`PRAGMA query_only=true`，`PRAGMA busy_timeout=5000`
- [ ] `src/eventbus/event-bus.ts`：`EventBus.publish(event)` → 分配 revision → 异步 `workerClient.write(event_log INSERT)` → `sseManager.broadcast(event)` → `emitter.emit(event.eventType ?? event.type, event)`
- [ ] `src/db/state-store.ts`：`StateStore.getEventsSince(revision): EventLogRow[]`（用只读连接）
- [ ] 编写测试：EventBus publish → SseManager 收到广播（mock SseManager）；DatabaseWorker 串行写入（用 in-memory SQLite，需 T007 的表结构，可先用临时表）；Worker crash 自动重启

**Acceptance:**
```bash
pnpm --filter @do-what/core test
# DatabaseWorker 串行写入性能测试
node -e "
// 快速验证：100 次连续写入后顺序正确
const {WorkerClient} = require('./packages/core/dist/db/worker-client.js');
// ... (in test)
"
```

**Constraints:**
- DatabaseWorker 脚本不能 import 任何非 Node.js 内置模块（除 better-sqlite3），避免 worker_threads 路径问题
- EventBus.publish 不能 await DB 写入（必须 fire-and-forget），否则 SSE 推送会被阻塞
- 使用 `worker_threads` 模块，不用 `child_process`

---

### T007 · Core: SQLite DDL + 迁移框架

**Context:** 定义 state.db 完整表结构。依赖 T006（DatabaseWorker）。迁移在 Worker 线程启动时执行（事务保证幂等）。

**Files to touch:**
```
packages/core/src/db/migrations/v1.ts
packages/core/src/db/migrations/index.ts
packages/core/src/db/migration-runner.ts
packages/core/src/db/schema.ts
packages/core/src/__tests__/migration.test.ts
```

**Exact tasks:**
- [ ] `src/db/schema.ts`：导出 `TABLE_*` 常量 + `EventLogRow`, `RunRow`, `WorkspaceRow`, `AgentRow`, `ApprovalQueueRow`, `SnapshotRow` interface
- [ ] `src/db/migrations/v1.ts`：完整 DDL（6 张表，见 tasks/T007 文档），包含所有索引
- [ ] `src/db/migration-runner.ts`：`runPending(db)`，读 `schema_version`，按版本序执行，每个迁移在独立事务中；失败时 ROLLBACK + 抛错
- [ ] 在 `database-worker.ts` 的 Worker 启动序列中调用 `MigrationRunner.runPending(db)`
- [ ] 编写测试：in-memory SQLite 中运行迁移 → 验证表存在；重复运行 → 幂等（不报错）；迁移失败 → 回滚（验证表不存在）

**Acceptance:**
```bash
pnpm --filter @do-what/core test -- --testNamePattern migration
# 启动后验证
pnpm --filter @do-what/core start &; sleep 2; kill $!
sqlite3 ~/.do-what/state/state.db ".tables"
# 预期：agents  approval_queue  event_log  runs  schema_version  snapshots  workspaces
sqlite3 ~/.do-what/state/state.db "SELECT version FROM schema_version;"
# 预期：1
```

**Constraints:**
- 不要在 `v1.ts` 以外创建 DDL；后续字段扩展通过 `v2.ts` 等迁移文件进行
- `event_log` 表必须只追加（不提供 UPDATE/DELETE 路径）

---

### T008 · Core: xstate v5 状态机（Run + Engine + Approval）

**Context:** Core 的状态管理核心。依赖 T004（机器类型骨架）、T006（EventBus）、T007（DB schema）。xstate v5 使用 `setup({types}).createMachine({})` API。

**Files to touch:**
```
packages/core/src/machines/run-machine.ts
packages/core/src/machines/engine-machine.ts
packages/core/src/machines/approval-machine.ts
packages/core/src/machines/run-registry.ts
packages/core/src/machines/index.ts
packages/core/src/__tests__/run-machine.test.ts
packages/core/src/__tests__/engine-machine.test.ts
packages/core/src/__tests__/approval-machine.test.ts
packages/core/package.json  (添加 xstate@5)
```

**Exact tasks:**
- [ ] `run-machine.ts`：状态：idle → created → started → running → waiting_approval ↔ running → completed|failed|cancelled|interrupted；actions 中通过 `input` 注入 `eventBus` 和 `dbWorker`；`AgentStuckDetector`：在 `running` 状态下同一 toolName deny 次数 >= 2 → 发 INTERRUPT
- [ ] `engine-machine.ts`：状态：disconnected → connecting → connected → degraded → circuit_open；`failureCount` context 字段；5 次连续解析错误 → circuit_open
- [ ] `approval-machine.ts`：queue context（ApprovalItem[]）；ENQUEUE → 若 idle 则开始处理；USER_APPROVE/USER_DENY → resolve + 继续；`after(300000)` 自动 deny（5 分钟）
- [ ] `run-registry.ts`：`RunRegistry`，`Map<runId, Actor<RunMachine>>`；`create(config)`, `get(runId)`, `send(runId, event)`；actor terminal 后 30 秒自动 `stop()` + 移除
- [ ] 水合函数 `rehydrateRuns(db, eventBus)`：查询 running/waiting_approval 状态的 runs → UPDATE status='interrupted' → publish RunLifecycleEvent.interrupted
- [ ] 编写测试：RunMachine 完整流程；AgentStuckException 触发；ApprovalMachine 超时；EngineMachine 断路器

**Acceptance:**
```bash
pnpm --filter @do-what/core test -- --testNamePattern machine
# 关键：
# ✓ RunMachine 正常完成流：idle→created→started→running→completed
# ✓ AgentStuckException：deny 2 次 → interrupted（reason:'agent_stuck'）
# ✓ ApprovalMachine 超时：5分钟后 auto deny
# ✓ EngineMachine 断路器：5次解析错误→circuit_open
```

**Constraints:**
- 必须使用 xstate v5 的 `setup({types: {context, events}}).createMachine()` API
- 所有 machine action 中的 DB 写入必须是 fire-and-forget（不 await），避免阻塞状态机
- 不要在状态机 action 中写入复杂 SQL（只写单条 UPDATE/INSERT）

---

### T009 · Core: Policy Engine 骨架

**Context:** 工具调用的三路审批判定（allow/ask/deny）。依赖 T004（PolicyConfigSchema）、T007（approval_queue 表）、T008（ApprovalMachine）。

**Files to touch:**
```
packages/core/src/policy/policy-engine.ts
packages/core/src/policy/decision.ts
packages/core/src/policy/cache-writer.ts
packages/core/src/policy/path-matcher.ts
packages/core/src/policy/index.ts
packages/core/src/__tests__/policy-engine.test.ts
packages/core/package.json  (添加 micromatch)
```

**Exact tasks:**
- [ ] `path-matcher.ts`：`matchPath(pattern, filePath)` 用 micromatch；`matchCommand(allowList, command)` 命令前缀匹配；`matchDomain(allowList, url)` 域名匹配；路径规范化（`\` → `/`）
- [ ] `decision.ts`：`PolicyDecision = { result: 'allow'|'ask'|'deny', reason: string }`；DENY_REASONS/ALLOW_REASONS 常量
- [ ] `cache-writer.ts`：`writePolicyCache(policy, path)` → 写 HookPolicyCacheSchema 格式 JSON
- [ ] `policy-engine.ts`：`PolicyEngine.load()` + `reload()` + `watch()`（fs.watch + 30s 轮询双保险）；`evaluate(toolName, args, context): PolicyDecision`；`askUser(toolName, args, runId): Promise<PolicyDecision>` → ApprovalMachine.enqueue
- [ ] 默认 policy.json 生成：若不存在，从 DEFAULT_POLICY 生成初始文件
- [ ] 启动时调用 `writePolicyCache`，policy 变更时重新调用

**Acceptance:**
```bash
pnpm --filter @do-what/core test -- --testNamePattern policy
pnpm --filter @do-what/core start &; sleep 2
cat ~/.do-what/run/hook-policy-cache.json | python -m json.tool
# 预期：合法 JSON，包含 rules 字段
kill %1
```

**Constraints:**
- `micromatch` glob 模式需要规范化路径（统一正斜杠）
- `watch` 方案必须有 fallback（30s 轮询）
- `askUser` 不能超时（无 timeout），ApprovalMachine 管理超时

---

## E1.5 – Protocol Validation Gate

---

### T010 · 协议验证门控

**Context:** 关键门控点。在开始 E2/E3 前验证 Claude Hooks 和 Codex App Server 实际协议与预期是否一致。**此 Ticket 完成并产出 docs/protocol-validation-report.md 后，才能开始 T011。**

**Files to touch:**
```
scripts/validate-claude-hooks.ts
scripts/validate-codex-appserver.ts
scripts/validation-runner.ts
docs/protocol-validation-report.md
```

**Exact tasks:**
- [ ] `validate-claude-hooks.ts`：spawn `claude` 进程（带简单 task），捕获 hook 事件 JSON → 用 Protocol zod schema parse → 打印 diff（预期字段 vs 实际字段）
- [ ] `validate-codex-appserver.ts`：spawn `codex app-server --stdio`，发送简单请求，记录响应格式
- [ ] `validation-runner.ts`：串行运行两个验证脚本，汇总结果，输出 Markdown 格式报告
- [ ] 手动填写 `docs/protocol-validation-report.md`（根据脚本输出）：5 个检查点（见 tasks/T010 文档），每条 ✅/⚠️/❌
- [ ] **若发现 schema 差异**：在 packages/protocol 中修复（加 `.optional()`、改字段名等），同 PR 提交

**Acceptance:**
```bash
npx tsx scripts/validation-runner.ts
# 预期：所有检查点有状态输出
cat docs/protocol-validation-report.md
# 关键：无 ❌ 条目（或有 ❌ 但已记录修复计划）
# 关键：Hook runner zod parse 成功率 >= 95%
```

**Constraints:**
- 需要已安装 claude CLI（最新版）和 codex CLI，且均已配置 API Key
- 若 Codex App Server 完全不可用，在报告中标记并创建 Ticket 记录降级方案
- 不要修改 packages/core 或 packages/engines 的任何文件

---

## E2 – Claude Engine Adapter

---

### T011 · Claude Hook Runner 独立进程 + 策略缓存

**Context:** Hook Runner 是极轻的独立进程，必须在 200ms 内完成 allow/deny 决策。依赖 T010（协议验证）、T004（HookPolicyCacheSchema）。

**Files to touch:**
```
packages/engines/claude/src/hook-runner.ts
packages/engines/claude/src/policy-cache.ts
packages/engines/claude/src/core-forwarder.ts
packages/engines/claude/src/hooks-config.ts
packages/engines/claude/src/index.ts
packages/core/src/server/internal-routes.ts
packages/engines/claude/src/__tests__/hook-runner.test.ts
packages/engines/claude/src/__tests__/policy-cache.test.ts
```

**Exact tasks:**
- [ ] `policy-cache.ts`：读取 `~/.do-what/run/hook-policy-cache.json`（zod 校验）；`evaluate(toolName, args): 'allow'|'deny'|'ask'`；`fs.watch` + fallback 热重载
- [ ] `core-forwarder.ts`：`forward(event, port, token)` → 异步 HTTP POST（fire-and-forget），失败时写 `~/.do-what/run/hook-errors.log`（不阻塞主流程）
- [ ] `hook-runner.ts`：读 stdin JSON → zod parse（宽松，用 `z.unknown()` 先接受）→ 提取 toolName → `policyCache.evaluate()` → 写 stdout JSON（`{action:'allow'|'deny', feedback?}` ）→ 异步 `coreForwarder.forward`
- [ ] 环境变量：`DOWHAT_PORT`, `DOWHAT_TOKEN`（由 Core 在启动 Claude 时注入）
- [ ] "ask" 决策处理：stdout 超时保护（记录时间，若距 hook 调用 > 150ms → 输出 allow，异步通知 Core）
- [ ] `hooks-config.ts`：`generateHooksConfig(hookRunnerPath, env)` → 返回 Claude hooks JSON 对象（PreToolUse + PostToolUse 配置，toolName 匹配 Bash/Write/WebFetch）
- [ ] Core 新增 `POST /internal/hook-event`：验证来源 IP 为 127.0.0.1，接收事件 → 发布 EventBus

**Acceptance:**
```bash
pnpm --filter @do-what/claude test
# 端到端
echo '{"tool":"Bash","args":{"command":"ls"}}' | \
  DOWHAT_PORT=3847 DOWHAT_TOKEN=$(cat ~/.do-what/run/session_token) \
  node packages/engines/claude/dist/hook-runner.js
# 预期 stdout：{"action":"deny","feedback":"Use do-what MCP tools instead"}
```

**Constraints:**
- hook-runner.ts 的 stdin→stdout 路径不能有任何 async/await 导致的延迟（策略决策必须同步完成）
- 不要在 hook-runner.ts 中 import 任何 packages/core 的模块（保持进程完全独立）
- `_dev` 端点只在 development 模式暴露

---

### T012 · Claude 适配器：deny+reroute + AgentStuckException + MCP Server

**Context:** Claude 适配器的主体。依赖 T011。实现 MCP Server（10 个 Tools API tools），以及 deny+reroute 提示逻辑和 AgentStuckException 检测。

**Files to touch:**
```
packages/engines/claude/src/claude-adapter.ts
packages/engines/claude/src/claude-process.ts
packages/engines/claude/src/claude-md-generator.ts
packages/engines/claude/src/mcp-server.ts
packages/engines/claude/src/tool-handlers.ts
packages/engines/claude/src/__tests__/claude-adapter.test.ts
packages/engines/claude/src/__tests__/mcp-server.test.ts
packages/engines/claude/package.json  (添加 @modelcontextprotocol/sdk)
```

**Exact tasks:**
- [ ] `claude-md-generator.ts`：生成 CLAUDE.md 内容，包含：1) 不要使用原生 Bash/Write/WebFetch，2) 必须通过 tools.shell_exec/tools.file_write/tools.web_fetch（MCP 工具），3) 所有命令执行通过 do-what 工具通道
- [ ] `mcp-server.ts`：用 `@modelcontextprotocol/sdk` 启动 HTTP MCP server（端口 `DOWHAT_MCP_PORT` 默认 3848），注册 10 个 Tools API tools（schema 来自 `@do-what/protocol`）
- [ ] `tool-handlers.ts`：每个 tool 的 handler：调用 PolicyEngine.evaluate() → allow/ask/deny 三路 → 发布 ToolExecutionEvent → 返回 stub 结果（`{ content: [{ type: 'text', text: 'Tool execution stub' }] }`）
- [ ] `claude-process.ts`：spawn `claude` + `--hooks-file` + `--mcp-server` + CLAUDE.md 路径；监听 exit（→ RunMachine COMPLETE/FAIL）；Windows Job Object 注册（通过 packages/tools）
- [ ] `claude-adapter.ts`：`ClaudeAdapter.startRun(config)` 组合上述；`AgentStuckDetector`：per-runId Map<toolName, count>，deny 2 次 → RunMachine.send('INTERRUPT', {reason:'agent_stuck'})
- [ ] 编写测试：MCP server 工具列表 GET；policy deny 流程；AgentStuckException 触发（mock EventBus）

**Acceptance:**
```bash
pnpm --filter @do-what/claude test
pnpm --filter @do-what/core start &
pnpm --filter @do-what/claude start-mcp &
sleep 1
curl -s http://127.0.0.1:3848/tools | jq '[.tools[].name]'
# 预期：10 个工具名称
kill %1 %2
```

**Constraints:**
- tool-handlers.ts 只提供 stub 实现（真实工具执行留给 packages/tools）
- MCP server 的端口不要硬编码，用 `DOWHAT_MCP_PORT` 环境变量
- CLAUDE.md 内容中不要包含任何具体命令示例，只写原则性限制

---

### T013 · Claude 适配器：Contract Tests

**Context:** 录制 Claude 会话的回放测试。依赖 T012。3 个场景 fixture，测试不依赖真实 Claude 进程。

**Files to touch:**
```
packages/engines/claude/fixtures/scenario-readonly.jsonl
packages/engines/claude/fixtures/scenario-write-approve.jsonl
packages/engines/claude/fixtures/scenario-agent-stuck.jsonl
packages/engines/claude/src/__tests__/contract/replay.test.ts
packages/engines/claude/src/__tests__/contract/fixture-loader.ts
```

**Exact tasks:**
- [ ] 录制或手动构造 3 个 fixture JSONL（每行一个 hook 事件，格式以 T010 验证结果为准）
- [ ] `fixture-loader.ts`：读取 JSONL + zod parse（对未知字段 passthrough）
- [ ] `replay.test.ts`：逐行 feed 给 hook-runner（via pipe/mock stdin）→ 收集 stdout → 断言 action 字段和序列
- [ ] fixture 文件头注释：`// claude version: <version>`
- [ ] 3 个场景测试全部通过：readonly（全 allow）、write-approve（deny+allow 序列）、agent-stuck（2 次 deny → interrupt 信号）

**Acceptance:**
```bash
pnpm --filter @do-what/claude test -- --testNamePattern contract
```

**Constraints:**
- fixture 文件必须提交到 git（不加入 .gitignore）
- 回放测试不启动任何真实进程（纯 unit test）

---

## E3 – Codex Engine Adapter

---

### T014 · Codex App Server 进程管理 + JSONL 双向通道

**Context:** Codex 进程的生命周期管理。依赖 T010（Codex 协议验证通过）、T006（EventBus）。每个 Run 一个 Codex 进程实例。

**Files to touch:**
```
packages/engines/codex/src/codex-process.ts
packages/engines/codex/src/codex-process-manager.ts
packages/engines/codex/src/jsonl-reader.ts
packages/engines/codex/src/jsonl-writer.ts
packages/engines/codex/src/heartbeat-monitor.ts
packages/engines/codex/src/index.ts
packages/engines/codex/src/__tests__/codex-process.test.ts
```

**Exact tasks:**
- [ ] `jsonl-reader.ts`：`readline.createInterface` 逐行 JSON.parse；解析失败记录 warn + 继续（不 crash）；`on('line', cb)` + `on('close', cb)` + `on('error', cb)`
- [ ] `jsonl-writer.ts`：内部队列（数组 + setImmediate 串行消费）；`write(obj)` 序列化 + `process.stdin.write(JSON.stringify(obj) + '\n')`
- [ ] `heartbeat-monitor.ts`：`HeartbeatMonitor(timeout: number, onTimeout: fn)`；每次调用 `reset()` 重置 timer；5 分钟无 reset → 调用 onTimeout
- [ ] `codex-process.ts`：`CodexProcess`，spawn `codex app-server --stdio`；reader/writer/heartbeat 组合；`on('message', cb)`、`on('exit', cb)`、`on('error', cb)`；崩溃重启（最多 2 次）
- [ ] `codex-process-manager.ts`：`Map<runId, CodexProcess>`；`spawn(runId, config)`、`send(runId, msg)`、`kill(runId)`；`killAll()` for graceful shutdown

**Acceptance:**
```bash
pnpm --filter @do-what/codex test -- --testNamePattern process
# 若已安装 codex CLI（可选验证）：
node -e "..."  # 见 tasks/T014 DoD 命令
```

**Constraints:**
- `codex-process.ts` 不要依赖任何 Core 模块，只通过 EventEmitter 暴露事件
- JSONL writer 的队列不能超过 100 条（超过则丢弃最旧条目 + warn）

---

### T015 · Codex 事件归一化 + 审批流 + Tools API MCP Server

**Context:** 将 Codex 原始消息映射到 do-what Protocol。依赖 T014。审批流复用 Core ApprovalMachine。

**Files to touch:**
```
packages/engines/codex/src/event-normalizer.ts
packages/engines/codex/src/approval-handler.ts
packages/engines/codex/src/codex-adapter.ts
packages/engines/codex/src/__tests__/event-normalizer.test.ts
packages/engines/codex/src/__tests__/codex-adapter.test.ts
```

**Exact tasks:**
- [ ] `event-normalizer.ts`：`normalize(raw): BaseEvent | null`；处理 token_stream/plan_node/diff/approval_request/run_complete/run_failed；未知类型返回 null + warn log
- [ ] `approval-handler.ts`：`ApprovalHandler`，监听 EventBus 的 approval 结果，回传 Codex `approval_response` JSONL
- [ ] `codex-adapter.ts`：`CodexAdapter.startRun(config)` → CodexProcessManager.spawn → 监听消息 → normalize → EventBus.publish；`sendInput(runId, input)`；`cancelRun(runId)`
- [ ] 测试：用 T016 fixture 文件驱动 normalizer，验证归一化正确性；approval 超时流程

**Acceptance:**
```bash
pnpm --filter @do-what/codex test
```

**Constraints:**
- normalizer 对未知字段使用 `.passthrough()`，绝对不能因未知字段而 throw
- approval_request 中的 requestId 字段：容错处理（`requestId || id || request_id`）

---

### T016 · Codex Contract Tests

**Context:** Codex 回放测试。依赖 T015。与 T013 结构一致。

**Files to touch:**
```
packages/engines/codex/fixtures/scenario-simple.jsonl
packages/engines/codex/fixtures/scenario-approval.jsonl
packages/engines/codex/fixtures/scenario-cancel.jsonl
packages/engines/codex/src/__tests__/contract/replay.test.ts
```

**Exact tasks:**
- [ ] 录制/手动构造 3 个 fixture
- [ ] `replay.test.ts`：feed 给 EventNormalizer → 断言输出事件序列
- [ ] 验证所有输出事件可被 Protocol schema parse

**Acceptance:**
```bash
pnpm --filter @do-what/codex test -- --testNamePattern contract
```

**Constraints:** 同 T013

---

## E4 – Soul Read Path

---

### T017 · Soul: SQLite DDL

**Context:** Soul 的存储基础。依赖 T007（迁移框架）。soul.db 独立于 state.db，有独立 Worker 线程。DDL 采用方案 B（schema 一步到位，行为分阶段启用），包含 v0.1.x 的三轴模型字段（source/formation_kind/dimension）、动力学、Claim Form 等，多出字段 nullable/dormant。旧 type 字段已废弃。

**Files to touch:**
```
packages/soul/src/db/migrations/v1.ts
packages/soul/src/db/migrations/index.ts
packages/soul/src/db/migration-runner.ts
packages/soul/src/db/soul-worker.ts
packages/soul/src/db/soul-state-store.ts
packages/soul/src/db/schema.ts
packages/soul/src/db/index.ts
packages/soul/src/config.ts
packages/soul/src/__tests__/soul-ddl.test.ts
packages/soul/package.json  (添加 better-sqlite3)
```

**Exact tasks:**
- [ ] `config.ts`：`SOUL_DB_PATH`, `MEMORY_REPO_BASE_PATH` 常量
- [ ] `migrations/v1.ts`：v0.1.x 完整 DDL（4 张表，含三轴 + 动力学 + Claim 字段，dormant 字段标注 [D]）+ FTS5 虚拟表 + 3 个触发器 + 全部索引
- [ ] `soul-worker.ts`：独立 DatabaseWorker（结构同 Core 的 database-worker.ts，连接 soul.db）
- [ ] `soul-state-store.ts`：只读连接 stub（T018/T019 实现具体查询）
- [ ] `schema.ts`：`CueRow`（含三轴 + 动力学 + Claim，dormant 字段标注可选）、`EdgeRow`、`EvidenceRow` interface

**Acceptance:**
```bash
pnpm --filter @do-what/soul test -- --testNamePattern ddl
sqlite3 ~/.do-what/state/soul.db ".tables"
# 预期包含：memory_cues memory_graph_edges evidence_index soul_schema_version
# FTS5 smoke test（见 tasks/T017 文档）
```

**Constraints:**
- FTS5 触发器若创建失败（不支持 FTS5）→ try/catch + warn，继续（不阻塞初始化）
- soul.db 与 state.db 独立，不要在 soul 包中引用 Core 的 DB worker

---

### T018 · Soul: soul.memory_search

**Context:** Soul 读路径第一步。依赖 T017。FTS5 全文检索 + 预算控制。

**Files to touch:**
```
packages/soul/src/search/memory-search.ts
packages/soul/src/search/retrieval-router.ts
packages/soul/src/search/budget-calculator.ts
packages/soul/src/search/embedding-ranker.ts
packages/soul/src/mcp/search-handler.ts
packages/soul/src/__tests__/memory-search.test.ts
```

**Exact tasks:**
- [ ] `budget-calculator.ts`：`estimateTokens(text): number`（字符数 / 4，取整）
- [ ] `embedding-ranker.ts`：stub，直接返回原序（T026 实现）
- [ ] `memory-search.ts`：FTS5 查询（FTS5 不可用时 fallback LIKE）；project_id + track + impact_level 过滤；Bootstrapping Phase 处理（confidence>=0.6 的 Working 级加 `[trial]` 标注）；limit + budget 截断；v0.1.x 阶段可选按 scope/dimension/domain_tags 过滤
- [ ] `retrieval-router.ts`：冷启动注入（Top 1-3，仅 Hint：只返回 gist，不返回 pointers 展开内容）
- [ ] `search-handler.ts`：MCP tool handler，调用 MemorySearchService，发布 MemoryOperationEvent.search

**Acceptance:**
```bash
pnpm --filter @do-what/soul test -- --testNamePattern search
# 端到端（见 tasks/T018 DoD 命令）
```

**Constraints:**
- 返回结果中不要暴露 cue 的完整内容（只有 gist + pointers + score + why），open_pointer 才展开
- FTS5 query sanitization（去除 `()"` 等特殊字符）

---

### T019 · Soul: soul.open_pointer + soul.explore_graph

**Context:** Soul 证据展开。依赖 T018。三级显影 Hint/Excerpt/Full，严格 token 预算。

**Files to touch:**
```
packages/soul/src/pointer/pointer-parser.ts
packages/soul/src/pointer/pointer-key.ts
packages/soul/src/evidence/evidence-extractor.ts
packages/soul/src/evidence/symbol-extractor.ts
packages/soul/src/mcp/open-pointer-handler.ts
packages/soul/src/mcp/explore-graph-handler.ts
packages/soul/src/__tests__/pointer-parser.test.ts
packages/soul/src/__tests__/open-pointer.test.ts
```

**Exact tasks:**
- [ ] `pointer-parser.ts`：`parsePointer(str)` 解析空格分隔的 `key:value` → `{ gitCommit?, repoPath?, symbol?, snippetHash? }`
- [ ] `pointer-key.ts`：排序 key:value → 拼接 → sha256
- [ ] `symbol-extractor.ts`：Tree-sitter 解析（可选，lazy load）+ 正则行范围 fallback
- [ ] `evidence-extractor.ts`：`extract(pointer, level, budget)` → hint（仅 gist，不读文件）/ excerpt（文件片段，200 token 上限）/ full（完整 symbol，800 token 上限），超预算降级
- [ ] `open-pointer-handler.ts`：权限检查（workspace 白名单）+ extract + 更新 evidence_index + 发布 MemoryOperationEvent.open；失效指针 → 记录 `pointer_relocation_needed`
- [ ] `explore-graph-handler.ts`：BFS（最多 `depth` 跳）+ limit 截断

**Acceptance:**
```bash
pnpm --filter @do-what/soul test -- --testNamePattern "pointer|graph"
# open_pointer hint 级不读文件（验证：mock fs.readFile 未被调用）
# open_pointer full 级超预算降级为 excerpt
```

**Constraints:**
- Tree-sitter 作为可选依赖，加载失败不影响基本功能
- evidence_extractor 中不要硬编码语言，symbol 提取规则通用化（正则匹配 function/class/const/def 等关键词）

---

## E5 – Soul Write Path

---

### T020 · Soul: memory_repo Git 初始化 + project_fingerprint

**Context:** Soul 证据存储基础。依赖 T017。

**Files to touch:**
```
packages/soul/src/repo/project-fingerprint.ts
packages/soul/src/repo/memory-repo-manager.ts
packages/soul/src/repo/git-ops-queue.ts
packages/soul/src/repo/junction-creator.ts
packages/soul/src/db/migrations/v2.ts
packages/soul/src/__tests__/fingerprint.test.ts
packages/soul/src/__tests__/memory-repo.test.ts
```

**Exact tasks:**
- [ ] `project-fingerprint.ts`：`computePrimary(path)` → spawn `git remote get-url origin` + branch → sha256；`computeSecondary(path)` → sha256(absPath)；`getFingerprint(path)` → primary || secondary
- [ ] `git-ops-queue.ts`：per-repoPath mutex（Promise chaining）；index.lock 检测（指数退避 3 次后强制删除超过 60s 的 lock 文件）
- [ ] `memory-repo-manager.ts`：`getOrInit(fingerprint)` → mkdir + git init；`commit(msg, files)` → writeFile + git add + git commit；`gc()` async
- [ ] `v2.ts` 迁移：添加 `projects` 表（见 tasks/T020 文档）
- [ ] `junction-creator.ts`：Windows mklink /J（try/catch 失败则 warn）

**Acceptance:**
```bash
pnpm --filter @do-what/soul test -- --testNamePattern "fingerprint|memory-repo"
git -C ~/.do-what/memory/*/memory_repo/ log --oneline
# 预期：initial commit
```

**Constraints:**
- `git` 命令通过 `child_process.spawn` 调用，不用 isomorphic-git
- fingerprint 一旦生成，不因本地路径变化而改变（主键策略）

---

### T021 · Soul: soul.propose_memory_update + Checkpoint 队列

**Context:** 记忆写入的入口。依赖 T020、T017。

**Files to touch:**
```
packages/soul/src/write/proposal-service.ts
packages/soul/src/write/checkpoint-queue.ts
packages/soul/src/mcp/propose-handler.ts
packages/soul/src/db/migrations/v3.ts
packages/core/src/server/soul-routes.ts
packages/soul/src/__tests__/proposal-service.test.ts
```

**Exact tasks:**
- [ ] `v3.ts`：memory_proposals 表（见 tasks/T021 文档）
- [ ] `proposal-service.ts`：`propose(input)` → 计算 `requires_checkpoint`（canon 必须，consolidated 有 pointer 时必须）→ 写 DB → 返回 `{proposal_id, requires_checkpoint, status}`；`autoAccept(id)` for Working 级
- [ ] `checkpoint-queue.ts`：`enqueue(proposal)` + `getPending(project_id)` + `size()`；enqueue 时发布 SystemHealthEvent（通知 UI）
- [ ] `propose-handler.ts`：MCP handler → ProposalService.propose → Working 级自动 accept，非 Working 级入 CheckpointQueue
- [ ] Core 新增 `GET /soul/proposals` 端点（鉴权）

**Acceptance:**
```bash
pnpm --filter @do-what/soul test -- --testNamePattern proposal
# MCP tool 验证（见 tasks/T021 DoD 命令）
```

**Constraints:**
- Working 级 auto-accept 写入率限制：`setImmediate` 批次写入，不超过每秒 10 条
- proposal 记录永不物理删除（审计需要）

---

### T022 · Soul: soul.review_memory_proposal + commit + Bootstrapping

**Context:** 审阅操作，将提案写入持久存储。依赖 T021、T020。

**Files to touch:**
```
packages/soul/src/write/cue-writer.ts
packages/soul/src/write/edge-writer.ts
packages/soul/src/write/repo-committer.ts
packages/soul/src/write/bootstrapping.ts
packages/soul/src/mcp/review-handler.ts
packages/soul/src/__tests__/cue-writer.test.ts
packages/soul/src/__tests__/review-handler.test.ts
```

**Exact tasks:**
- [ ] `cue-writer.ts`：upsert（同 project_id+anchors+source 的 cue update，否则 insert）；晋升逻辑（hit_count>=3 且 pointers 非空 -> Consolidated）
- [ ] `edge-writer.ts`：批量 INSERT OR IGNORE edges
- [ ] `repo-committer.ts`：cue → Markdown（格式见 tasks/T022 假设）→ memory_repo.commit（通过 GitOpsQueue）；仅 Canon/Consolidated 级 commit
- [ ] `review-handler.ts`：accept/edit/reject/hint_only 四路；调用 CueWriter + EdgeWriter + RepoCommitter；发布 MemoryOperationEvent.commit
- [ ] `bootstrapping.ts`：`seedMemory(project_id, seeds)` → 直接写 Consolidated 级；`firstSessionDeepCompile(project_id, diff)` → 调用 T026 接口（暂 stub）

**Acceptance:**
```bash
pnpm --filter @do-what/soul test -- --testNamePattern "review|cue-writer"
# 端到端流程（见 tasks/T022 DoD 命令）
git -C ~/.do-what/memory/*/memory_repo/ log --oneline | head -3
# 预期：Canon 级 cue 已 commit
```

**Constraints:**
- reject 操作不写 memory_cues，但必须更新 memory_proposals.status='rejected'
- hint_only 操作强制将 impact_level 降为 working，不触发 repo commit

---

## E6 – Worktree 并行 + Integrator

---

### T023 · GitOps 队列 + Worktree 分配 + Run 隔离

**Context:** 并行安全的基础。依赖 T012、T015、T008（RunMachine）。

**Files to touch:**
```
packages/tools/src/git/gitops-queue.ts
packages/tools/src/git/worktree-manager.ts
packages/tools/src/git/index.ts
packages/core/src/run/worktree-lifecycle.ts
packages/tools/src/__tests__/gitops-queue.test.ts
packages/tools/src/__tests__/worktree-manager.test.ts
```

**Exact tasks:**
- [ ] `gitops-queue.ts`：`Map<repoPath, Promise>` mutex；`enqueue(repoPath, op)` 串行化；index.lock 检测：EEXIST → 指数退避（100/200/400ms + 0-50ms jitter），5 次后强制删除超 60s 的 lock + warn
- [ ] `worktree-manager.ts`：`allocate(repoPath, runId)` → `git worktree add ~/.do-what/worktrees/<runId> -b wt-<runId>`；`release(runId)` → `git worktree remove --force` + `git branch -D wt-<runId>`；`listOrphans()` + `cleanupOrphans(activeRunIds)` for 启动时清理；最大并发 8（configurable）
- [ ] `worktree-lifecycle.ts`（Core）：订阅 RunMachine started → allocate；订阅 RunMachine terminal → extractPatch（`git diff HEAD`, 保存到 runs.metadata）+ release

**Acceptance:**
```bash
pnpm --filter @do-what/tools test -- --testNamePattern "gitops|worktree"
# 并发测试：2 个并发操作同一 repo，验证串行执行（第 2 个等待第 1 个完成）
```

**Constraints:**
- worktree 目录名不能含特殊字符（runId 必须是 UUID 格式）
- release 操作必须在 RunMachine terminal 后无论成功/失败都执行（用 finally）

---

### T024 · Integrator + Fast Gate

**Context:** 串行合入并行 Run 的产物。依赖 T023。

**Files to touch:**
```
packages/core/src/integrator/integrator.ts
packages/core/src/integrator/dag-builder.ts
packages/core/src/integrator/fast-gate.ts
packages/core/src/integrator/baseline-tracker.ts
packages/core/src/integrator/index.ts
packages/core/src/db/migrations/v2.ts
packages/core/src/__tests__/integrator.test.ts
packages/core/src/__tests__/dag-builder.test.ts
packages/core/src/__tests__/fast-gate.test.ts
```

**Exact tasks:**
- [ ] `packages/protocol/src/events/integration.ts`：`IntegrationEvent`（gate_passed/gate_failed/conflict/replay_requested）+ 更新 `src/events/index.ts`
- [ ] Core state.db `v2.ts`：`diagnostics_baseline(workspace_id, error_count, tool_counts TEXT, updated_at)` 表
- [ ] `dag-builder.ts`：`buildDAG(runs: {runId, touched_paths}[])` → 按 touched_paths 交集建立依赖关系 → 拓扑排序（Kahn 算法）
- [ ] `baseline-tracker.ts`：读写 diagnostics_baseline；`getDelta(current, baseline)` 计算 delta
- [ ] `fast-gate.ts`：`run(workspacePath, touchedPaths): Promise<GateResult>` → spawn tsc/eslint（60s 超时）→ 与 baseline 比较
- [ ] `integrator.ts`：按 DAG 顺序 `git apply` + FastGate；失败 → 广播 IntegrationEvent.gate_failed + 发 replay_requested；冲突 → IntegrationEvent.conflict
- [ ] 编写测试：DAG 排序（含环路检测，环路 → 序列化处理）；FastGate mock；冲突处理

**Acceptance:**
```bash
pnpm --filter @do-what/core test -- --testNamePattern "integrator|dag|fast-gate"
# 验证 DAG builder（见 tasks/T024 DoD 命令）
```

**Constraints:**
- Fast Gate 超时（60s）视为通过（warn），不阻塞合入（避免 CI 卡死）
- IntegrationEvent 必须先更新 packages/protocol，再在 Core 使用

---

## E7 – Memory Compiler + 自我进化

---

### T025 · LocalHeuristics ComputeProvider

**Context:** 永远可用的保底计算。依赖 T022（Soul write path）。纯本地，零 token 消耗。

**Files to touch:**
```
packages/soul/src/compute/provider.ts
packages/soul/src/compute/local-heuristics.ts
packages/soul/src/compute/registry.ts
packages/soul/src/compute/index.ts
packages/soul/src/__tests__/local-heuristics.test.ts
```

**Exact tasks:**
- [ ] `provider.ts`：`ComputeProvider` interface（summarize_diff/embed?/rerank?/cost_estimate/isAvailable）
- [ ] `local-heuristics.ts`：7 条规则（见 tasks/T025 文档）；规则按优先级：格式化检测 → 跳过，export/module/TODO/大变更/接口/重命名 → 产生 Working 级 cue；100ms 超时保护
- [ ] `registry.ts`：`ComputeProviderRegistry`，`getBestAvailable()` → 优先级最高的可用 provider；UI 降级通知（soul_mode: 'basic'）

**Acceptance:**
```bash
pnpm --filter @do-what/soul test -- --testNamePattern heuristic
# 用真实 git diff 测试（见 tasks/T025 DoD 命令）
```

**Constraints:**
- LocalHeuristics 不能有任何网络调用
- 规则逻辑要写成独立函数（易于单独测试和扩展）
- 格式化/空白变更必须被正确跳过（不产生噪音 cue）

---

### T026 · ComputeProvider 接口 + OfficialAPI/CustomAPI + Memory Compiler 触发器

**Context:** 完整记忆能力。依赖 T025、T022。OfficialAPI 用 Anthropic SDK，CustomAPI 用 OpenAI 兼容。

**Files to touch:**
```
packages/soul/src/compute/official-api.ts
packages/soul/src/compute/custom-api.ts
packages/soul/src/compute/daily-budget.ts
packages/soul/src/compiler/memory-compiler.ts
packages/soul/src/compiler/compiler-trigger.ts
packages/soul/src/db/migrations/v4.ts
packages/soul/src/config/soul-config.ts
packages/soul/src/__tests__/memory-compiler.test.ts
packages/soul/src/__tests__/official-api.test.ts
packages/soul/package.json  (添加 anthropic, openai)
```

**Exact tasks:**
- [ ] `v4.ts`：`soul_budgets(date TEXT PRIMARY KEY, project_id TEXT, tokens_used INT, dollars_used REAL, updated_at TEXT)` 表
- [ ] `daily-budget.ts`：读写 soul_budgets；`canAfford(estimate): boolean`；`record(actual)`
- [ ] `official-api.ts`：Anthropic SDK，`summarize_diff` 使用 tool_use 模式（强制 JSON 输出）；model: `claude-haiku-4-5`；`isAvailable()` 检查 ANTHROPIC_API_KEY 环境变量 + 预算
- [ ] `custom-api.ts`：OpenAI client，`baseURL` 从 soul_config 读取；同 OfficialAPI 的 prompt 格式
- [ ] `memory-compiler.ts`：`compile(project_id, diff, summary)` → 获取 bestAvailable provider → 熵门控（LocalHeuristics 先跑，空结果则跳过 LLM）→ 调用 summarize_diff → 对每个 cue_draft 调用 ProposalService.propose
- [ ] `compiler-trigger.ts`：订阅 EventBus RunLifecycleEvent.completed → 延迟 5s → 频率门控（10 分钟/项目）→ `MemoryCompiler.compile`
- [ ] 编写测试：mock Anthropic SDK；预算超限降级；频率门控；熵门控（空 diff 跳过）

**Acceptance:**
```bash
pnpm --filter @do-what/soul test -- --testNamePattern "compiler|official-api|budget"
# 验证 Compiler 自动触发（见 tasks/T026 DoD 命令）
sqlite3 ~/.do-what/state/soul.db \
  "SELECT gist, impact_level, source FROM memory_cues ORDER BY created_at DESC LIMIT 5;"
# 预期：有 source='local_heuristic' 的 cue
```

**Constraints:**
- LLM 调用前必须截断 diff（最大 12000 字符 ≈ 3000 tokens）
- UI 降级提示：仅 LocalHeuristics 可用时，发布 SystemHealthEvent `soul_mode: 'basic'`
- EngineQuota provider 不实现（方案已明确 v1 不启用）

---

### T027 · Lazy Pointer 自愈

**Context:** 指针失效时的按需重定位。依赖 T019（open_pointer 触发入口）、T020（git rename detection）。

**Files to touch:**
```
packages/soul/src/pointer/pointer-relocator.ts
packages/soul/src/pointer/git-rename-detector.ts
packages/soul/src/pointer/symbol-searcher.ts
packages/soul/src/pointer/snippet-matcher.ts
packages/soul/src/pointer/semantic-fallback.ts
packages/soul/src/pointer/healing-queue.ts
packages/soul/src/db/migrations/v5.ts
packages/soul/src/__tests__/pointer-relocator.test.ts
packages/soul/src/__tests__/healing-queue.test.ts
```

**Exact tasks:**
- [ ] `v5.ts`：`refactor_events` 表 + `ALTER TABLE evidence_index ADD COLUMN` 3 个字段（见 tasks/T027 文档）
- [ ] `git-rename-detector.ts`：解析 `git diff --find-renames <sha>^..<sha>` 输出（`similarity index \d+%` 行），写 `refactor_events` 表
- [ ] `symbol-searcher.ts`：`rg --json <symbol> <dir>`（JSON 输出模式）解析候选；ripgrep 不可用时 Node.js fs.readdir + 正则 fallback
- [ ] `snippet-matcher.ts`：Jaccard 相似度（unigram tokenize：`str.split(/\s+/)` → Set），阈值 0.85
- [ ] `semantic-fallback.ts`：只对 Canon 级 cue；调用 `ComputeProvider.embed()`（若可用）→ 余弦相似度排序 → 返回 Top3 候选
- [ ] `pointer-relocator.ts`：四级链（每级失败则降级）；成功 → 更新 evidence_index.relocated_pointer；失败 → 标记 relocation_status
- [ ] `healing-queue.ts`：低优先级队列（`setImmediate` 消费）；速率限制 5 次/分钟；`enqueue(pointer, cue_id)`, `stats()`
- [ ] 集成到 T019 的 `open-pointer-handler.ts`：失效 → `healingQueue.enqueue`
- [ ] Core 新增 `GET /soul/healing/stats` 端点

**Acceptance:**
```bash
pnpm --filter @do-what/soul test -- --testNamePattern "relocat|healing"
# 端到端模拟（见 tasks/T027 DoD 命令）
```

**Constraints:**
- 四级链每级必须有超时（git 2s，ripgrep 3s，snippet 1s，semantic 5s）
- `irrecoverable` 状态的指针不再重试（检查 evidence_index.relocation_status）
- Jaccard 相似度计算在大文件（>10K tokens）时提前截断（只比较前 1000 行）

---

## 执行完毕检查表

执行完所有 27 个 Ticket 后，运行以下最终验证：

```bash
# 1. 全量构建
pnpm -w build

# 2. 全量测试
pnpm -w test

# 3. 端到端 Demo 路径验证（最小可运行 Demo）
pnpm --filter @do-what/core start &
CORE_PID=$!
sleep 1
TOKEN=$(cat ~/.do-what/run/session_token)

# 订阅 SSE
curl -N -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:3847/events > /tmp/events.log &
SSE_PID=$!

# 触发完整 Claude Run（需已安装 claude CLI）
# claude --hooks-file ~/.do-what/claude-hooks.json \
#        --mcp-server http://127.0.0.1:3848 \
#        "列出当前目录文件"

sleep 10
kill $SSE_PID

# 验证事件序列
grep -E "RunLifecycle|ToolExecution|MemoryOperation" /tmp/events.log | head -20

# 4. Soul DB 检查
sqlite3 ~/.do-what/state/soul.db \
  "SELECT COUNT(*) as cue_count FROM memory_cues;"

# 5. memory_repo 检查
git -C ~/.do-what/memory/*/memory_repo/ log --oneline | head -5

kill $CORE_PID
echo "ALL DONE"
```

---

*CODEX_QUEUE.md 生成完毕。共 27 个 Ticket，覆盖 Epic 0-7。*
