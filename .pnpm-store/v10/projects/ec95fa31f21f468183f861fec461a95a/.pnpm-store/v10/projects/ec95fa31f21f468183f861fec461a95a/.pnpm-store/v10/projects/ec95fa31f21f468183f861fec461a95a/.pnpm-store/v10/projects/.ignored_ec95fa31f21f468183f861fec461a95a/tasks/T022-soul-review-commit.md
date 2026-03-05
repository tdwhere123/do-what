# T022 · Soul: soul.review_memory_proposal + commit + Bootstrapping Phase

**Epic:** E5 – Soul Write Path
**依赖:** T021（Checkpoint 队列）、T020（memory_repo）
**估算改动:** ~400 行

---

## 目标

实现 `soul.review_memory_proposal` MCP tool（用户审阅操作），将审阅通过的提案写入 `memory_cues` + `memory_graph_edges`（SQLite），并 commit 到 `memory_repo`（Canon 级）。同时实现 Bootstrapping Phase 的种子记忆写入与首次深度总结逻辑。

---

## 范围

**做什么：**

**soul.review_memory_proposal：**
- 输入：`{ proposal_id, action: 'accept|edit|reject|hint_only', edits? }`
- `accept`：将 cue_draft + edge_drafts 写入 memory_cues + memory_graph_edges；Canon 级同时 commit memory_repo
- `edit`：用 edits 覆盖 cue_draft 后执行 accept
- `reject`：标记提案为 rejected，不写 cue
- `hint_only`：写入 memory_cues 但 `impact_level` 强制降为 `working`，不走 Checkpoint 流程
- 写入后更新提案状态（`resolved_at`, `resolver: 'user'`）
- 发布 `MemoryOperationEvent.commit`

**CueWriter（写 memory_cues）：**
- 检查是否存在相同 `anchors` + `type` + `project_id` 的 cue（防重复）
- 存在则 update（gist/confidence/pointers/updated_at）；不存在则 insert
- `impact_level` 晋升逻辑：Working → Consolidated 需满足（`hit_count >= 3` 且 `len(pointers) > 0`）；Consolidated → Canon 需 Checkpoint

**EdgeWriter（写 memory_graph_edges）：**
- 批量写入 edge_drafts，忽略已存在的同 source+target+relation 边

**memory_repo commit 规则（Canon/Consolidated）：**
- 将 cue 内容序列化为 Markdown（`memory_cues/<cue_id>.md`），写入 memory_repo
- git commit message：`feat(memory): add <type> cue - <gist[:50]>`

**Bootstrapping Phase：**
- `seedMemory(project_id, seeds: string[])` → 直接写入 Consolidated 级 cue（1-5 条用户种子）
- `firstSessionDeepCompile(project_id, sessionSummary)` → 绕过频率限制，触发一次完整 Memory Compiler（调用 T026 接口，本 Ticket 提供调用入口，实现留 T026）
- Bootstrapping Phase 结束判断：`now > created_at + bootstrapping_phase_days`

**不做什么：**
- 不实现 Memory Compiler 的具体逻辑（留 T026）

---

## 假设

- Canon 级 cue 的 Markdown 格式：`# <gist>\n\ntype: <type>\nanchors: <anchors>\npointers: <pointers>\n\n## Evidence\n<evidence links>`
- Working 级 cue 不写 memory_repo（只在 SQLite）
- 重复 cue 检测使用 `anchors` + `type` + `project_id` 的组合（不用 gist 做相似度，避免引入 embedding 依赖）

---

## 文件清单

```
packages/soul/src/write/cue-writer.ts
packages/soul/src/write/edge-writer.ts
packages/soul/src/write/repo-committer.ts           ← memory_repo commit
packages/soul/src/write/bootstrapping.ts
packages/soul/src/mcp/review-handler.ts
packages/soul/src/__tests__/cue-writer.test.ts
packages/soul/src/__tests__/review-handler.test.ts
packages/soul/src/__tests__/bootstrapping.test.ts
```

---

## 接口与 Schema 引用

- `SoulToolsSchema['soul.review_memory_proposal']`（`@do-what/protocol`）：输入 schema
- `MemoryOperationEvent.commit`（`@do-what/protocol`）：发布事件

---

## 实现步骤

1. 创建 `src/write/cue-writer.ts`：upsert 逻辑 + 晋升判断
2. 创建 `src/write/edge-writer.ts`：批量 upsert edges
3. 创建 `src/write/repo-committer.ts`：序列化 cue 为 Markdown + 调用 memory_repo commit（通过 GitOpsQueue）
4. 创建 `src/mcp/review-handler.ts`：accept/edit/reject/hint_only 四路处理
5. 创建 `src/write/bootstrapping.ts`：`seedMemory` + `firstSessionDeepCompile`（后者为调用 Compiler 的 stub）
6. 编写测试：四路 review 动作；Canon 级 commit 到 memory_repo；重复 cue 防止；晋升逻辑

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/soul test -- --testNamePattern "review|bootstrapping"

# 端到端：提案 → 审阅 → 写入 → memory_repo commit
TOKEN=$(cat ~/.do-what/run/session_token)

# 1. 提案一条 canon 级记忆
PROPOSAL=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"soul.propose_memory_update","args":{"project_id":"test-proj","cue_draft":{"gist":"monorepo uses pnpm workspace","type":"decision","anchors":["monorepo"],"pointers":["git_commit:abc123 repo_path:package.json"]},"confidence":0.9,"impact_level":"canon"}}' \
  http://127.0.0.1:3847/mcp/call)
PROPOSAL_ID=$(echo $PROPOSAL | jq -r '.proposal_id')

# 2. 审阅通过
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tool\":\"soul.review_memory_proposal\",\"args\":{\"proposal_id\":\"$PROPOSAL_ID\",\"action\":\"accept\"}}" \
  http://127.0.0.1:3847/mcp/call

# 3. 验证 memory_cues 写入
sqlite3 ~/.do-what/state/soul.db "SELECT gist, impact_level FROM memory_cues WHERE project_id='test-proj';"
# 预期：monorepo uses pnpm workspace | canon

# 4. 验证 memory_repo commit
git -C ~/.do-what/memory/*/memory_repo/ log --oneline | head -3
# 预期：最新 commit 包含 cue_id
```

---

## 风险与降级策略

- **风险：** memory_repo 的 Git 操作（commit）因网络或权限问题失败
  - **降级：** Git commit 失败时，cue 仍写入 SQLite（已成功），仅记录"memory_repo 同步失败"警告；下次 gc/触发时重试 commit
- **风险：** 重复 cue 检测过于严格（相同 anchors+type 的合理重复内容被合并）
  - **降级：** 提供 `force_new: boolean` 参数，跳过重复检测；重复时 UI 显示"已有类似记忆"并给出 diff
