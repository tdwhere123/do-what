# T018 · Soul: soul.memory_search（FTS5 + 预算控制）

**Epic:** E4 – Soul Read Path
**依赖:** T017（Soul SQLite DDL）、T004（Soul MCP schema）
**估算改动:** ~350 行

---

## 目标

实现 `soul.memory_search` MCP tool：对 `memory_cues` 做 FTS5 全文检索 + 可选 embedding 语义排序，返回 `CueRef[]`（仅 gist + pointers + score + why），严格控制 token 预算（方案 11.1）。

---

## 范围

**做什么：**
- `MemorySearchService`：
  - FTS5 查询：`SELECT ... FROM memory_cues_fts WHERE memory_cues_fts MATCH ?`，按 BM25 分数排序
  - 过滤：`project_id`、`tracks`（可选）、`impact_level >= working`（archived=0）
  - Bootstrapping Phase 处理：项目创建后 N 天内（`bootstrapping_phase=true`），将 confidence>=0.6 的 Working 级 cue 加入结果（标注 `[trial]`）
  - 预算控制：结果数量受 `limit`（默认 10，最大 20）+ `budget` 参数（token 上限，超预算截断）
  - embedding 语义排序：若 embedding 可用，对 FTS5 候选做余弦相似度重排（可选，见方案 8.5.6）
- `soul.memory_search` MCP tool handler：
  - 输入：`SoulToolsSchema['soul.memory_search']`（T004 定义）
  - 输出：`{ cues: CueRef[], budget_used: number, total_found: number, degraded?: boolean }`
  - 发布 `MemoryOperationEvent.search`
- `RetrievalRouter`：封装检索逻辑，冷启动注入逻辑（Top 1-3 gist 仅 Hint）

**不做什么：**
- 不实现 embedding 生成（留 T025/T026，本 Ticket 仅做可选消费）
- 不实现 open_pointer（留 T019）

---

## 假设

- token 预算估算：1 token ≈ 4 字符（粗略，用于客户端截断提示）
- FTS5 MATCH 语法：使用 SQLite FTS5 标准语法（`term1 term2`，空格为 AND）
- 若 FTS5 不可用（降级），使用 `LIKE '%query%'` 回退
- Bootstrapping Phase 持续天数存在 `workspaces` 表的 `metadata` JSON 中

---

## 文件清单

```
packages/soul/src/search/memory-search.ts
packages/soul/src/search/retrieval-router.ts
packages/soul/src/search/budget-calculator.ts    ← token 预算估算
packages/soul/src/search/embedding-ranker.ts     ← 可选 embedding 重排（stub，T026 实现）
packages/soul/src/mcp/search-handler.ts          ← MCP tool handler
packages/soul/src/__tests__/memory-search.test.ts
```

---

## 接口与 Schema 引用

- `SoulToolsSchema['soul.memory_search']`（`@do-what/protocol`）：输入 schema
- `CueRef`（`@do-what/protocol`）：输出类型
- `MemoryOperationEvent.search`（`@do-what/protocol`）：发布事件

---

## 实现步骤

1. 创建 `src/search/budget-calculator.ts`：`estimateTokens(text: string): number`（字符数 / 4 取整）
2. 创建 `src/search/embedding-ranker.ts`：stub，`rank(query, cues): CueRef[]` 直接返回原序（T026 再实现）
3. 创建 `src/search/memory-search.ts`：FTS5 查询 + 过滤 + Bootstrapping 处理 + embedding 重排
4. 创建 `src/search/retrieval-router.ts`：封装冷启动注入逻辑（Top 1-3，仅 Hint 级 gist）
5. 创建 `src/mcp/search-handler.ts`：MCP tool handler，调用 MemorySearchService + 发布事件 + 返回结果
6. 编写测试：插入测试 cue → 搜索 → 验证结果排序和字段；预算截断测试；Bootstrapping Phase 测试

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/soul test -- --testNamePattern search

# 端到端验证（需 Core + Soul MCP Server 运行）
# 插入测试数据
sqlite3 ~/.do-what/state/soul.db "
INSERT INTO memory_cues VALUES (
  'cue-test-1', 'test-proj', 'authentication logic refactored to service layer',
  'pattern', 'architecture', '[\"auth\",\"service\"]', '[\"git_commit:abc123\"]',
  0.8, 'consolidated', 'compiler', datetime('now'), datetime('now'),
  NULL, 0, 0, NULL, NULL
);"

# 调用 MCP tool（通过 Core HTTP API）
TOKEN=$(cat ~/.do-what/run/session_token)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"soul.memory_search","args":{"project_id":"test-proj","query":"auth service","limit":5}}' \
  http://127.0.0.1:3847/mcp/call

# 预期：返回包含 cue-test-1 的结果，score > 0
```

---

## 风险与降级策略

- **风险：** FTS5 MATCH 查询语法错误（用户输入特殊字符如 `(`、`"` 导致 SQL 错误）
  - **降级：** 对 query 参数做 sanitize（去除 FTS5 特殊字符），或使用 `fts5_api` 的 phrase 查询模式；catch SQLite 异常降级为 LIKE 查询
- **风险：** Bootstrapping Phase 判断逻辑需要访问 `workspaces` 表（不在 soul.db 中）
  - **降级：** Soul 从 Core 的 `GET /state` 接口读取当前 workspace 的 bootstrapping 状态（HTTP 调用），或通过依赖注入传入
