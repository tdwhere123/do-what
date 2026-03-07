# T031 · soul-concept-unification（概念减法 + 命名统一）

**Epic:** v0.1.x Phase 1 — SOUL 补全
**路线:** H：概念减法 + 命名统一
**依赖:** T030（命名收边完成后才能安全激活 dormant 字段）
**优先级:** P1
**估算改动:** ~250 行（migration + schema 更新 + 旧字段废弃）

---

## 目标

废弃 soul 包中旧的 `type` 字段（`fact/pattern/decision/risk`），
正式启用 `formation_kind`（认知形成方式）+ `dimension`（语义维度）双轴分类，
编写 migration v6 激活 dormant 字段，确保新旧数据兼容。

---

## 范围

**做什么：**

**旧 `type` 字段废弃（`packages/soul/src/`）：**
- 在 `memory_cues` 的 zod schema 中将 `type` 标记为 `z.string().optional()` + `@deprecated`
- 更新所有创建 cue 的代码路径：不再写入 `type`，改为写入 `formation_kind` + `dimension`
- 更新所有读取 cue 的代码路径：若 `formation_kind` 为空，则从 `type` 映射（兼容旧数据）：
  ```
  fact      → formation_kind: 'observation', dimension: 'technical'
  pattern   → formation_kind: 'inference',   dimension: 'technical'
  decision  → formation_kind: 'interaction', dimension: 'behavioral'
  risk      → formation_kind: 'synthesis',   dimension: 'contextual'
  ```

**Migration v6（`packages/soul/src/db/migrations/006_activate_dormant.sql`）：**
```sql
-- 激活 dormant 字段（建表时已有列定义，仅需设置默认值 + 更新存量数据）
UPDATE memory_cues SET
  formation_kind = CASE type
    WHEN 'fact'     THEN 'observation'
    WHEN 'pattern'  THEN 'inference'
    WHEN 'decision' THEN 'interaction'
    WHEN 'risk'     THEN 'synthesis'
    ELSE 'observation'
  END,
  dimension = CASE type
    WHEN 'fact'     THEN 'technical'
    WHEN 'pattern'  THEN 'technical'
    WHEN 'decision' THEN 'behavioral'
    WHEN 'risk'     THEN 'contextual'
    ELSE 'technical'
  END
WHERE formation_kind IS NULL;

-- 激活 focus_surface 字段默认值
UPDATE memory_cues SET focus_surface = 'default' WHERE focus_surface IS NULL;
```

**Schema 更新（`packages/protocol/src/soul/`）：**
- `FormationKind` 枚举：`'observation' | 'inference' | 'synthesis' | 'interaction'`
- `Dimension` 枚举：`'technical' | 'behavioral' | 'contextual' | 'relational'`
- `FocusSurface` 类型：`string`（v0.1.x 暂用字符串，T042 细化）
- 更新 `MemoryCue` zod schema，将三字段从 `optional()` 改为带默认值的 `required()`

**不做什么：**
- 不删除 `type` 列（兼容性保留，仅废弃写入）
- 不修改 `claim_*` 字段（交由 T033 处理）
- 不实现 FocusSurface 的结构化类型（交由 T042）

---

## 假设

- `memory_cues` 表在 v5 schema 中已有 `formation_kind`/`dimension`/`focus_surface` 列，但均为 NULL
- migration v6 是幂等的（多次执行安全）
- `@do-what/protocol` 中 `FormationKind`/`Dimension` 枚举未曾导出过，不存在外部消费者

---

## 文件清单

```
packages/protocol/src/soul/memory-cue.ts          ← 更新 zod schema，新增枚举类型
packages/soul/src/db/migrations/006_activate_dormant.sql  ← 新建 migration
packages/soul/src/db/soul-db.ts                   ← 注册 migration v6
packages/soul/src/cue-factory.ts                  ← 停止写入 type，改写 formation_kind+dimension
packages/soul/src/compiler/                       ← 更新 cue 创建逻辑
packages/soul/src/search/                         ← 更新 cue 读取，加兼容映射
packages/soul/src/__tests__/concept-unification.test.ts  ← 新建测试
```

---

## DoD + 验收命令

```bash
# 运行 migration
pnpm --filter @do-what/soul exec ts-node src/db/run-migrations.ts

# 验证旧数据已迁移
sqlite3 ~/.do-what/state/soul.db \
  "SELECT COUNT(*) FROM memory_cues WHERE formation_kind IS NULL"
# 预期：0

# 验证 formation_kind 分布
sqlite3 ~/.do-what/state/soul.db \
  "SELECT formation_kind, COUNT(*) FROM memory_cues GROUP BY formation_kind"

# 测试
pnpm --filter @do-what/soul test -- --testNamePattern "concept-unification"

# 全量 soul 测试（不允许减少）
pnpm --filter @do-what/soul test
```

**DoD 标准：**
- [ ] migration v6 运行后，所有旧 cue 的 `formation_kind` 均非 NULL
- [ ] 新建 cue 使用 `formation_kind` + `dimension`，不再写入 `type`
- [ ] 读取兼容：旧数据（仅有 `type`）仍可正确读取
- [ ] soul 包全量测试通过（维持 ≥ 40 个测试）

---

## 风险与降级策略

- **风险：** migration 将 NULL `type` 的 cue 映射到错误的 `formation_kind`
  - **降级：** 默认映射为 `observation/technical`，migration 后人工抽样检查 5 条数据
- **风险：** `packages/protocol` 中 `FormationKind` 枚举变更导致 core 包类型错误
  - **降级：** 先在 protocol 中添加新枚举（不删除旧枚举），升级 core/soul 后再删除旧枚举
