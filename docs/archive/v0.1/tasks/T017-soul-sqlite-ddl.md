# T017 · Soul: SQLite DDL（memory_cues + memory_graph_edges + evidence_index）

**Epic:** E4 – Soul Read Path
**依赖:** T007（Core state.db 迁移框架）
**估算改动:** ~300 行

---

## 目标

在 Soul 的专属 SQLite 文件（`~/.do-what/state/soul.db`）中创建 `memory_cues`、`memory_graph_edges`、`evidence_index` 表，以及 FTS5 全文检索虚拟表，并集成到迁移框架。

---

## 范围

**做什么：**

> **注意：DDL 采用方案 B（schema 一步到位，行为分阶段启用）。**
> v0.1.x 的所有字段在 v0.1 阶段就建好，多出的字段允许 nullable / dormant，
> 代码暂时只读写 v0.1 主路径字段。这样避免后续 ALTER TABLE 迁移。
>
> v0.1 旧 `type` 字段已废弃，由三轴模型替代：
> - `source`（来源通道）：compiler | user | seed | import | review
> - `formation_kind`（形成路径）：extracted | explicit | inferred | derived | imported
> - `dimension`（内容维度）：preference | constraint | decision | procedure | fact | hazard | glossary | episode

```sql
-- 记忆线索表（v0.1.x 完整版，v0.1 阶段 dormant 字段标注 [D]）
CREATE TABLE memory_cues (
  -- A. 基础标识
  cue_id        TEXT PRIMARY KEY,
  project_id    TEXT,                    -- 可为 NULL（全局记忆不绑项目）
  gist          TEXT NOT NULL,           -- 短摘要（可注入上下文）
  summary       TEXT,                    -- [D] 长摘要（比 gist 更详细）

  -- B. 三轴（替代旧 type 字段）
  source        TEXT NOT NULL DEFAULT 'compiler',  -- 来源通道：compiler|user|seed|import|review
  formation_kind TEXT,                   -- [D] 形成路径：extracted|explicit|inferred|derived|imported
  dimension     TEXT,                    -- [D] 内容维度：preference|constraint|decision|procedure|fact|hazard|glossary|episode

  -- C. 分层与作用域
  scope         TEXT DEFAULT 'project',  -- [D] project|global-core|global-domain:xxx
  domain_tags   TEXT,                    -- [D] JSON array：["typescript","backend"]
  impact_level  TEXT NOT NULL DEFAULT 'working',  -- working|consolidated|canon
  track         TEXT,                    -- architecture|pattern|api|config|decision

  -- D. 证据锚点
  anchors       TEXT NOT NULL,           -- JSON array of entity names
  pointers      TEXT NOT NULL,           -- JSON array of pointer strings
  evidence_refs TEXT,                    -- [D] JSON array of evidence_id
  focus_surface TEXT,                    -- [D] JSON object：FocusSurface

  -- E. 动力学
  activation_score  REAL DEFAULT 0.0,    -- [D] 显影分数 [0,1]
  retention_score   REAL DEFAULT 0.5,    -- [D] 留存分数 [0,1]
  manifestation_state TEXT DEFAULT 'hidden',  -- [D] hidden|hint|excerpt|full-eligible
  retention_state TEXT DEFAULT 'working',     -- [D] working|consolidated|canon|archived|tombstoned
  decay_profile   TEXT DEFAULT 'normal',      -- [D] pinned|stable|normal|volatile|hazard
  confidence    REAL NOT NULL DEFAULT 0.5,

  -- F. 生命周期
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  last_used_at  TEXT,                    -- [D] 最后被 ContextLens 选中
  last_hit_at   TEXT,                    -- 最后被 memory_search 命中
  hit_count     INTEGER NOT NULL DEFAULT 0,
  reinforcement_count INTEGER DEFAULT 0, -- [D] 正向强化次数
  contradiction_count INTEGER DEFAULT 0, -- [D] 冲突次数
  superseded_by TEXT,                    -- [D] 被覆盖者的 cue_id

  -- G. Claim Form（可选双形态，仅高价值规则型记忆启用）[D]
  claim_namespace TEXT,                  -- [D] 如 code_style、workflow、output
  claim_key       TEXT,                  -- [D] 如 frontend.react.paradigm
  claim_value     TEXT,                  -- [D] 如 functional_hooks
  claim_scope     TEXT,                  -- [D] 如 project:/frontend 或 global-domain:react
  claim_mode      TEXT,                  -- [D] preferred|required|forbidden
  claim_strength  REAL,                  -- [D] [0,1]

  -- H. 扩展
  metadata      TEXT                     -- JSON blob
);

-- v0.1 主路径索引
CREATE INDEX idx_cues_project ON memory_cues(project_id, impact_level);
CREATE INDEX idx_cues_track ON memory_cues(project_id, track);

-- v0.1.x 索引（建表时就创建，不影响 v0.1 性能）
CREATE INDEX idx_cues_scope ON memory_cues(scope, project_id);
CREATE INDEX idx_cues_dimension ON memory_cues(dimension, project_id);
CREATE INDEX idx_cues_claim_key ON memory_cues(claim_key) WHERE claim_key IS NOT NULL;
CREATE INDEX idx_cues_retention ON memory_cues(retention_state, retention_score);
CREATE INDEX idx_cues_activation ON memory_cues(manifestation_state, activation_score DESC);

-- FTS5 全文检索
CREATE VIRTUAL TABLE memory_cues_fts USING fts5(
  gist, anchors, content=memory_cues, content_rowid=rowid
);
-- FTS5 同步触发器
CREATE TRIGGER cue_ai AFTER INSERT ON memory_cues BEGIN
  INSERT INTO memory_cues_fts(rowid, gist, anchors) VALUES (new.rowid, new.gist, new.anchors);
END;
CREATE TRIGGER cue_ad AFTER DELETE ON memory_cues BEGIN
  INSERT INTO memory_cues_fts(memory_cues_fts, rowid, gist, anchors) VALUES('delete', old.rowid, old.gist, old.anchors);
END;
CREATE TRIGGER cue_au AFTER UPDATE ON memory_cues BEGIN
  INSERT INTO memory_cues_fts(memory_cues_fts, rowid, gist, anchors) VALUES('delete', old.rowid, old.gist, old.anchors);
  INSERT INTO memory_cues_fts(rowid, gist, anchors) VALUES (new.rowid, new.gist, new.anchors);
END;

-- 记忆图边（边类型扩充为 v0.1.x 完整版）
CREATE TABLE memory_graph_edges (
  edge_id     TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  relation    TEXT NOT NULL,  -- supports|derives_from|caused_by|contradicts|supersedes|generalizes_to|specializes_to|recalls
  track       TEXT,
  confidence  REAL NOT NULL DEFAULT 0.5,
  evidence    TEXT,           -- pointer string
  created_at  TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES memory_cues(cue_id),
  FOREIGN KEY(target_id) REFERENCES memory_cues(cue_id)
);
CREATE INDEX idx_edges_source ON memory_graph_edges(source_id);
CREATE INDEX idx_edges_target ON memory_graph_edges(target_id);

-- 证据索引（可选 embedding）
CREATE TABLE evidence_index (
  evidence_id   TEXT PRIMARY KEY,
  cue_id        TEXT NOT NULL,
  pointer       TEXT NOT NULL,           -- pointer string（git_commit:sha + repo_path:path + ...）
  pointer_key   TEXT NOT NULL UNIQUE,    -- 规范化 pointer key（用于快速查找）
  level         TEXT NOT NULL DEFAULT 'hint',  -- 'hint|excerpt|full'
  content_hash  TEXT,                   -- sha256 of content at last access
  embedding     BLOB,                   -- 可选：float32 向量
  last_accessed TEXT,
  access_count  INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(cue_id) REFERENCES memory_cues(cue_id)
);
CREATE INDEX idx_evidence_cue ON evidence_index(cue_id);
CREATE INDEX idx_evidence_pointer_key ON evidence_index(pointer_key);

-- Soul 迁移版本（独立于 state.db）
CREATE TABLE soul_schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL,
  description TEXT NOT NULL
);
```

- Soul 的 `DatabaseWorker`（独立 worker，不共享 state.db 的 worker）
- `SoulStateStore`：封装 soul.db 的读连接
- 迁移版本独立追踪（`soul_schema_version`）

**不做什么：**
- 不实现查询逻辑（留 T018/T019）
- 不实现 memory_repo（留 T020）

---

## 假设

- soul.db 路径：`~/.do-what/state/soul.db`（由 `packages/soul/src/config.ts` 定义）
- FTS5 在 better-sqlite3 的预编译包中已包含（Windows 预编译包含 FTS5）
- embedding BLOB 存储格式：`Float32Array` 的 raw bytes

---

## 文件清单

```
packages/soul/src/db/migrations/v1.ts         ← Soul 初始 DDL
packages/soul/src/db/migrations/index.ts
packages/soul/src/db/migration-runner.ts      ← 复用 Core 的迁移框架
packages/soul/src/db/soul-worker.ts           ← Soul 专用 DatabaseWorker
packages/soul/src/db/soul-state-store.ts
packages/soul/src/db/schema.ts                ← 行类型 interface（CueRow, EdgeRow, EvidenceRow）
packages/soul/src/db/index.ts
packages/soul/src/config.ts
packages/soul/src/__tests__/soul-ddl.test.ts
packages/soul/package.json                    ← 添加 better-sqlite3 依赖
```

---

## 接口与 Schema 引用

- `RunLifecycleEvent`（`@do-what/protocol`）：`memory_cues.impact_level` 枚举来自方案定义

---

## 实现步骤

1. 创建 `src/config.ts`：SOUL_DB_PATH, MEMORY_REPO_BASE_PATH 等常量
2. 创建 `src/db/schema.ts`：`CueRow`（含三轴 + 动力学 + Claim 字段，dormant 字段标注可选）、`EdgeRow`、`EvidenceRow` interface
3. 创建 `src/db/migrations/v1.ts`：v0.1.x 完整 DDL + FTS5 + 触发器 + 全部索引
4. 复用 Core 的 `MigrationRunner`（或提取到 shared utils）
5. 创建 `src/db/soul-worker.ts`：独立 worker_threads DatabaseWorker（结构同 T006，但连接 soul.db）
6. 创建 `src/db/soul-state-store.ts`：只读连接 + 基础查询方法（暂为 stub，T018/T019 实现）
7. 编写测试：in-memory soul.db 迁移 + FTS5 insert/search 基础验证

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/soul test -- --testNamePattern ddl

# 验证 soul.db 表结构
node -e "
const Database = require('better-sqlite3');
const db = new Database(process.env.HOME + '/.do-what/state/soul.db');
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
console.log('Tables:', tables.map(t => t.name).join(', '));
// 预期包含：memory_cues, memory_graph_edges, evidence_index, soul_schema_version
"

# FTS5 smoke test
sqlite3 ~/.do-what/state/soul.db "
INSERT INTO memory_cues (cue_id, project_id, gist, source, anchors, pointers, created_at, updated_at)
VALUES ('test-1', 'proj-1', 'auth logic moved to middleware', 'compiler', '[\"auth\"]', '[]', datetime('now'), datetime('now'));
SELECT cue_id FROM memory_cues_fts WHERE memory_cues_fts MATCH 'auth';
"
# 预期输出：test-1
```

---

## 风险与降级策略

- **风险：** FTS5 在 Windows 预编译 better-sqlite3 中不可用
  - **降级：** FTS5 创建失败时回退为普通 `LIKE` 查询（性能较差），并在启动日志中记录警告；FTS5 设为可选（迁移时 try/catch）
- **风险：** FTS5 触发器在大批量写入时导致写放大（每条 INSERT 额外触发 FTS 更新）
  - **降级：** 关闭自动触发器，改为异步批量 FTS rebuild（低优先级队列）；对于初始数据导入，先写 memory_cues，再一次性重建 FTS 索引
