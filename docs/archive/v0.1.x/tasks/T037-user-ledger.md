# T037 · user-ledger（用户决策 ledger）

**Epic:** v0.1.x Phase 1 — SOUL 补全
**路线:** 7.2 章：append-only 用户决策 ledger
**依赖:** T036（EvidenceCapsule 已建立 Canon 级证据关联），T033（ClaimResolution 事件）
**优先级:** P1
**估算改动:** ~250 行

---

## 目标

实现 `~/.do-what/evidence/user_decisions.jsonl`：
每条记录对应一次用户对记忆的显式决策（接受/拒绝/修改），
append-only，带 `decision_id/timestamp/linked_memory_id`，支持离线审计。

---

## 范围

**做什么：**

**UserDecision 类型（`packages/protocol/src/soul/user-decision.ts`）：**
```typescript
type UserDecision = {
  decision_id: string;          // UUID v4
  timestamp: string;            // ISO 8601
  decision_type: 'accept' | 'reject' | 'modify' | 'supersede';
  linked_memory_id: string;     // memory_cue.id
  linked_capsule_id?: string;   // evidence_capsule.capsule_id（可选）
  claim_draft_id?: string;      // 对应的 ClaimDraft（可选）
  user_note?: string;           // 用户备注（最多 500 字符）
  context_snapshot: {
    workspace_id: string;
    run_id?: string;
    cue_gist: string;           // 决策时 cue 的 gist（不可变快照）
    formation_kind: string;
  };
}
```

**LedgerWriter（`packages/soul/src/ledger/ledger-writer.ts`）：**
```typescript
class LedgerWriter {
  private readonly ledger_path = '~/.do-what/evidence/user_decisions.jsonl';

  async append(decision: UserDecision): Promise<void>;
  async read(filter?: LedgerFilter): Promise<UserDecision[]>;  // 全量读取，无分页
}
```
- `append()` 实现：
  - 验证 `UserDecision` schema（zod parse）
  - 写入一行 JSON（`JSON.stringify(decision) + '\n'`）
  - 使用 `fs.appendFile`（追加模式，非覆盖）
  - 确保目录 `~/.do-what/evidence/` 存在（首次写入时自动创建）
  - 文件权限：`0o600`（仅所有者可读写）

- `read()` 实现：
  - 逐行读取 JSONL 文件
  - 跳过解析失败的行（warn + continue，不 throw）
  - 支持 `filter.decision_type` / `filter.linked_memory_id` / `filter.since` 过滤

**LedgerReader 独立接口（`packages/soul/src/ledger/ledger-reader.ts`）：**
- 仅读，不依赖 DatabaseWorker（直接 `fs.readFile`）
- 用于 Core SSE 推送审计事件、UI 展示历史决策

**触发时机（`packages/soul/src/ledger/decision-recorder.ts`）：**
- 订阅 Core EventBus：
  - `memory_cue_accepted` → decision_type: 'accept'
  - `memory_cue_rejected` → decision_type: 'reject'
  - `claim_superseded`（用户触发）→ decision_type: 'supersede'
  - `memory_cue_modified` → decision_type: 'modify'（若有该事件）

**不做什么：**
- 不实现 ledger 的加密存储（明文 JSONL，权限 0o600）
- 不实现 ledger 的自动归档/压缩（文件无限增长，人工清理）
- 不实现 ledger 的 SQLite 镜像（仅文件存储）

---

## 假设

- `~/.do-what/evidence/` 目录首次写入时自动创建（不预先建立）
- 文件编码：UTF-8
- 单条记录不超过 4KB（超过截断 `user_note`）
- 在测试中使用临时目录替代 `~/.do-what/`

---

## 文件清单

```
packages/protocol/src/soul/user-decision.ts        ← UserDecision 类型
packages/soul/src/ledger/ledger-writer.ts          ← LedgerWriter（append + read）
packages/soul/src/ledger/ledger-reader.ts          ← LedgerReader（只读）
packages/soul/src/ledger/decision-recorder.ts      ← EventBus 监听 → ledger append
packages/soul/src/ledger/index.ts                  ← re-export
packages/soul/src/__tests__/user-ledger.test.ts
```

---

## DoD + 验收命令

```bash
# 验证 ledger 目录和文件自动创建
pnpm --filter @do-what/soul test -- --testNamePattern "ledger-writer"

# 验证 append-only（不覆盖已有记录）
pnpm --filter @do-what/soul test -- --testNamePattern "append-only"

# 验证 read + filter
pnpm --filter @do-what/soul test -- --testNamePattern "ledger-read"

# 验证破损行被跳过（不 throw）
pnpm --filter @do-what/soul test -- --testNamePattern "ledger-corrupt"

# 手动验证文件权限
ls -la ~/.do-what/evidence/user_decisions.jsonl
# 预期：-rw-------（0600）
```

**DoD 标准：**
- [ ] `append()` 后文件行数 +1（幂等追加，不覆盖）
- [ ] 文件权限 0o600（所有者可读写，其他人无权限）
- [ ] 损坏的 JSON 行被 warn + 跳过（不影响其余行读取）
- [ ] `filter.since` 正确过滤时间范围

---

## 风险与降级策略

- **风险：** 高频 karma 事件导致 ledger 文件快速增长（每秒数十条写入）
  - **降级：** `decision-recorder` 对同一 `linked_memory_id` 去重（1 分钟内相同类型的决策只写一条）
- **风险：** `~/.do-what/evidence/` 所在磁盘满，append 失败
  - **降级：** append 失败时 error 日志（不 throw），决策不丢失（仍通过 karma 更新 activation_score）
