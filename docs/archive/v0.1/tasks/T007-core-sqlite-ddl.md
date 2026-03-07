# T007 · Core: SQLite DDL + 迁移框架

**Epic:** E1 – Core Skeleton
**依赖:** T006（DatabaseWorker 框架）
**估算改动:** ~350 行

---

## 目标

定义 `state.db` 的完整初始 DDL，包含 `event_log`、`runs`、`workspaces`、`agents`、`approval_queue`、`snapshots` 表，并实现简单的版本化迁移机制（不引入第三方迁移库）。

---

## 范围

**做什么：**

**表结构（state.db）：**

```sql
-- 事件日志（只追加）
CREATE TABLE event_log (
  revision    INTEGER PRIMARY KEY,
  timestamp   TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  run_id      TEXT,
  source      TEXT NOT NULL,
  payload     TEXT NOT NULL  -- JSON blob
);
CREATE INDEX idx_event_log_run ON event_log(run_id, revision);
CREATE INDEX idx_event_log_type ON event_log(event_type, revision);

-- 运行记录
CREATE TABLE runs (
  run_id        TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  agent_id      TEXT,
  engine_type   TEXT NOT NULL,  -- 'claude' | 'codex'
  status        TEXT NOT NULL,  -- RunLifecycle status
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  completed_at  TEXT,
  error         TEXT,
  metadata      TEXT            -- JSON blob
);
CREATE INDEX idx_runs_workspace ON runs(workspace_id, status);

-- 工作区
CREATE TABLE workspaces (
  workspace_id    TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  root_path       TEXT NOT NULL,
  engine_type     TEXT,
  created_at      TEXT NOT NULL,
  last_opened_at  TEXT
);

-- Agent 定义
CREATE TABLE agents (
  agent_id    TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT,
  engine_type TEXT NOT NULL,
  memory_ns   TEXT NOT NULL,  -- Soul 记忆命名空间
  created_at  TEXT NOT NULL,
  config      TEXT            -- JSON blob
);

-- 审批队列
CREATE TABLE approval_queue (
  approval_id  TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  args         TEXT NOT NULL,  -- JSON blob
  status       TEXT NOT NULL,  -- 'pending' | 'approved' | 'denied' | 'timeout'
  created_at   TEXT NOT NULL,
  resolved_at  TEXT,
  resolver     TEXT,           -- 'user' | 'policy' | 'timeout'
  FOREIGN KEY(run_id) REFERENCES runs(run_id)
);
CREATE INDEX idx_approval_run ON approval_queue(run_id, status);

-- 状态快照（用于水合）
CREATE TABLE snapshots (
  snapshot_id  TEXT PRIMARY KEY,
  revision     INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  payload      TEXT NOT NULL   -- JSON blob，完整状态
);

-- 迁移版本跟踪
CREATE TABLE schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL,
  description TEXT NOT NULL
);
```

**迁移机制：**
- `src/db/migrations/` 目录，每个文件为 `v{N}.ts`，导出 `{ version: number, description: string, up: (db: Database) => void }`
- `MigrationRunner.runPending(db)`：读取当前版本，按序执行未应用的迁移，每次在事务中执行
- 初始迁移为 `v1.ts`（创建上述全部表）

**不做什么：**
- 不实现 Soul 相关的表（留 T017）
- 不实现数据读写逻辑（仅 DDL + 迁移框架）

---

## 假设

- 迁移是幂等的（重启 Core 不会重复执行已完成迁移）
- 所有时间戳为 ISO 8601 UTC 字符串
- `metadata`/`config`/`payload` 使用 JSON 字符串存储（不用 SQLite JSON 函数，保持兼容性）

---

## 文件清单

```
packages/core/src/db/migrations/v1.ts             ← 初始 DDL
packages/core/src/db/migrations/index.ts          ← re-export 所有迁移
packages/core/src/db/migration-runner.ts
packages/core/src/db/schema.ts                    ← 表名常量 + 行类型 interface
packages/core/src/__tests__/migration.test.ts
```

---

## 接口与 Schema 引用

- `RunLifecycleEvent.status`（`@do-what/protocol`）：`runs.status` 合法值集合

---

## 实现步骤

1. 创建 `src/db/schema.ts`：导出表名常量（`TABLE_EVENT_LOG` 等）和行类型 interface（`EventLogRow`, `RunRow` 等）
2. 创建 `src/db/migrations/v1.ts`：写出完整 DDL SQL
3. 创建 `src/db/migration-runner.ts`：
   - `runPending(db: Database)`：查 `schema_version`，按版本顺序执行未运行迁移
   - 每个迁移在事务中执行：`BEGIN → up(db) → INSERT INTO schema_version → COMMIT`
   - 失败时 `ROLLBACK` + 抛出错误（阻止 Core 启动）
4. 在 `src/db/worker-client.ts`（T006）的 Worker 启动流程中调用 `MigrationRunner.runPending(db)`
5. 编写测试：in-memory SQLite（`:memory:`）中验证迁移幂等性、表结构正确性

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/core test -- --testNamePattern migration

# 验证表结构（需先启动 Core 让迁移执行）
pnpm --filter @do-what/core start &
CORE_PID=$!
sleep 2
kill $CORE_PID

sqlite3 ~/.do-what/state/state.db ".tables"
# 预期输出：agents  approval_queue  event_log  runs  schema_version  snapshots  workspaces

sqlite3 ~/.do-what/state/state.db "SELECT version, description FROM schema_version;"
# 预期输出：1|Initial schema
```

---

## 风险与降级策略

- **风险：** 迁移中途失败（磁盘满/权限问题），导致表结构不一致
  - **降级：** 整个迁移集在同一事务中，失败则回滚；Core 启动失败并输出明确错误 + 建议用户检查磁盘空间
- **风险：** 后期 DDL 变更需要数据迁移（ALTER TABLE 限制）
  - **降级：** SQLite 支持 `ALTER TABLE ... ADD COLUMN`；如需改列类型，使用"创建新表 + 迁移数据 + 重命名"标准模式，在 `v{N}.ts` 中实现
