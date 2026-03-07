# T029 · event-state-reduction（事件/状态减法）

**Epic:** v0.1.x Phase 0 — 清理减法
**路线:** B：事件/状态减法
**依赖:** T028（接入层清理后更容易识别无消费事件）
**优先级:** P0
**估算改动:** ~300 行（删除 + schema 变更）

---

## 目标

在 38 个事件类型中扫描同义/无消费事件并合并删除；删除 `memory_cues` 及 `event_log` 中的无消费字段；
固化最小状态迁移表，确保每个状态转换有且仅有一条明确路径。

---

## 范围

**做什么：**

**事件合并（`packages/protocol/src/events/`）：**
- 审查 38 个事件类型：识别语义重叠的事件对（如 `run_started` vs `run_initiated`，`tool_approved` vs `tool_allowed`）
- 对每对同义事件：确认消费方（在 Core EventBus handler、Soul listener 中 grep），保留消费更多的一个，将另一个合并为别名或直接删除
- 更新 `packages/protocol/src/events/index.ts` 的 zod union，删除废弃事件类型
- 在 `packages/engines/` 中更新事件发射点，统一使用保留的事件名

**无消费字段删除：**
- `event_log` 表：扫描 `packages/core/src/db/` 中所有读取 event_log 的查询，识别从未被读取的列
- `memory_cues` 表（仅针对非 dormant 字段）：删除确认无消费的辅助字段（dormant 字段 T031 单独处理）
- 为删除字段生成 SQLite migration（`packages/core/src/db/migrations/006_event_reduction.sql`）

**最小状态迁移表固化：**
- 在 `packages/protocol/src/machines/run-machine.ts` 中添加注释表格，列出所有合法状态转换
- 格式：`FROM → event → TO`（每行一条，不允许隐含转换）
- 识别并删除 RunMachine 中永远不会触发的 guard 条件（dead guard）
- 同理检查 EngineMachine 和 ApprovalMachine

**不做什么：**
- 不修改任何仍有消费方的事件语义
- 不合并 Run/Engine/Approval 三台状态机为一台
- 不修改 dormant 字段（交由 T031 处理）

---

## 假设

- "无消费"定义：在整个 `packages/` 目录中，除 schema 定义和测试 fixture 外，无任何 handler/listener 引用该事件
- 同义事件合并策略：保留更通用的名称（如保留 `tool_approved`，删除 `tool_allowed`）
- SQLite migration 编号从 006 开始（v0.1 已到 005）

---

## 文件清单

```
packages/protocol/src/events/                     ← 删除同义事件类型，更新 union
packages/protocol/src/machines/run-machine.ts     ← 添加状态迁移表注释，删除 dead guard
packages/protocol/src/machines/engine-machine.ts  ← 同上
packages/protocol/src/machines/approval-machine.ts← 同上
packages/core/src/db/migrations/006_event_reduction.sql  ← 新建 migration
packages/core/src/db/                             ← 更新受影响的查询
packages/engines/claude/src/                      ← 更新事件发射点
packages/engines/codex/src/                       ← 更新事件发射点
```

---

## DoD + 验收命令

```bash
# 确认删除的事件在 packages/ 中无消费方引用
# （替换 OLD_EVENT_NAME 为实际删除的事件名）
grep -rn "OLD_EVENT_NAME" packages/ --include="*.ts" | grep -v "\.test\."

# 运行 migration 后验证 schema
sqlite3 ~/.do-what/state/state.db ".schema event_log"

# 全量测试（包括状态机测试）
pnpm -w test

# 类型检查（事件 union 变更后必须通过）
pnpm -w exec tsc --noEmit
```

**DoD 标准：**
- [ ] 删除事件数量 >= 2（证明确实合并了同义事件）
- [ ] 所有删除字段的 migration 已编写（不允许直接 ALTER TABLE DROP，必须用 migration 文件）
- [ ] 三台状态机各有完整的状态迁移表注释
- [ ] 全量测试通过

---

## 风险与降级策略

- **风险：** 错误删除了某个在测试外环境（如手动测试脚本）中使用的事件
  - **降级：** 删除事件时，先在 protocol 中标记 `@deprecated`，保留一个版本，下一个 PR 再物理删除
- **风险：** SQLite migration 006 与现有数据不兼容（字段有数据时无法删除）
  - **降级：** 使用 CREATE TABLE ... AS SELECT 重建方式，而非 ALTER TABLE DROP COLUMN（SQLite 不支持 DROP COLUMN on older versions）
