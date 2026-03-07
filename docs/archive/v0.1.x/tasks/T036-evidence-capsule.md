# T036 · evidence-capsule（证据胶囊）

**Epic:** v0.1.x Phase 1 — SOUL 补全
**路线:** 7.1 章：EvidenceCapsule，Canon 级证据写入
**依赖:** T033（ClaimForm checkpoint 写入门控），T031（formation_kind 激活）
**优先级:** P1
**估算改动:** ~350 行

---

## 目标

实现 `EvidenceCapsule`：将 Canon 级记忆的证据来源结构化封装
（git_commit/repo_path/symbol/snippet_excerpt/context_fingerprint），
写入 `evidence_index` 表，并与 `memory_cues` 建立关联。

---

## 范围

**做什么：**

**EvidenceCapsule 类型（`packages/protocol/src/soul/evidence.ts`）：**
```typescript
type EvidenceCapsule = {
  capsule_id: string;           // UUID
  cue_id: string;               // 关联的 memory_cue
  git_commit: string;           // 40 位 SHA（必填）
  repo_path: string;            // 相对或绝对路径（必填）
  symbol?: string;              // 函数名/类名/变量名（可选）
  snippet_excerpt: string;      // 最多 500 tokens 的代码片段（Protocol 层写死）
  context_fingerprint: string;  // SHA256(repo_path + git_commit + symbol)
  confidence: number;           // 0-1，继承自 claim_confidence
  created_at: string;           // ISO timestamp
}
```

**EvidenceCapsule 写入逻辑（`packages/soul/src/evidence/capsule-writer.ts`）：**
- 仅在 `memory_cue.level = 'canon'` 时触发写入
- 触发条件：`run_checkpoint` 事件 + `ClaimResolution.resolution = 'accepted'`
- 写入前验证：
  - `git_commit` 为 40 位十六进制（正则校验）
  - `repo_path` 存在（文件系统检查，失败时 warn 不 throw）
  - `snippet_excerpt` 不超过 1500 字符（约 500 tokens），超出截断
- 写入到 `evidence_index` 表（DatabaseWorker 线程）
- 同时更新 `memory_cues.snippet_excerpt` 字段（供 ContextLens 使用）

**context_fingerprint 计算（`packages/soul/src/evidence/fingerprint.ts`）：**
```typescript
function computeFingerprint(
  repo_path: string,
  git_commit: string,
  symbol?: string
): string {
  return sha256(`${repo_path}:${git_commit}:${symbol ?? ''}`);
}
```
- 相同来源的证据有相同 fingerprint（去重检测）
- 已存在相同 fingerprint 的 capsule：更新 `snippet_excerpt`，不新建

**evidence_index 表 DDL（`packages/soul/src/db/migrations/007_evidence_capsule.sql`）：**
```sql
CREATE TABLE IF NOT EXISTS evidence_index (
  capsule_id         TEXT PRIMARY KEY,
  cue_id             TEXT NOT NULL REFERENCES memory_cues(id),
  git_commit         TEXT NOT NULL,
  repo_path          TEXT NOT NULL,
  symbol             TEXT,
  snippet_excerpt    TEXT NOT NULL,
  context_fingerprint TEXT NOT NULL UNIQUE,
  confidence         REAL NOT NULL DEFAULT 0.0,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_cue ON evidence_index(cue_id);
CREATE INDEX IF NOT EXISTS idx_evidence_fingerprint ON evidence_index(context_fingerprint);
```

**不做什么：**
- 不实现 Canon 级以下的证据存储（Working/Consolidated 级仅有 gist，无 capsule）
- 不实现证据的版本追踪（git_commit 变化时不自动更新，只更新 snippet_excerpt）
- 不实现跨仓库证据关联

---

## 假设

- `evidence_index` 表在 v0.1 中已存在基础结构（T017 soul-sqlite-ddl），migration v7 仅补充字段
- `snippet_excerpt` 长度限制 1500 字符（约 500 tokens），由 Protocol 层常量定义
- Canon 级 cue 的判断：`memory_cue.level = 'canon'`（枚举值）

---

## 文件清单

```
packages/protocol/src/soul/evidence.ts             ← EvidenceCapsule 类型
packages/soul/src/evidence/capsule-writer.ts       ← Canon 级证据写入
packages/soul/src/evidence/fingerprint.ts          ← context_fingerprint 计算
packages/soul/src/db/migrations/007_evidence_capsule.sql  ← DDL migration
packages/soul/src/db/soul-db.ts                    ← 注册 migration v7
packages/soul/src/__tests__/evidence-capsule.test.ts
```

---

## DoD + 验收命令

```bash
# 运行 migration v7
pnpm --filter @do-what/soul exec ts-node src/db/run-migrations.ts

# 验证 evidence_index 表结构
sqlite3 ~/.do-what/state/soul.db ".schema evidence_index"

# 测试证据写入
pnpm --filter @do-what/soul test -- --testNamePattern "evidence-capsule"

# 验证非 Canon 级 cue 不写入 evidence_index
pnpm --filter @do-what/soul test -- --testNamePattern "canon-only"

# 验证重复 fingerprint 不新建记录
pnpm --filter @do-what/soul test -- --testNamePattern "fingerprint-dedup"
```

**DoD 标准：**
- [ ] Canon 级 cue 通过 checkpoint 触发后，`evidence_index` 有对应记录
- [ ] Working/Consolidated 级 cue 触发时无 `evidence_index` 记录
- [ ] `snippet_excerpt` 超 1500 字符时被截断（有截断标记）
- [ ] 相同 fingerprint 不重复插入（UNIQUE 约束 + 应用层去重）
- [ ] migration v7 幂等（多次运行安全）

---

## 风险与降级策略

- **风险：** `git_commit` 校验失败（引擎传入 short SHA 或分支名）
  - **降级：** 接受 7 位以上的 SHA（允许短 SHA），分支名一律 warn + 跳过写入
- **风险：** 大量 Canon 级 cue 同时升级，capsule 写入队列堆积
  - **降级：** capsule 写入为 fire-and-forget（不 await），DatabaseWorker 队列自然缓冲
