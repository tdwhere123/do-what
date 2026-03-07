# T032 · context-lens（上下文透镜组装）

**Epic:** v0.1.x Phase 1 — SOUL 补全
**路线:** 6.12 章：ContextLens 三步组装
**依赖:** T031（formation_kind/dimension 字段激活后才能基于维度过滤）
**优先级:** P1
**估算改动:** ~400 行

---

## 目标

实现 `ContextLens`：在引擎请求上下文注入时，执行三步组装流程
（Slot 填充 → 图扩展 → 预算裁剪），将记忆精确压缩到 600 token 总预算内。

---

## 范围

**做什么：**

**ContextLens 接口（`packages/soul/src/context/lens.ts`）：**
```typescript
interface ContextLens {
  assemble(request: ContextRequest): Promise<ContextBundle>;
}

type ContextRequest = {
  workspace_id: string;
  focus_surface?: string;       // 当前 FocusSurface（可选）
  trigger: 'hint' | 'excerpt' | 'full';
  seed_cue_ids?: string[];      // 可选种子（调用方提供）
  budget_tokens: number;        // 最大 600
}

type ContextBundle = {
  slots: SlotEntry[];           // 填充的 slot 列表
  total_tokens: number;         // 实际使用 token 数
  truncated: boolean;           // 是否触发预算裁剪
  assembly_ms: number;          // 组装耗时
}
```

**三步组装流程：**

1. **Slot 填充**（`packages/soul/src/context/slot-filler.ts`）：
   - 从 `memory_cues` 中按 `focus_surface` + `dimension` 过滤候选 cue（SQLite 查询，最多 20 条）
   - 按 `activation_score * recency_weight` 排序
   - 将候选 cue 映射到 Slot（Slot 类型：`hint_slot` / `excerpt_slot` / `full_slot`）
   - 每个 Slot 包含：cue_id / gist / token_count / slot_type

2. **图扩展**（`packages/soul/src/context/graph-expander.ts`）：
   - 对 Slot 中的每个 cue，查询其一跳邻居（`edges` 表，最多 3 个邻居/cue）
   - 邻居 cue 以 `hint_slot` 形式追加（较低优先级）
   - 总 Slot 上限：种子 20 + 扩展 60 = 80 个候选

3. **预算裁剪**（`packages/soul/src/context/budget-trimmer.ts`）：
   - 按 token_count 累加，超过 `budget_tokens` 时停止
   - 优先保留：`full_slot` > `excerpt_slot` > `hint_slot`
   - 强制保留：activation_score 前 3 的 cue（无论 token 预算）
   - 输出最终 `ContextBundle`

**Token 计数规则：**
- `hint_slot`：gist 字符数 / 3（近似 token 数）
- `excerpt_slot`：snippet_excerpt 字符数 / 3
- `full_slot`：full_text 字符数 / 3
- 预算边界值：Hint ≤ 600 tokens（Protocol 层写死，不允许调用方覆盖）

**不做什么：**
- 不实现语义 embedding 排序（留给后续版本）
- 不实现跨 workspace 的上下文合并
- 不实现动态 budget 协商（预算由 Protocol 层写死）

---

## 假设

- `activation_score` 和 `recency_weight` 字段在 T031 migration 后均有有效值
- `edges` 表已由 T018 建立（soul search path 已实现）
- `snippet_excerpt` 字段由 T036 的 EvidenceCapsule 填充，在此 Ticket 中可为空（直接用 gist 降级）

---

## 文件清单

```
packages/soul/src/context/lens.ts              ← ContextLens interface + 三步组装入口
packages/soul/src/context/slot-filler.ts       ← Step 1：Slot 填充
packages/soul/src/context/graph-expander.ts    ← Step 2：图扩展
packages/soul/src/context/budget-trimmer.ts    ← Step 3：预算裁剪
packages/soul/src/context/index.ts             ← re-export
packages/soul/src/__tests__/context-lens.test.ts
```

---

## DoD + 验收命令

```bash
# 测试 ContextLens 三步流程
pnpm --filter @do-what/soul test -- --testNamePattern "context-lens"

# 性能验证：100 条 cue 的 assemble 应 < 20ms
pnpm --filter @do-what/soul exec vitest bench src/__tests__/context-lens.bench.ts

# 验证预算约束（输出 total_tokens 不超过 600）
pnpm --filter @do-what/soul test -- --testNamePattern "budget-constraint"
```

**DoD 标准：**
- [ ] 三步组装流程有单独测试覆盖
- [ ] budget_tokens=600 时，输出 total_tokens ≤ 600（严格约束）
- [ ] 组装耗时 < 20ms（100 条 cue 场景）
- [ ] 当 snippet_excerpt 为空时，正确降级为 gist

---

## 风险与降级策略

- **风险：** 图扩展导致 Slot 膨胀，预算裁剪性能下降
  - **降级：** 图扩展结果缓存 60s（基于 workspace_id + seed_cue_ids hash），避免重复扩展
- **风险：** `activation_score` 均为 0（冷启动时无记忆），Slot 填充返回空
  - **降级：** 空 Slot 时返回 `ContextBundle { slots: [], total_tokens: 0, truncated: false }`，不报错
