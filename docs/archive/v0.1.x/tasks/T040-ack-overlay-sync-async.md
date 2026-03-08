# T040 · ack-overlay-sync-async（Ack Overlay + 路径硬切分）

**Epic:** v0.1.x Phase 2 — Core 四层分离
**路线:** C/D：Ack Overlay 引入 + 同步/异步路径硬切分
**依赖:** T038（CoreHotState），T039（Projection 层）
**优先级:** P2
**估算改动:** ~300 行
**状态:** ✅ 完成（ack-overlay: 2 + sync-async-split: 1 测试通过；GET /acks/:ackId 实现在 routes.ts）

---

## 目标

引入 `AckOverlay`（ack_id/entity_type/revision/status），
将同步路径（摄取 + 判定 + 状态迁移）与异步路径（Projection 更新 + Soul 记忆 + SSE 推送）硬切分，
确保控制流不等待任何异步操作。

---

## 范围

**做什么：**

**AckOverlay 类型（`packages/protocol/src/core/ack.ts`）：**
```typescript
type AckOverlay = {
  ack_id: string;             // UUID，每次事件处理唯一
  entity_type: 'run' | 'engine' | 'approval' | 'checkpoint';
  entity_id: string;
  revision: number;           // 单调递增，每次状态变更 +1
  status: 'pending' | 'committed' | 'failed';
  committed_at?: string;      // ISO timestamp
}
```

**同步路径（`packages/core/src/event-handler/sync-path.ts`）：**
```
同步路径内容（全部必须 < 10ms）：
1. 事件 schema 验证（zod parse）
2. HotState.apply()（纯同步状态更新）
3. DatabaseWorker 入队（event_log 写入，fire-and-forget）
4. AckOverlay 创建（返回 ack_id 给调用方）
5. PolicyEngine 判定（缓存查询，< 5ms）
```

**异步路径（`packages/core/src/event-handler/async-path.ts`）：**
```
异步路径内容（不阻塞同步路径）：
1. Projection 失效通知
2. Soul 记忆摄取（通过 Soul HTTP API 或 EventBus）
3. SSE 推送（UI 更新）
4. AckOverlay 状态更新（committed / failed）
```

**切分实现（`packages/core/src/event-handler/event-dispatcher.ts`）：**
```typescript
async function dispatch(event: CoreEvent): Promise<AckOverlay> {
  // 同步路径：必须在 10ms 内完成
  const ack = await runSync(event);

  // 异步路径：不 await，立即返回
  runAsync(event, ack).catch(err => logger.error('async-path-error', err));

  return ack;
}
```
- `runSync()` 失败（如 zod 验证失败）：同步抛出错误，`ack.status = 'failed'`
- `runAsync()` 失败：只记录 error 日志，不影响已返回的 ack

**AckOverlay 追踪（`packages/core/src/state/ack-tracker.ts`）：**
- 内存 Map：`ack_id → AckOverlay`
- 过期清理：committed/failed 的 overlay 保留 60s 后清除
- API：`GET /acks/:ack_id` 供调用方查询异步结果

**不做什么：**
- 不实现 ack 的持久化（内存存储，重启清空）
- 不实现调用方的 ack 超时等待（调用方通过 SSE 或轮询 `/acks/:ack_id` 获取结果）
- 不修改 PolicyEngine 的判定逻辑

---

## 假设

- 所有 Core 事件均经过 `event-dispatcher.ts` 统一入口（T006 EventBus 已实现）
- `PolicyEngine.evaluate()` 已是纯缓存查询（< 5ms），无需改造
- 同步路径目标 < 10ms，不含 Soul API 调用或 SSE 推送

---

## 文件清单

```
packages/protocol/src/core/ack.ts                     ← AckOverlay 类型
packages/core/src/event-handler/sync-path.ts          ← 同步路径（< 10ms）
packages/core/src/event-handler/async-path.ts         ← 异步路径（fire-and-forget）
packages/core/src/event-handler/event-dispatcher.ts   ← 切分入口
packages/core/src/state/ack-tracker.ts                ← AckOverlay 追踪
packages/core/src/routes/ack-routes.ts                ← GET /acks/:ack_id
packages/core/src/__tests__/ack-overlay.test.ts
packages/core/src/__tests__/sync-async-split.test.ts
```

---

## DoD + 验收命令

```bash
# 测试 Ack Overlay 创建与追踪
pnpm --filter @do-what/core test -- --testNamePattern "ack-overlay"

# 测试同步路径 < 10ms
pnpm --filter @do-what/core exec vitest bench src/__tests__/sync-path.bench.ts

# 验证异步路径失败不影响同步路径返回
pnpm --filter @do-what/core test -- --testNamePattern "sync-async-isolation"

# 全量测试
pnpm --filter @do-what/core test
```

**DoD 标准：**
- [ ] `dispatch()` 的同步路径（P99）< 10ms（基准测试验证）
- [ ] 异步路径错误不导致 dispatch 返回值变化
- [ ] `GET /acks/:ack_id` 可正确查询 pending/committed/failed 状态
- [ ] AckOverlay 60s 后自动清理（内存不泄漏）

---

## 风险与降级策略

- **风险：** `runSync()` 中 DatabaseWorker 入队超时（写压力大时队列积压）
  - **降级：** DatabaseWorker 入队为 fire-and-forget（不等待写入完成），同步路径不受写压力影响
- **风险：** 异步路径（Soul API 调用）长期失败，AckOverlay 永久处于 pending 状态
  - **降级：** AckOverlay 超时（30s 未 committed）自动标记为 `failed`，记录 error 日志
