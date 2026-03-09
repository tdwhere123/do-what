# T043 · integration-gate（IntegrationGate 三类漂移 + 防活锁）

**状态:** ✅ 完成

**Epic:** v0.1.x Phase 3 — 编排与治理
**路线:** F（续）：三类漂移判定 + 防活锁机制
**依赖:** T042（FocusSurface + BaselineLock 已建立）
**优先级:** P3
**估算改动:** ~450 行

---

## 目标

实现 `IntegrationGate`：基于 `BaselineLock` 判断三类漂移（Ignore/Soft-Stale/Hard-Stale），
控制并行分支的合并时机，防止活锁（单分支最多 reconcile 1 次，二次 Hard-Stale 降级串行）。

---

## 范围

**做什么：**

**三类漂移定义（`packages/protocol/src/core/drift.ts`）：**
```typescript
type DriftKind = 'ignore' | 'soft_stale' | 'hard_stale';

// 判定规则：
// ignore:     FocusSurface 路径集合与主干变更无交叉（disjoint path sets）
// soft_stale: 有交叉，但仅文档/测试/非核心文件（ArtifactKind = test_file | config）
// hard_stale: 有交叉，且涉及 source_file | schema_type | migration
```

**IntegrationGate 实现（`packages/core/src/governance/integration-gate.ts`）：**
```typescript
class IntegrationGate {
  assess(
    branch_lock: BaselineLock,
    main_current_fingerprint: string,
    main_changed_files: FileSnapshot[]
  ): DriftAssessment;

  // 调度合并时机
  canMerge(run_id: string): MergeDecision;
}

type DriftAssessment = {
  drift_kind: DriftKind;
  overlapping_files: string[];  // 交叉文件列表
  assessment_reason: string;    // 可读原因
}

type MergeDecision = {
  allowed: boolean;
  reason: 'no_drift' | 'soft_stale_ok' | 'hard_stale_reconcile' | 'hard_stale_serialize' | 'already_reconciled';
  reconcile_count: number;      // 本 run 已 reconcile 次数
}
```

**防活锁机制（`packages/core/src/governance/reconcile-tracker.ts`）：**
- 内存 Map：`run_id → reconcile_count`
- 规则：
  - 首次 Hard-Stale：允许 reconcile（`reconcile_count` 从 0 → 1）
  - 第二次 Hard-Stale：拒绝合并，标记 `hard_stale_serialize`，降级为串行执行
  - Soft-Stale：允许合并（不计入 reconcile_count）
  - Ignore：直接允许合并

**与 Integrator 集成（不修改 FastGate）：**
- `IntegrationGate` 在 `Integrator.integrateCandidate()`（私有方法，`packages/core/src/integrator/integrator.ts` 第 101 行）的 patch apply **之前**调用，即在 `this.gitQueue.enqueue()` 之前
- FastGate 是代码质量门控（tsc/eslint/test），与漂移判定无关，**不修改 fast-gate.ts**
- 集成点为 `packages/core/src/integrator/integrator.ts`，不是 `fast-gate.ts`

调用顺序：
```
integrateCandidate(candidate)
  ↓
  IntegrationGate.assess(branch_lock, main_fingerprint, ...)   ← 新增
  ↓ hard_stale 二次 → 直接 return false（不继续 patch+gate）
  ↓ ignore / soft_stale / hard_stale 首次 → 继续
  gitQueue.enqueue(apply patch)
  ↓
  FastGate.run()（不变）
```

**并行分支降级串行流程：**
1. `hard_stale_serialize` 决策触发
2. `Integrator`（`packages/core/src/integrator/integrator.ts`）停止当前并行 Run
3. 发出 `run_serialized` 事件（新增，需在 T029 之后的 protocol 中添加）
4. 将任务重新入队为串行执行

**不做什么：**
- 不实现自动 reconcile（仅判定，不执行合并操作）
- 不修改 git merge 逻辑（合并由 `packages/tools` 中的 GitOpsQueue 处理）
- 不实现超过 2 次 Hard-Stale 后的重试策略

---

## 假设

- `main_current_fingerprint` 来自主干的最新 BaselineLock（每次主干提交后更新）
- `DriftKind.soft_stale` 不阻塞合并，只记录 warn 日志
- `run_serialized` 事件在 T029 后作为新增事件（不删减事件）
- `packages/core/src/integrator/fast-gate.ts` 的 `FastGate.run()` 只做代码质量门控（tsc/eslint/test），**与漂移判定无关**；`IntegrationGate` 在 FastGate 之前运行，两者职责正交，不存在集成或替换关系
- 不存在 `orchestration/orchestrator.ts`；编排入口是 `integrator/integrator.ts` 的 `Integrator.submit()`

---

## 文件清单

```
packages/protocol/src/core/drift.ts                   ← DriftKind + DriftAssessment 类型
packages/core/src/governance/integration-gate.ts      ← IntegrationGate 实现（新建目录）
packages/core/src/governance/reconcile-tracker.ts     ← 防活锁追踪
packages/core/src/integrator/integrator.ts            ← 在 integrateCandidate() 中集成 IntegrationGate（已有文件，添加调用）
packages/core/src/__tests__/integration-gate.test.ts
packages/core/src/__tests__/reconcile-tracker.test.ts
```
注意：**不修改** `packages/core/src/integrator/fast-gate.ts`。

---

## DoD + 验收命令

```bash
# 测试三类漂移判定
pnpm --filter @do-what/core test -- --testNamePattern "integration-gate"

# 测试防活锁：第二次 Hard-Stale 降级
pnpm --filter @do-what/core test -- --testNamePattern "reconcile-tracker"

# 测试 Ignore 判定（disjoint path sets → 允许合并）
pnpm --filter @do-what/core test -- --testNamePattern "drift-ignore"

# 全量测试
pnpm --filter @do-what/core test
```

**DoD 标准：**
- [ ] 三类漂移各有测试用例（9 个场景：3 种漂移 × 3 种 artifact_kind 组合）
- [ ] 第一次 Hard-Stale 允许 reconcile，第二次触发 `hard_stale_serialize`
- [ ] `reconcile_count` 内存追踪在 run 结束时清理（不泄漏）
- [ ] FastGate 现有测试继续通过（不回归）

---

## 风险与降级策略

- **风险：** `main_current_fingerprint` 更新不及时（主干活跃时大量并行 Run 同时拿到旧 fingerprint）
  - **降级：** IntegrationGate 在 `canMerge()` 时重新计算主干 fingerprint（不使用缓存），确保判定基于最新状态
- **风险：** artifact_kind 分类不准确（测试文件被误判为 source_file）
  - **降级：** 误判为 `hard_stale` 而非 `soft_stale`（保守原则），不会导致错误合并，只会多一次串行降级
