# T034 · memory-dynamics（记忆动力学：半衰期 + Karma 事件）

**Epic:** v0.1.x Phase 1 — SOUL 补全
**路线:** 6.9 章：半衰期 retention 模型 + 有界 activation 加权求和 + Karma 事件
**依赖:** T031（formation_kind 字段激活），T033（ClaimForm 写入门控）
**优先级:** P1
**估算改动:** ~350 行

---

## 目标

实现记忆的动态衰减与激活机制：
- 半衰期模型：cue 的 `retention_score` 随时间指数衰减
- Karma 事件（accept/reject/supersede/reuse）触发 `activation_score` 更新
- 有界 activation 加权求和：防止 activation_score 无限累积

---

## 范围

**做什么：**

**半衰期 retention 模型（`packages/soul/src/dynamics/retention.ts`）：**
```typescript
// retention_score(t) = base_score * 2^(-(t - last_accessed) / half_life_days)
// formation_kind 对应的 half_life_days：
const HALF_LIFE: Record<FormationKind, number> = {
  observation: 7,    // 7天半衰期：原始观察衰减较快
  inference:    14,  // 14天：推断结论稳定性中等
  synthesis:    30,  // 30天：综合判断较为持久
  interaction:  60,  // 60天：用户交互记忆最持久
};

function computeRetention(cue: MemoryCue, now: Date): number;
function shouldPrune(cue: MemoryCue, now: Date, threshold: number): boolean;
```

**Karma 事件（`packages/soul/src/dynamics/karma.ts`）：**
```typescript
type KarmaEvent = {
  cue_id: string;
  karma_type: 'accept' | 'reject' | 'supersede' | 'reuse';
  triggered_by: 'user' | 'engine' | 'compiler';
  weight: number;    // 事件权重（见下表）
}

// karma_type 对应权重：
// accept:    +2.0（用户显式接受）
// reuse:     +1.0（引擎复用了该 cue）
// reject:    -2.0（用户显式拒绝）
// supersede: -1.0（被更新的 cue 替代）
```

**有界 activation 加权求和（`packages/soul/src/dynamics/activation.ts`）：**
```typescript
// activation_score = clamp(Σ(karma_weight * recency_decay), min=0, max=10)
// recency_decay = 0.9^(days_since_karma)
// clamp 防止无限累积

function updateActivation(
  current: number,
  karma: KarmaEvent,
  now: Date
): number;
```

**定时 Retention 衰减任务（`packages/soul/src/dynamics/scheduler.ts`）：**
- 每 24h 运行一次（使用 `setInterval`，进程存活时运行）
- 计算所有 cue 的新 `retention_score`，批量更新（批次 100 条，DatabaseWorker 写入）
- `retention_score < 0.05` 的 Working 级 cue 标记为 `pruned`（不物理删除）
- Consolidated/Canon 级 cue 的 `retention_score` 衰减速度乘以 0.5（额外保护）

**Karma 事件监听（`packages/soul/src/dynamics/karma-listener.ts`）：**
- 订阅 Core EventBus 的以下事件并转化为 KarmaEvent：
  - `memory_cue_accepted` → karma_type: 'accept'
  - `memory_cue_rejected` → karma_type: 'reject'
  - `context_cue_used` → karma_type: 'reuse'（引擎使用了注入的 cue）

**不做什么：**
- 不实现语义相似度聚类（记忆合并留给未来版本）
- 不实现物理删除（仅标记 `pruned`，物理清理另行规划）
- 不实现跨 workspace 的 karma 传播

---

## 假设

- `retention_score` 和 `activation_score` 字段在 T031 migration 后已有有效值（初始值 1.0）
- Karma 事件由 Core 产生，Soul 通过 EventBus 订阅获取
- 定时任务不需要在测试环境中实际运行（可通过手动触发接口测试）

---

## 文件清单

```
packages/soul/src/dynamics/retention.ts        ← 半衰期模型
packages/soul/src/dynamics/karma.ts            ← KarmaEvent 类型 + 权重定义
packages/soul/src/dynamics/activation.ts       ← 有界 activation 加权求和
packages/soul/src/dynamics/scheduler.ts        ← 定时 retention 衰减
packages/soul/src/dynamics/karma-listener.ts   ← EventBus 事件转 KarmaEvent
packages/soul/src/dynamics/index.ts            ← re-export
packages/soul/src/__tests__/memory-dynamics.test.ts
```

---

## DoD + 验收命令

```bash
# 测试半衰期计算
pnpm --filter @do-what/soul test -- --testNamePattern "retention"

# 测试 activation 有界约束
pnpm --filter @do-what/soul test -- --testNamePattern "activation"

# 测试 karma 事件处理
pnpm --filter @do-what/soul test -- --testNamePattern "karma"

# 验证 pruned 标记（retention < 0.05 的 cue 被标记）
pnpm --filter @do-what/soul test -- --testNamePattern "prune"
```

**DoD 标准：**
- [ ] `retention_score` 计算符合半衰期公式（允许 1% 误差）
- [ ] `activation_score` 严格在 [0, 10] 范围内（有界约束）
- [ ] 4 种 karma_type 各有测试
- [ ] `retention_score < 0.05` 的 Working 级 cue 被正确标记 `pruned`
- [ ] Consolidated/Canon 级 cue 衰减速度确为 Working 级的 0.5 倍

---

## 风险与降级策略

- **风险：** 定时任务（24h）在长时间运行的进程中累积大量待更新记录，批量更新阻塞 DatabaseWorker
  - **降级：** 批次大小动态调整：若上一批次耗时 > 100ms，减半批次大小；最小批次 10 条
- **风险：** `activation_score` 初始值为 0（冷启动），所有 cue 激活分相同，无法区分重要性
  - **降级：** 冷启动时使用 `recency_score`（最近 7 天内创建的 cue 激活分为 1.0）作为兜底排序
