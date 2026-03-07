# T035 · graph-recall-bounded（一跳有界图回忆）

**Epic:** v0.1.x Phase 1 — SOUL 补全
**路线:** 6.8 章：一跳有界图回忆，SQLite 粗筛 + Top-K rerank
**依赖:** T031（formation_kind 激活），T034（activation_score 可用）
**优先级:** P1
**估算改动:** ~300 行

---

## 目标

实现有界图回忆：从种子 cue 出发，经一跳图扩展和 Top-K rerank，
返回最相关的邻居记忆，严格禁止无界 BFS（防止查询时间爆炸）。

---

## 范围

**做什么：**

**GraphRecall 接口（`packages/soul/src/graph/recall.ts`）：**
```typescript
interface GraphRecall {
  recall(request: RecallRequest): Promise<RecallResult>;
}

type RecallRequest = {
  seed_cue_ids: string[];     // 种子 cue（最多 5 个）
  workspace_id: string;
  max_seeds: number;          // 硬限制：≤ 5
  max_neighbors_per_seed: number;  // 硬限制：≤ 3
  rerank_top_k: number;       // Top-K 后处理，默认 10
}

type RecallResult = {
  seeds: CueRef[];            // 确认存在的种子（最多 5 个）
  neighbors: CueRef[];        // 扩展邻居（最多 15 个 = 5×3）
  top_k: CueRef[];            // rerank 后的 Top-K（最多 10 个）
  graph_ms: number;           // 查询耗时
}
```

**SQLite 粗筛流程（`packages/soul/src/graph/sql-filter.ts`）：**
```sql
-- Step 1: 种子查询（验证种子存在性）
SELECT id, gist, activation_score, formation_kind, dimension
FROM memory_cues
WHERE id IN (:seed_ids) AND workspace_id = :wid AND pruned = 0
LIMIT 5;

-- Step 2: 一跳邻居查询（基于 edges 表）
SELECT mc.id, mc.gist, mc.activation_score, mc.formation_kind, e.edge_weight
FROM edges e
JOIN memory_cues mc ON e.target_id = mc.id
WHERE e.source_id IN (:seed_ids) AND mc.workspace_id = :wid AND mc.pruned = 0
ORDER BY e.edge_weight DESC
LIMIT 15;  -- 5 seeds × 3 neighbors/seed = 15 max
```

**Top-K Rerank（`packages/soul/src/graph/reranker.ts`）：**
- 输入：种子（最多 5 个）+ 邻居（最多 15 个），共最多 20 个候选
- 评分公式：`score = activation_score * 0.6 + edge_weight * 0.3 + recency_decay * 0.1`
- 取 Top-K（默认 10）
- 不实现语义 embedding rerank（v0.1.x 范围内，留 score 字段扩展）

**防无界 BFS 硬约束：**
- `max_seeds` 超过 5：拒绝请求，返回错误（`RecallError: max_seeds exceeded`）
- `max_neighbors_per_seed` 超过 3：强制截断到 3
- 禁止递归调用 `recall()`（无论何种原因）
- 单次 `recall()` 必须在 50ms 内完成（超时返回已有结果 + `timeout: true`）

**不做什么：**
- 不实现多跳扩展（仅一跳）
- 不实现语义相似度计算
- 不实现跨 workspace 图回忆

---

## 假设

- `edges` 表结构：`(source_id, target_id, edge_weight REAL, edge_type TEXT)`
- `edge_weight` 在 0-1 之间（已由 T018/T019 soul read path 建立）
- `memory_cues.pruned` 字段由 T034 引入（默认 0）

---

## 文件清单

```
packages/soul/src/graph/recall.ts          ← GraphRecall interface + 实现
packages/soul/src/graph/sql-filter.ts      ← SQLite 粗筛查询
packages/soul/src/graph/reranker.ts        ← Top-K rerank
packages/soul/src/graph/index.ts           ← re-export
packages/soul/src/__tests__/graph-recall.test.ts
```

---

## DoD + 验收命令

```bash
# 测试有界约束
pnpm --filter @do-what/soul test -- --testNamePattern "graph-recall"

# 验证 max_seeds > 5 时返回错误
pnpm --filter @do-what/soul test -- --testNamePattern "recall-bounds"

# 性能验证：单次 recall 应 < 50ms
pnpm --filter @do-what/soul exec vitest bench src/__tests__/graph-recall.bench.ts
```

**DoD 标准：**
- [ ] `max_seeds=5, max_neighbors_per_seed=3` 时 Top-K 结果 ≤ 10
- [ ] `max_seeds > 5` 返回明确错误（不 fallback 截断）
- [ ] 单次 recall 耗时 < 50ms（含 SQLite 查询 + rerank）
- [ ] `pruned=1` 的 cue 不出现在 recall 结果中

---

## 风险与降级策略

- **风险：** `edges` 表数据稀疏（种子无邻居），图扩展返回空结果
  - **降级：** 返回种子本身的 Top-K（`neighbors` 为空数组，不报错）；上层 ContextLens 负责处理空邻居
- **风险：** `edge_weight` 未初始化（均为 NULL），rerank 评分退化
  - **降级：** NULL `edge_weight` 视为 0.5（中性权重），评分公式降级为 `activation_score * 0.9 + recency_decay * 0.1`
