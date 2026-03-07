# T008 · Core: xstate v5 状态机（Run + Engine + Approval）

**Epic:** E1 – Core Skeleton
**依赖:** T004（机器类型骨架）、T006（EventBus）、T007（DB schema）
**估算改动:** ~500 行

---

## 目标

用 xstate v5 实现三台状态机的完整逻辑：RunMachine（Run 生命周期）、EngineMachine（引擎连接状态）、ApprovalMachine（审批队列）。所有状态转换通过 EventBus 发布对应的 Protocol 事件，并通过 DatabaseWorker 持久化状态变更。

---

## 范围

**做什么：**

**RunMachine（每个 Run 一个实例）：**
- 状态：`idle → created → started → running → waiting_approval → completed | failed | cancelled | interrupted`
- 转换触发：`START`, `TOOL_REQUEST`（→ waiting_approval）, `TOOL_RESOLVED`（→ running）, `COMPLETE`, `FAIL`, `CANCEL`, `INTERRUPT`
- Guard：`TOOL_REQUEST` 时检查 Policy Engine（见 T009），auto-allow 则不进入 waiting_approval，直接继续 running
- Action：每次状态变更 → `eventBus.publish(RunLifecycleEvent)` + `dbWorker.write(UPDATE runs SET status=...)`
- `AgentStuckException` 检测：同一 runId 中同一 toolName 连续失败 N 次（默认 3）→ 触发 `INTERRUPT`（`reason: 'agent_stuck'`）

**EngineMachine（全局各一台）：**
- 状态：`disconnected → connecting → connected → degraded → circuit_open`
- 转换：连接成功/断连/heartbeat_timeout/连续解析错误
- 断路器：连续解析错误 >= 5 次 → `circuit_open`（拒绝新 Run）
- Action：发布 `SystemHealthEvent`

**ApprovalMachine（全局一台，管理审批队列）：**
- 状态：`idle ↔ waiting`
- `ENQUEUE(item)` → 若 idle 则开始处理队首；`USER_APPROVE/USER_DENY` → 通知对应 RunMachine
- 超时（默认 5 分钟无响应）→ 自动 `deny` 并通知 RunMachine
- 持久化：入队/出队通过 DatabaseWorker 写 `approval_queue` 表

**RunRegistry：**
- 维护所有活跃 RunMachine 实例的 Map（`runId → RunMachine actor`）
- 提供 `create(config)`, `get(runId)`, `send(runId, event)`, `destroyCompleted()` 方法

**不做什么：**
- 不实现 Policy Engine 判断逻辑（留 T009，本 Ticket 调用 T009 的接口桩）
- 不接入引擎适配器（留 E2/E3）

---

## 假设

- xstate v5 使用 `setup({...}).createMachine({...})` API
- 每个 RunMachine 实例在 `createActor()` 后调用 `.start()` 激活
- 水合（rehydration）：Core 重启后从 `runs` 表读取所有非 terminal 状态的 Run，标记为 `interrupted`（不重建 actor，只改 DB 状态）
- `AgentStuckException` 阈值通过 `config.ts` 导出的 `AGENT_STUCK_THRESHOLD`（默认 3）控制

---

## 文件清单

```
packages/core/src/machines/run-machine.ts
packages/core/src/machines/engine-machine.ts
packages/core/src/machines/approval-machine.ts
packages/core/src/machines/run-registry.ts
packages/core/src/machines/index.ts
packages/core/src/__tests__/run-machine.test.ts
packages/core/src/__tests__/engine-machine.test.ts
packages/core/src/__tests__/approval-machine.test.ts
```

---

## 接口与 Schema 引用

- `RunContext, RunEvent`（`@do-what/protocol`）：RunMachine 的类型约束
- `EngineContext, EngineEvent`（`@do-what/protocol`）：EngineMachine 的类型约束
- `ApprovalContext, ApprovalEvent`（`@do-what/protocol`）：ApprovalMachine 的类型约束
- `RunLifecycleEvent`（`@do-what/protocol`）：状态变更时 publish 的事件类型
- `SystemHealthEvent`（`@do-what/protocol`）：引擎状态变更时 publish 的事件类型

---

## 实现步骤

1. 创建 `src/machines/run-machine.ts`：`setup({types: {context: RunContext, events: RunEvent}}).createMachine({...})` 实现完整状态转换图；actions 中注入 `eventBus` 和 `dbWorker`（通过 machine input 传入）
2. 创建 `src/machines/engine-machine.ts`：断路器逻辑（`failureCount` 累加，`circuit_open` 状态下拒绝新 Run）
3. 创建 `src/machines/approval-machine.ts`：队列管理 + 超时 actor（`fromPromise` 或 `after`）
4. 创建 `src/machines/run-registry.ts`：`RunRegistry` 类，`create()` 内部调用 `createActor(runMachine, { input: { runId, ... } }).start()`
5. 实现水合函数 `rehydrateRuns(db)`：查询 `running`/`waiting_approval` 状态的 runs → 批量 `UPDATE runs SET status='interrupted'` → 发布 `RunLifecycle.interrupted` 事件
6. 编写测试：用 `createActor` + `inspect` 验证状态转换序列；AgentStuckException 触发测试

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/core test -- --testNamePattern machine
# 预期：run-machine、engine-machine、approval-machine 测试全部通过

# 关键测试场景验证（输出在测试报告中）：
# ✓ RunMachine: idle → created → started → running → completed（正常流）
# ✓ RunMachine: running → waiting_approval → running（工具审批流）
# ✓ RunMachine: AgentStuckException（同工具连续失败 3 次 → interrupted）
# ✓ EngineMachine: connected → circuit_open（5 次解析错误）
# ✓ ApprovalMachine: 5 分钟超时自动 deny
```

---

## 风险与降级策略

- **风险：** xstate v5 actor 内存泄漏（completed actor 未销毁）
  - **降级：** RunRegistry 在 actor 进入 terminal 状态（completed/failed/cancelled/interrupted）后，延迟 30 秒调用 `.stop()` 并从 Map 移除
- **风险：** ApprovalMachine 超时计时器在 Core 重启时丢失
  - **降级：** Core 重启后从 `approval_queue` 表恢复 pending 审批，检查 `created_at` 是否超过超时阈值；若已超时则直接 deny，不重建计时器
