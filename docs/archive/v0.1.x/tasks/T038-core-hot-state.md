# T038 · core-hot-state（CoreHotState 内存控制态）

**Epic:** v0.1.x Phase 2 — Core 四层分离
**路线:** C：控制态与 Projection 分离（第一步：建立热态内存对象）
**依赖:** T029（事件减法后事件类型稳定），T031（概念统一）
**优先级:** P2
**估算改动:** ~400 行

---

## 目标

从 EventLog 快照中提取 `CoreHotState` 内存对象，
包含控制流所需的最小状态集合（Run状态/Node状态/审批结果/活跃 checkpoint），
替代 `StateStore` 直接查询 `event_log` 的方式。

---

## 范围

**做什么：**

**CoreHotState 类型（`packages/protocol/src/core/hot-state.ts`）：**
```typescript
type CoreHotState = {
  runs: Map<string, RunHotState>;
  engines: Map<string, EngineHotState>;
  pending_approvals: Map<string, ApprovalHotState>;
  active_checkpoints: Map<string, CheckpointHotState>;
  last_event_seq: number;       // 最后处理的事件序号（用于增量重放）
}

type RunHotState = {
  run_id: string;
  status: RunStatus;            // 来自 RunMachine 当前状态
  workspace_id: string;
  active_node_id?: string;
  started_at: string;
  updated_at: string;
}

type EngineHotState = {
  engine_id: string;
  kind: 'claude' | 'codex';
  status: EngineStatus;
  current_run_id?: string;
}

type ApprovalHotState = {
  approval_id: string;
  run_id: string;
  tool_name: string;
  status: 'pending' | 'approved' | 'denied';
  requested_at: string;
}

type CheckpointHotState = {
  checkpoint_id: string;
  run_id: string;
  active: boolean;
  triggered_at: string;
}
```

**HotStateManager（`packages/core/src/state/hot-state-manager.ts`）：**
```typescript
class HotStateManager {
  private state: CoreHotState;

  // 冷启动：从 event_log 重放到最新状态
  async bootstrap(): Promise<void>;

  // 增量更新：每个新事件到达时调用
  apply(event: CoreEvent): void;

  // 只读访问器（不暴露 Map 引用，返回冻结对象）
  getRunState(run_id: string): Readonly<RunHotState> | undefined;
  getEngineState(engine_id: string): Readonly<EngineHotState> | undefined;
  getPendingApprovals(): Readonly<ApprovalHotState>[];
  snapshot(): Readonly<CoreHotState>;
}
```
- `bootstrap()` 流程：
  1. 从 SQLite `event_log` 读取所有事件（按 seq 排序）
  2. 逐一调用 `apply()`，重建内存状态
  3. 记录 `last_event_seq`
- `apply()` 是纯同步函数，不允许 async/await（确保事件处理无延迟）
- 状态修改使用不可变更新（返回新对象，不修改现有 Map 中的对象）

**StateStore 迁移：**
- 将 `packages/core/src/state/state-store.ts` 中直接查询 `event_log` 的路径
  替换为 `HotStateManager.getRunState()` / `getPendingApprovals()`
- 保留 `StateStore` 作为门面类（不改变调用方接口）

**不做什么：**
- 不实现 Projection 层（交由 T039）
- 不实现 Ack Overlay（交由 T040）
- 不删除 `event_log`（日志仍是真相源，HotState 是派生的）

---

## 假设

- `packages/core/src/state/state-store.ts` 存在，且有直接查询 `event_log` 的代码
- 事件回放速度：1000 个事件 < 50ms（内存操作，无 I/O）
- `CoreHotState` 内存占用：每个 Run ~200 字节，10000 个 Run 约 2MB（可接受）

---

## 文件清单

```
packages/protocol/src/core/hot-state.ts           ← CoreHotState 类型定义
packages/core/src/state/hot-state-manager.ts      ← HotStateManager 实现
packages/core/src/state/state-store.ts            ← 迁移为使用 HotStateManager
packages/core/src/__tests__/hot-state.test.ts     ← 新建测试
packages/core/src/__tests__/hot-state-bootstrap.test.ts  ← 重放测试
```

---

## DoD + 验收命令

```bash
# 测试 HotState 基础操作
pnpm --filter @do-what/core test -- --testNamePattern "hot-state"

# 测试冷启动重放
pnpm --filter @do-what/core test -- --testNamePattern "hot-state-bootstrap"

# 验证不可变性（apply 后旧快照不变）
pnpm --filter @do-what/core test -- --testNamePattern "hot-state-immutable"

# 全量 core 测试
pnpm --filter @do-what/core test
```

**DoD 标准：**
- [ ] `bootstrap()` 从 0 事件重放到 1000 事件 < 50ms
- [ ] `apply()` 为纯同步函数（无 async/await）
- [ ] 旧快照在 `apply()` 后不被修改（不可变约束）
- [ ] `StateStore` 接口不变（调用方无感迁移）

---

## 风险与降级策略

- **风险：** 历史 event_log 事件数量巨大（>100k），bootstrap 时间过长
  - **降级：** 引入 `hot_state_snapshot` 定期落盘（每 1000 事件），bootstrap 从最近快照开始重放（增量）
- **风险：** `apply()` 中某个事件类型未处理导致状态不一致
  - **降级：** 未知事件类型：warn + 跳过（不更新 HotState），`last_event_seq` 仍递增
