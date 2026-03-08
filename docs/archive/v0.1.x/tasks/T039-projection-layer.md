# T039 · projection-layer（异步读模型 Projection 层）

**Epic:** v0.1.x Phase 2 — Core 四层分离
**路线:** C（续）+ D：Projection 异步聚合层，与控制态彻底分离
**依赖:** T038（CoreHotState 已建立，控制态已隔离）
**优先级:** P2
**估算改动:** ~350 行

---

## 目标

建立 `Projection` 层：
- 承接所有"读多写少"的聚合视图（Soul 列表/历史聚合/图探索/证据索引）
- 与 `CoreHotState` 控制态彻底分离（不共享数据结构）
- 异步更新（EventBus 订阅驱动），不阻塞控制流

---

## 范围

**做什么：**

**Projection 类型体系（`packages/protocol/src/core/projection.ts`）：**
```typescript
// Projection 层承接的视图类型
type ProjectionKind =
  | 'soul_cue_list'         // workspace 内所有可注入 cue 的摘要列表
  | 'run_history_agg'       // Run 历史聚合（完成/失败数、平均耗时）
  | 'evidence_index_view'   // evidence_index 的反规范化视图
  | 'graph_explore_cache';  // 图探索缓存（不含实时数据）

type ProjectionEntry<T> = {
  kind: ProjectionKind;
  workspace_id: string;
  data: T;
  computed_at: string;      // ISO timestamp
  staleness_ms: number;     // 距上次更新的毫秒数
}
```

**ProjectionManager（`packages/core/src/projection/projection-manager.ts`）：**
```typescript
class ProjectionManager {
  // 获取指定视图（惰性计算：若不存在或已过期，触发重算）
  async get<T>(kind: ProjectionKind, workspace_id: string): Promise<ProjectionEntry<T>>;

  // 主动失效（EventBus 触发）
  invalidate(kind: ProjectionKind, workspace_id: string): void;

  // 批量失效（workspace 级别）
  invalidateWorkspace(workspace_id: string): void;
}
```
- 存储：内存 Map（不持久化，重启后重建）
- 过期时间：`soul_cue_list` 30s；`run_history_agg` 60s；`graph_explore_cache` 120s
- 重算触发：过期 OR `invalidate()` 调用

**各视图计算器（`packages/core/src/projection/calculators/`）：**
- `soul-cue-list.ts`：调用 Soul HTTP API，获取 workspace cue 摘要（前 50 条）
- `run-history-agg.ts`：直接查询 SQLite `event_log`（只读连接）
- `evidence-index-view.ts`：JOIN `evidence_index` + `memory_cues`（Soul SQLite）
- `graph-explore-cache.ts`：调用 Soul GraphRecall，结果缓存

**EventBus 集成（失效触发）：**
- `run_completed` / `run_failed` → invalidate `run_history_agg`
- `memory_cue_accepted` / `memory_cue_rejected` → invalidate `soul_cue_list`
- `evidence_capsule_written` → invalidate `evidence_index_view`

**API 路由迁移：**
- 将 Core HTTP Server 中 `GET /workspaces/:id/soul` 等聚合查询路由，
  从直接查询 SQL 改为通过 `ProjectionManager.get()` 获取

**不做什么：**
- 不实现 Projection 的持久化（内存缓存，重启清空）
- 不实现跨 workspace 的聚合
- 不将 `run_history_agg` 移到 Soul（仍由 Core 维护）

---

## 现状与偏差说明（实现前必读）

**任务卡假定的 `/workspaces/:id/soul` 等聚合路由在当前仓库中不存在。**

Core HTTP Server 现有 Soul 相关路由（`packages/core/src/server/soul-routes.ts`）只有两条：
- `GET /soul/proposals` → `toolDispatcher.listPendingProposals()`
- `GET /soul/healing/stats` → `toolDispatcher.getHealingStats()`

**T039 实际接线范围：**
- 建立 `ProjectionManager` + 4 个 calculator 基础设施
- 仅将 `GET /soul/proposals` 接入 `soul_cue_list` projection（`soul-routes.ts` 路由签名不变）
- `GET /soul/healing/stats` 直连 `toolDispatcher`（healing stats 不属于 Projection 管辖范围）
- `run_history_agg` / `evidence_index_view` / `graph_explore_cache` calculator 实现后只有测试调用，等 UI 路由有需求时再接线

## 假设

- Core HTTP Server 中现有 soul 读口只有 `/soul/proposals` 和 `/soul/healing/stats`（已确认）
- Soul 提供 HTTP 查询接口（或直接共享 SQLite 文件路径进行只读查询）
- Projection 重算是幂等的（相同输入 → 相同输出）

---

## 文件清单

```
packages/protocol/src/core/projection.ts              ← Projection 类型
packages/core/src/projection/projection-manager.ts    ← ProjectionManager
packages/core/src/projection/calculators/soul-cue-list.ts
packages/core/src/projection/calculators/run-history-agg.ts
packages/core/src/projection/calculators/evidence-index-view.ts
packages/core/src/projection/calculators/graph-explore-cache.ts
packages/core/src/projection/index.ts
packages/core/src/__tests__/projection.test.ts
```

---

## DoD + 验收命令

```bash
# 测试 ProjectionManager 惰性计算
pnpm --filter @do-what/core test -- --testNamePattern "projection"

# 验证失效传播（invalidate 后重算）
pnpm --filter @do-what/core test -- --testNamePattern "projection-invalidate"

# 验证与 HotState 无数据共享（各自独立）
pnpm --filter @do-what/core test -- --testNamePattern "projection-isolation"

# 全量 core 测试
pnpm --filter @do-what/core test
```

**DoD 标准：**
- [ ] Projection 数据结构与 `CoreHotState` 无交叉引用
- [ ] 过期后首次 `get()` 触发重算（有测试验证延迟重算）
- [ ] `invalidate()` 后下次 `get()` 必然重算（不使用过期缓存）
- [ ] 重算过程中并发 `get()` 不触发多次重算（Promise 合并）

---

## 风险与降级策略

- **风险：** Projection 重算（调用 Soul API）在 Core 高负载时超时
  - **降级：** 重算超时（5s）后返回 stale 数据，标记 `staleness_ms`；调用方根据 staleness_ms 决定是否使用
- **风险：** 内存 Map 在长时间运行后积累大量 workspace 的过期 Projection
  - **降级：** LRU 清理：最多保留 100 个 workspace 的 Projection，超出时清除最久未访问的
