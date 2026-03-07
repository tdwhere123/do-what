# T030 · doc-naming-cleanup（文档命名收边）

**Epic:** v0.1.x Phase 0 — 清理减法
**路线:** K：文档命名收边
**依赖:** T029（事件减法完成后文档才能准确反映最终状态）
**优先级:** P0
**估算改动:** ~150 行（文档修改，不涉及代码）

---

## 目标

统一代码注释和文档中 state/projection/archive/ledger 边界的表述，
消除 v0.1 遗留的命名歧义（如 "snapshot" vs "projection"、"ledger" vs "log"、"store" vs "state"），
确保文档与实际字段/类型名称一一对应。

---

## 范围

**做什么：**

**命名歧义清单（需统一）：**

| 旧用法 | 统一为 | 适用范围 |
|--------|--------|----------|
| `snapshot` (指内存状态) | `hot_state` | Core 层注释 |
| `projection` (泛指读模型) | `projection` (仅指异步聚合层) | Core/Soul 注释 |
| `ledger` (泛指日志) | `ledger` (仅指 user_decisions.jsonl) / `log` (其他) | Soul/Core 注释 |
| `store` (泛指存储) | `db` (SQLite) / `repo` (git) | 全局 |
| `archive` (泛指归档) | `canon` (Canon 级记忆) / `archive` (文档目录) | Soul 注释 |
| `state_machine` | `machine` (xstate 上下文) | 代码注释 |

**文件级操作：**
- 扫描 `packages/` 下所有 `.ts` 文件的 JSDoc 注释，替换歧义用语
- 扫描 `docs/` 下所有 `.md` 文件，统一边界表述
- 更新 `CLAUDE.md` 中的架构总览说明（若有歧义术语）
- 在 `packages/protocol/src/` 添加术语表文件 `GLOSSARY.md`，列出所有官方术语定义

**术语表内容（`packages/protocol/src/GLOSSARY.md`）：**
- hot_state：Core 内存中的控制态快照（Run状态/Node状态/审批结果/活跃 checkpoint）
- projection：异步聚合的只读视图（Soul列表/历史聚合/图探索），不参与控制流
- ledger：`~/.do-what/evidence/user_decisions.jsonl`，用户决策的 append-only 记录
- canon：Soul 记忆的最高置信级别，唯一写入 memory_repo 的级别
- formation_kind：cue 的认知形成方式（observation/inference/synthesis/interaction）
- dimension：cue 的语义维度（technical/behavioral/contextual/relational）

**不做什么：**
- 不重命名任何 TypeScript 符号（变量名、类名、函数名）
- 不修改 SQLite 列名（改列名需要 migration，超出本 Ticket 范围）
- 不修改对外暴露的 API 字段名

---

## 假设

- 仅修改注释和文档，不修改任何可运行代码
- "歧义"的判断标准：同一概念在不同文件中有两种以上不同的表述
- 若发现代码中的变量名有歧义但修改影响较大，仅记录在 GLOSSARY.md 中作为"已知命名债务"

---

## 文件清单

```
packages/protocol/src/GLOSSARY.md               ← 新建术语表
packages/protocol/src/**/*.ts                   ← 更新 JSDoc 注释中的歧义术语
packages/core/src/**/*.ts                        ← 同上
packages/soul/src/**/*.ts                        ← 同上
docs/PLAN.md                                     ← 更新进度表中的阶段描述
docs/archive/v0.1.x/README.md                   ← 确认与术语表一致
CLAUDE.md                                        ← 若有歧义术语则更新
```

---

## DoD + 验收命令

```bash
# 确认已不存在"snapshot"用于指代内存状态（排除 xstate 内部 API）
grep -rn "snapshot" packages/ --include="*.ts" | grep -v "xstate\|\.test\.\|node_modules"

# 确认 GLOSSARY.md 已创建
ls packages/protocol/src/GLOSSARY.md

# 确认术语表包含所有 6 个核心术语
grep -c "hot_state\|projection\|ledger\|canon\|formation_kind\|dimension" packages/protocol/src/GLOSSARY.md

# 类型检查（文档变更不影响类型，但验证无误改代码）
pnpm -w exec tsc --noEmit
```

**DoD 标准：**
- [ ] `GLOSSARY.md` 存在且包含 6 个核心术语定义
- [ ] `packages/` 注释中无歧义用语（按上表）
- [ ] 全量测试通过（文档变更不应导致测试失败，若失败说明误改了代码）

---

## 风险与降级策略

- **风险：** 批量替换注释时误改了代码字符串字面量（如 SQL 字段名 "snapshot"）
  - **降级：** 使用 `grep -n` 逐一确认后再修改，不使用全局 find-and-replace；修改后立即运行类型检查
- **风险：** GLOSSARY.md 与实际代码中的字段名不一致（如 `formation_kind` 实际叫 `formationKind`）
  - **降级：** 术语表中同时列出 SQL 列名（snake_case）和 TypeScript 属性名（camelCase），明确区分
