# T021 · Soul: soul.propose_memory_update + Checkpoint 队列

**Epic:** E5 – Soul Write Path
**依赖:** T020（memory_repo）、T017（soul.db schema）
**估算改动:** ~350 行

---

## 目标

实现 `soul.propose_memory_update` MCP tool（提交记忆更新草案）和 Checkpoint 队列（pending proposals 持久化 + Core 事件通知），为 T022 的审阅写入流程做准备。

---

## 范围

**做什么：**

**soul.propose_memory_update：**
- 输入：`SoulToolsSchema['soul.propose_memory_update']`
- 生成 `proposal_id`（UUIDv4）
- 将提案写入 soul.db 的 `memory_proposals` 表（新增）
- `impact_level == 'canon'` → `requires_checkpoint = true`（必须走 Checkpoint）
- `impact_level == 'consolidated'` → 如有 pointer 引用则 `requires_checkpoint = true`
- `impact_level == 'working'` → 可直接写入（`requires_checkpoint = false`），但仍记录提案以便审阅
- 返回：`{ proposal_id, requires_checkpoint, status: 'pending' }`
- 发布 `MemoryOperationEvent.propose`

**memory_proposals 表（soul.db 新增迁移 v3）：**
```sql
CREATE TABLE memory_proposals (
  proposal_id     TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  cue_draft       TEXT NOT NULL,   -- JSON
  edge_drafts     TEXT,            -- JSON array
  confidence      REAL NOT NULL,
  impact_level    TEXT NOT NULL,
  requires_checkpoint INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|accepted|rejected|hint_only
  proposed_at     TEXT NOT NULL,
  resolved_at     TEXT,
  resolver        TEXT             -- 'user' | 'auto'
);
CREATE INDEX idx_proposals_project ON memory_proposals(project_id, status);
```

**Checkpoint 队列（CheckpointQueue）：**
- 维护 pending proposals 列表（内存 + soul.db）
- `enqueue(proposal)` → 写 DB + 发布 `SystemHealthEvent`（通知 UI 有待审阅项）
- `getPending(project_id)` → 返回待审阅提案列表
- `size()` → 当前队列长度
- Core 集成：`GET /soul/proposals` → 返回 pending proposals（供 UI 轮询）

**Working 级自动写入路径（bypass checkpoint）：**
- `requires_checkpoint = false` 时，`propose` 直接调用 `soul.review_memory_proposal`（auto-accept）
- 仍记录完整提案历史（status='accepted', resolver='auto'）

**不做什么：**
- 不实现用户审阅操作（留 T022）
- 不实际写入 memory_cues（留 T022，review_memory_proposal 执行写入）

---

## 假设

- `cue_draft.confidence` 范围：0.0-1.0
- canon 级提案必须有 `pointers` 数组非空
- Working 级提案 TTL：7 天（`ttl_days=7`，定期清理过期 Working 级 cue）

---

## 文件清单

```
packages/soul/src/write/proposal-service.ts
packages/soul/src/write/checkpoint-queue.ts
packages/soul/src/mcp/propose-handler.ts
packages/soul/src/db/migrations/v3.ts              ← memory_proposals 表
packages/core/src/server/soul-routes.ts            ← GET /soul/proposals
packages/soul/src/__tests__/proposal-service.test.ts
packages/soul/src/__tests__/checkpoint-queue.test.ts
```

---

## 接口与 Schema 引用

- `SoulToolsSchema['soul.propose_memory_update']`（`@do-what/protocol`）：输入 schema
- `MemoryOperationEvent.propose`（`@do-what/protocol`）：发布事件
- `SystemHealthEvent`（`@do-what/protocol`）：通知 UI 有新 checkpoint 项

---

## 实现步骤

1. soul.db 迁移 `v3.ts`：添加 `memory_proposals` 表
2. 创建 `src/write/proposal-service.ts`：
   - `propose(input)` → 计算 `requires_checkpoint` → 写 DB → 返回结果
   - `autoAccept(proposal_id)` → 标记 accepted（Working 级自动路径）
3. 创建 `src/write/checkpoint-queue.ts`：
   - `enqueue(proposal)` → DB 写 + EventBus 发布 SystemHealth 通知
   - `getPending(project_id)` → DB 读
4. 创建 `src/mcp/propose-handler.ts`：MCP handler → 调用 ProposalService → 触发 CheckpointQueue
5. 在 Core 添加 `GET /soul/proposals?project_id=xxx` 端点（需鉴权）
6. 编写测试：各 impact_level 的 checkpoint 判断；Working 级自动写入路径；队列入队出队

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/soul test -- --testNamePattern proposal

# MCP tool 验证
TOKEN=$(cat ~/.do-what/run/session_token)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool":"soul.propose_memory_update",
    "args":{
      "project_id":"test-proj",
      "cue_draft":{"gist":"core auth logic","type":"pattern","anchors":["auth"],"pointers":[]},
      "confidence":0.7,
      "impact_level":"working"
    }
  }' \
  http://127.0.0.1:3847/mcp/call
# 预期：{ proposal_id: "...", requires_checkpoint: false, status: "pending" }

# 验证 proposals 端点
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3847/soul/proposals?project_id=test-proj"
# 预期：有 working 级提案（或 auto-accepted）
```

---

## 风险与降级策略

- **风险：** Working 级自动写入速度太快，导致 soul.db 写入积压
  - **降级：** Working 级自动接受写入加入写速率限制（每秒最多 10 条），配合 DatabaseWorker 的批次写入
- **风险：** 提案无限积累（用户不审阅）导致 memory_proposals 膨胀
  - **降级：** 定期清理：超过 30 天未处理的 pending 提案自动标记为 `expired`（不删除，保留审计记录）
