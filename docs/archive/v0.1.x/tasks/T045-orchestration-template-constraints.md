# T045 · orchestration-template-constraints（编排减法 + 四种允许拓扑）

**Epic:** v0.1.x Phase 3 — 编排与治理
**路线:** E：编排减法 + 四种允许拓扑约束
**依赖:** T042（FocusSurface），T044（GovernanceLease 治理框架）
**优先级:** P3
**估算改动:** ~350 行

---

## 目标

约束编排系统仅允许 4 种合法拓扑（线性/单层并发汇聚/受控 revise loop/有界 fan-out），
禁止任意自由 DAG；实现拓扑验证器，在 Run 启动前检查编排模板合法性。

---

## 范围

**做什么：**

**四种合法拓扑定义（`packages/protocol/src/core/topology.ts`）：**
```typescript
type TopologyKind =
  | 'linear'              // 线性：A → B → C，无分叉
  | 'parallel_merge'      // 单层并发汇聚：[A, B, C] → Merge（最多 5 个并行）
  | 'revise_loop'         // 受控 revise loop：A → B → (条件) → A（最多 3 次循环）
  | 'bounded_fan_out';    // 有界 fan-out：A → [B1, B2, B3] → A（扇出数 ≤ 3）

type OrchestrationTemplate = {
  template_id: string;
  topology: TopologyKind;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
  constraints: TopologyConstraints;
}

type TopologyConstraints = {
  max_parallel: number;   // parallel_merge 最多 5
  max_loop_count: number; // revise_loop 最多 3 次
  max_fan_out: number;    // bounded_fan_out 最多 3
}
```

**拓扑验证器（`packages/core/src/orchestration/topology-validator.ts`）：**
```typescript
class TopologyValidator {
  validate(template: OrchestrationTemplate): ValidationResult;
}

type ValidationResult = {
  valid: boolean;
  topology_kind: TopologyKind | 'invalid';
  violations: TopologyViolation[];
}

type TopologyViolation = {
  violation_type:
    | 'free_dag'              // 不属于任何合法拓扑
    | 'parallel_limit'        // 并行数 > 5
    | 'loop_limit'            // 循环次数 > 3
    | 'fan_out_limit'         // 扇出数 > 3
    | 'nested_parallel'       // 嵌套并行（禁止）
    | 'multi_merge_point';    // 多个汇聚点（禁止）
  node_ids: string[];
  description: string;
}
```

**四种拓扑的识别逻辑：**

1. **linear**：
   - 图为链（每个节点最多 1 个入边 + 1 个出边）
   - 无环，无分叉

2. **parallel_merge**：
   - 恰好一个 Start 节点 → N 个 Worker 节点 → 恰好一个 Merge 节点
   - N ≤ 5，无嵌套

3. **revise_loop**：
   - 恰好一个返回边（back edge）
   - 返回边的目标节点有 `loop_count <= 3` 约束
   - 无多重返回边

4. **bounded_fan_out**：
   - 一个节点有 N 个输出（N ≤ 3）
   - 输出节点最终汇聚到同一个节点
   - 无嵌套 fan-out

**禁止的结构（检测后拒绝）：**
- 任意多层嵌套并行（parallel_merge 内的 parallel_merge）
- 超过一个 back edge（多重循环）
- 菱形 DAG（多个路径汇聚到同一非 Merge 节点）
- 无汇聚的纯分叉（fan-out 后无收口）

**编排层集成：**
- 在 `packages/core/src/integrator/integrator.ts` 的 `Integrator.submit()`（第 65 行）入口处、`processPending()` 调用前添加验证
- 验证失败时：拒绝 Run 启动，发出 `run_topology_invalid` 事件（需在 protocol 中添加）
- 验证通过时：记录 `topology_kind` 到 `baseline_locks` 或新建 `run_metadata` 字段

**不做什么：**
- 不修改现有 xstate RunMachine（拓扑约束在编排层，不在状态机层）
- 不实现可视化编排器（UI 编排留给后续版本）
- 不实现动态拓扑修改（运行中不允许更改拓扑）

---

## 假设

- 编排模板由调用方（Claude Code / Codex）在 Run 启动时提交
- 实际编排入口是 `packages/core/src/integrator/integrator.ts` 的 `Integrator.submit()`（第 65 行）；**不存在** `packages/core/src/orchestration/orchestrator.ts`
- `TopologyValidator` 新建在 `packages/core/src/orchestration/topology-validator.ts`（新建目录 + 新建文件）
- `run_topology_invalid` 事件为新增（不影响 T029 的减法结果）

---

## 文件清单

```
packages/protocol/src/core/topology.ts                 ← 拓扑类型 + OrchestrationTemplate
packages/core/src/orchestration/topology-validator.ts  ← TopologyValidator（新建目录 + 新建文件）
packages/core/src/integrator/integrator.ts             ← 在 submit() 入口添加 validate() 调用（已有文件）
packages/core/src/__tests__/topology-validator.test.ts
```

---

## DoD + 验收命令

```bash
# 测试四种合法拓扑
pnpm --filter @do-what/core test -- --testNamePattern "topology-validator"

# 测试违规检测（自由 DAG / 嵌套并行 / 超限）
pnpm --filter @do-what/core test -- --testNamePattern "topology-violations"

# 测试 parallel_merge 并行数 > 5 被拒绝
pnpm --filter @do-what/core test -- --testNamePattern "parallel-limit"

# 测试 revise_loop > 3 次被拒绝
pnpm --filter @do-what/core test -- --testNamePattern "loop-limit"

# 全量测试
pnpm --filter @do-what/core test
```

**DoD 标准：**
- [ ] 四种合法拓扑各有正向测试（验证通过）
- [ ] 6 种违规类型各有负向测试（验证失败，含具体 violation 信息）
- [ ] `parallel_merge` 并行数 5 通过，6 被拒绝（边界值）
- [ ] `revise_loop` 循环次数 3 通过，4 被拒绝（边界值）
- [ ] 验证耗时 < 5ms（拓扑图节点 ≤ 20 时）

---

## 风险与降级策略

- **风险：** 调用方提交的编排模板格式与 `OrchestrationTemplate` 不一致（字段命名差异）
  - **降级：** 在 `integrator.ts` 的 `Integrator.submit()` 入口添加 zod schema 适配层，兼容旧格式
- **风险：** 合法拓扑识别逻辑过于严格，将用户的合理编排误判为非法
  - **降级：** 增加 `topology_hint` 字段（调用方显式声明拓扑类型），验证器优先信任 hint，仅在明显违规时 override
