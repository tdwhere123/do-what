# T033 · claim-form-memory-slot（Claim Form + Slot Winner 写入门控）

**Epic:** v0.1.x Phase 1 — SOUL 补全
**路线:** 6.4–6.5 章：claim_draft 流程 + Slot Winner + claim_mode 冲突解决
**依赖:** T031（claim_* dormant 字段已激活），T032（ContextLens 已建立）
**优先级:** P1
**估算改动:** ~450 行

---

## 目标

实现 `ClaimForm` 工作流：引擎通过 `claim_draft` 提案，经 `SlotWinner` 策略选出最优提案，
最终只能通过 checkpoint 事件将 `claim_*` 字段写入 `memory_cues`。
确保无审批的引擎无法直接写 `claim_*`。

---

## 范围

**做什么：**

**ClaimForm 类型（`packages/protocol/src/soul/claim.ts`）：**
```typescript
type ClaimDraft = {
  draft_id: string;
  cue_id: string;                    // 目标 cue
  claim_gist: string;                // 不超过 200 字符
  claim_confidence: number;          // 0-1
  claim_mode: 'assert' | 'retract' | 'supersede';
  claim_source: 'engine' | 'compiler' | 'user';
  proposed_at: string;               // ISO timestamp
  expires_at?: string;               // 可选超时（默认 30min）
}

type ClaimResolution = {
  draft_id: string;
  resolution: 'accepted' | 'rejected' | 'superseded' | 'expired';
  resolved_at: string;
  resolver: 'slot_winner' | 'user' | 'timeout';
}
```

**Slot Winner 策略（`packages/soul/src/claim/slot-winner.ts`）：**
- 同一 `cue_id` 同时存在多个 `ClaimDraft` 时触发 Winner 选择
- 优先级规则（按顺序）：
  1. `claim_source = 'user'` 无条件胜出
  2. `claim_confidence` 最高者胜出
  3. `claim_mode = 'supersede'` 优先于 `assert`
  4. `proposed_at` 最新者胜出（同等置信度时）
- 失败的草稿标记为 `superseded`

**ClaimMode 冲突解决：**
- `assert` vs `assert`：走 SlotWinner（置信度对比）
- `retract` vs `assert`：`retract` 优先（安全第一原则）
- `supersede` vs `supersede`：取 `claim_confidence` 更高者

**Checkpoint 写入门控（`packages/soul/src/claim/checkpoint-writer.ts`）：**
```typescript
// 唯一写入 claim_* 字段的入口
async function writeClaimAtCheckpoint(
  draft_id: string,
  checkpoint_event: CheckpointEvent
): Promise<void>
```
- 只有接收到 `run_checkpoint` 事件（来自 Core EventBus）才触发写入
- 写入前验证 `ClaimDraft` 未过期、状态为 `pending`
- 写入后发出 `ClaimResolution` 事件（`resolved: 'accepted'`）
- 未经此入口的 `claim_*` 字段写入在 DatabaseWorker 层拦截并 warn

**不做什么：**
- 不实现用户审批 UI（审批流已由 ApprovalMachine 处理）
- 不修改 Core EventBus（只添加 `run_checkpoint` 事件的监听）
- 不实现跨 cue 的 Claim 合并（每个 cue 独立处理）

---

## 假设

- `claim_draft` / `claim_confidence` / `claim_gist` / `claim_mode` / `claim_source` 字段已在 T031 migration v6 中激活
- `run_checkpoint` 事件已在 `@do-what/protocol` 中定义（T029 减法后保留）
- ClaimDraft 暂存于内存（不持久化到 SQLite），重启后 pending 草稿清空

---

## 文件清单

```
packages/protocol/src/soul/claim.ts             ← ClaimDraft + ClaimResolution 类型
packages/soul/src/claim/slot-winner.ts          ← SlotWinner 策略
packages/soul/src/claim/checkpoint-writer.ts    ← Checkpoint 写入门控
packages/soul/src/claim/claim-queue.ts          ← 内存中的 pending draft 队列
packages/soul/src/claim/index.ts                ← re-export
packages/soul/src/db/soul-db.ts                 ← 添加 claim_* 写入拦截（warn only）
packages/soul/src/__tests__/claim-form.test.ts
packages/soul/src/__tests__/slot-winner.test.ts
```

---

## DoD + 验收命令

```bash
# 测试 Slot Winner 策略
pnpm --filter @do-what/soul test -- --testNamePattern "slot-winner"

# 测试 Claim Form 完整流程
pnpm --filter @do-what/soul test -- --testNamePattern "claim-form"

# 验证非 checkpoint 路径写入被拦截
pnpm --filter @do-what/soul test -- --testNamePattern "claim-write-guard"

# 全量 soul 测试
pnpm --filter @do-what/soul test
```

**DoD 标准：**
- [ ] SlotWinner 四条优先级规则各有测试覆盖
- [ ] checkpoint-writer 是 `claim_*` 字段的唯一写入路径
- [ ] 非 checkpoint 路径的写入尝试产生 warn 日志（不 throw）
- [ ] ClaimDraft 超时（30min）后自动标记 `expired`

---

## 风险与降级策略

- **风险：** 大量 ClaimDraft 堆积在内存队列（长跑任务产生数百个草稿）
  - **降级：** 队列上限 100 条/cue；超出时丢弃最旧的 `assert` 类草稿（保留 `user` 来源）
- **风险：** checkpoint 事件触发时机不稳定（引擎不发 checkpoint 时 claim 永远不写入）
  - **降级：** 添加超时兜底：pending draft 超过 30min 未等到 checkpoint，自动以 `expired` 关闭
