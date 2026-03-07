# T006 · Core: Event Bus + State Store + DatabaseWorker

**Epic:** E1 – Core Skeleton
**依赖:** T005（需要 SseManager 引用）、T002（BaseEvent 类型）
**估算改动:** ~400 行

---

## 目标

实现 Core 的事件总线（Event Bus）和基于 `worker_threads` 的 DatabaseWorker，确保主线程的 SSE 推送/事件处理不被 SQLite 同步写操作阻塞。DatabaseWorker 通过 MessagePort 接收写请求并串行处理，主线程只做轻量读。

---

## 范围

**做什么：**
- `EventBus`：基于 Node.js EventEmitter，`emit(event: BaseEvent)` → 同步通知所有本地监听器 + 异步广播 SSE
- `EventBus` 的 `revision` 管理：每条事件自动分配单调递增 revision（原子计数器）
- `DatabaseWorker`：`worker_threads` 子线程，持有唯一写连接（`better-sqlite3` WAL 模式）
  - MessagePort 协议：`{ type: 'write', payload: DbWriteRequest }` → `{ type: 'result', ok: boolean, error? }`
  - 串行处理写请求（内部队列，不并发）
  - 批次写入：每批最多 5 条，批间 `setImmediate` yield
- 主线程读连接：只读模式 `better-sqlite3` 连接（与写连接隔离）
- `StateStore`：封装读连接，提供 `getEventLog(sinceRevision)`, `getSnapshot()` 等轻量读方法
- `EventBus.publish(event)` 流程：1) 分配 revision → 2) 发送 DB 写请求（异步，不等待结果） → 3) 广播 SSE → 4) 通知本地监听器

**不做什么：**
- 不创建 SQLite 表结构（留 T007，本 Ticket 只建立连接与 Worker 框架）
- 不实现状态机（留 T008）

---

## 假设

- SQLite 文件路径：`~/.do-what/state/state.db`（由 `config.ts` 提供）
- WAL 模式：`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`
- `busy_timeout`：5000ms（防止 DB locked 错误）
- DatabaseWorker 的写队列满（>1000 条）时：丢弃最老的写请求 + 记录警告（不阻塞主线程）

---

## 文件清单

```
packages/core/src/eventbus/event-bus.ts
packages/core/src/eventbus/revision-counter.ts
packages/core/src/eventbus/index.ts
packages/core/src/db/database-worker.ts          ← worker_threads 子线程脚本
packages/core/src/db/worker-client.ts            ← 主线程侧的 Worker 客户端
packages/core/src/db/read-connection.ts          ← 主线程只读连接
packages/core/src/db/state-store.ts              ← 轻量读查询封装
packages/core/src/db/index.ts
packages/core/src/__tests__/event-bus.test.ts
packages/core/src/__tests__/database-worker.test.ts
packages/core/package.json                       ← 添加 better-sqlite3 依赖
```

---

## 接口与 Schema 引用

- `BaseEvent`（`@do-what/protocol`）：EventBus 的泛型约束
- `RevisionCounter`：协议层要求每条事件有单调递增 `revision`

---

## 实现步骤

1. `packages/core/package.json` 添加：`better-sqlite3`, `@types/better-sqlite3`
2. 创建 `src/eventbus/revision-counter.ts`：`RevisionCounter` 类，内部 `count: number`，`next()` 返回自增值（单线程安全，无需原子操作）
3. 创建 `src/db/database-worker.ts`（Worker 线程脚本）：
   - 接收 `parentPort.on('message')` 处理写请求
   - 内部维护写队列（`Array<{request, resolve}>`）
   - 串行消费队列：每批 5 条，批间 `setImmediate`
   - 写完成后 `parentPort.postMessage({ type: 'result', ... })`
4. 创建 `src/db/worker-client.ts`：封装 `new Worker(...)` + `postMessage` + Promise 回调，提供 `write(request): Promise<void>` API
5. 创建 `src/db/read-connection.ts`：只读模式 `better-sqlite3` 连接，`PRAGMA query_only=true`
6. 创建 `src/eventbus/event-bus.ts`：
   - 内部维护 `SseManager` 引用 + 本地 `EventEmitter`
   - `publish(event)` → 分配 revision → 异步 `workerClient.write(...)` → `sseManager.broadcast(event)` → `emitter.emit(event.type, event)`
7. 编写测试：EventBus publish → SSE broadcast 验证；DatabaseWorker 串行写入验证（不丢失顺序）

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/core test
# 预期：event-bus.test + database-worker.test 全部通过

# 集成验证（需先启动 Core）
pnpm --filter @do-what/core start &
CORE_PID=$!
sleep 1

TOKEN=$(cat ~/.do-what/run/session_token)

# 订阅 SSE
curl -N -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3847/events &
SSE_PID=$!

# 通过调试端点触发一条 mock 事件（临时开发端点）
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"RunLifecycle","status":"created","runId":"test-1","source":"core","workspaceId":"ws1"}' \
  http://127.0.0.1:3847/_dev/publish

# 预期：SSE 流出现 event: RunLifecycle.created

kill $SSE_PID $CORE_PID
```

---

## 风险与降级策略

- **风险：** `worker_threads` 中 `better-sqlite3` 加载失败（Windows 原生模块路径问题）
  - **降级：** 捕获加载错误，降级为主线程同步写（打印警告），保持功能可用；后续用 `child_process` 替代 `worker_threads` 作为备选
- **风险：** DatabaseWorker 崩溃导致写丢失
  - **降级：** 主线程监听 Worker `error`/`exit` 事件，自动重启 Worker（最多 3 次），超过则标记 Core 进入 degraded 模式（只读 + SSE 广播 SystemHealth 事件警告）
