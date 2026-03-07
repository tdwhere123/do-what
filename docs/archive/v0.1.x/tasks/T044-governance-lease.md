# T044 · governance-lease（预飞行治理 + 原生表面报告）

**Epic:** v0.1.x Phase 3 — 编排与治理
**路线:** G：GovernanceLease 预飞行治理 + NativeSurfaceReport
**依赖:** T042（FocusSurface），T043（IntegrationGate 漂移判定）
**优先级:** P3
**估算改动:** ~400 行

---

## 目标

实现 `GovernanceLease`（并行 Run 启动前的预飞行治理快照）和 `NativeSurfaceReport`（三状态表面报告：aligned/shadowed/conflicting），
确保每个并行分支在启动前通过治理检查。

---

## 范围

**做什么：**

**GovernanceLease 类型（`packages/protocol/src/core/governance.ts`）：**
```typescript
type GovernanceLease = {
  lease_id: string;             // UUID
  run_id: string;               // 关联 Run
  surface_id: string;           // 关联 FocusSurface
  valid_snapshot: FocusSurface; // 启动时的 surface 快照（不可变）
  conflict_conclusions: ConflictConclusion[];  // 已知冲突结论
  invalidation_conditions: InvalidationCondition[];  // 失效条件
  issued_at: string;
  expires_at: string;           // 默认：issued_at + 4h（单个 Run 最长执行时间）
  status: 'active' | 'invalidated' | 'expired';
}

type ConflictConclusion = {
  conflicting_surface_ids: string[];  // 与本 surface 冲突的其他 surface
  conflict_kind: 'path_overlap' | 'schema_conflict' | 'migration_conflict';
  resolution: 'serialize' | 'allow_soft' | 'block';
}

type InvalidationCondition = {
  trigger: 'main_commit' | 'schema_change' | 'migration_added';
  affected_paths: string[];
}
```

**NativeSurfaceReport（`packages/core/src/governance/native-surface-report.ts`）：**
```typescript
type NativeSurfaceReport = {
  report_id: string;
  workspace_id: string;
  generated_at: string;
  surfaces: SurfaceStatus[];
}

type SurfaceStatus = {
  surface_id: string;
  run_id: string;
  status: 'aligned' | 'shadowed' | 'conflicting';
  // aligned:     FocusSurface 与主干基准一致，无漂移
  // shadowed:    另一个 Run 的 surface 完全覆盖本 surface（合并后本 surface 无新内容）
  // conflicting: 两个 surface 有 hard_stale 级别的文件交叉
  lease_id?: string;
  drift_kind?: DriftKind;
}

async function generateReport(workspace_id: string): Promise<NativeSurfaceReport>;
```

**预飞行治理流程（`packages/core/src/governance/preflight.ts`）：**
1. 并行 Run 请求启动（`run_start_requested` 事件）
2. 计算 `FocusSurface`（由编排层提供）
3. 查询已有 `GovernanceLease`（同一 workspace 的 active lease）
4. 运行 `NativeSurfaceReport`，识别冲突
5. 若无 `conflicting` surface：签发新 `GovernanceLease`，允许启动
6. 若有 `conflicting` surface：
   - `conflict_kind = path_overlap`：签发 lease（带冲突结论），限制为 Soft-Stale 允许合并
   - `conflict_kind = schema_conflict | migration_conflict`：拒绝启动（`run_start_denied` 事件）

**GovernanceLease 失效：**
- 主干有新提交 + 提交涉及 `invalid_conditions.affected_paths`：自动失效
- 失效后 Run 进入 `governance_invalid` 状态（新增状态）
- Run 可选择：重新申请 lease（重算 FocusSurface）或降级串行

**不做什么：**
- 不实现 lease 的分布式协调（单节点，内存 + SQLite）
- 不实现 GovernanceLease 的用户审批 UI
- 不处理超过 10 个并行 Run 的复杂冲突图（P3 范围内 ≤ 5 个并行 Run）

---

## 假设

- `GovernanceLease` 存储在 `state.db` 的 `governance_leases` 表（migration 008）
- 失效检测：主干提交通过 `run_completed` 事件触发（主干 Run 完成即视为主干更新）
- 单个 workspace 最多 5 个并发 Run（超过时拒绝新启动）

---

## 文件清单

```
packages/protocol/src/core/governance.ts              ← GovernanceLease + NativeSurfaceReport 类型
packages/core/src/governance/native-surface-report.ts ← NativeSurfaceReport 生成
packages/core/src/governance/preflight.ts             ← 预飞行治理流程
packages/core/src/governance/lease-manager.ts         ← GovernanceLease 签发/失效
packages/core/src/db/migrations/008_governance_lease.sql
packages/core/src/__tests__/governance-lease.test.ts
packages/core/src/__tests__/native-surface-report.test.ts
```

---

## DoD + 验收命令

```bash
# 测试预飞行治理（无冲突场景）
pnpm --filter @do-what/core test -- --testNamePattern "governance-lease"

# 测试 NativeSurfaceReport 三种状态
pnpm --filter @do-what/core test -- --testNamePattern "native-surface-report"

# 测试 migration conflict 拒绝启动
pnpm --filter @do-what/core test -- --testNamePattern "preflight-conflict"

# 测试 lease 失效（主干提交触发）
pnpm --filter @do-what/core test -- --testNamePattern "lease-invalidation"
```

**DoD 标准：**
- [ ] `NativeSurfaceReport` 三种状态（aligned/shadowed/conflicting）各有测试
- [ ] `migration_conflict` 场景下新 Run 被拒绝启动
- [ ] `path_overlap` 场景下 Run 启动但带冲突结论
- [ ] Lease 超过 4h 自动 `expired`（定时检查）

---

## 风险与降级策略

- **风险：** 冲突图计算复杂度高（5 个并行 Run 的两两比较）
  - **降级：** 限制并发 Run 数 ≤ 5，两两比较复杂度 O(25)，可接受
- **风险：** GovernanceLease 失效后 Run 无法感知（SSE 通知丢失）
  - **降级：** Run 每次调用 PolicyEngine 时，额外检查 lease 状态（不只依赖 SSE 通知）
