# T027 · Lazy Pointer 自愈（Refactor Event + 按需重定位链）

**Epic:** E7 – Memory Compiler + 自我进化
**依赖:** T019（open_pointer，懒自愈触发入口）、T020（memory_repo，git rename detection）
**估算改动:** ~400 行

---

## 目标

实现 Pointer 懒自愈机制：不在重构发生时立即全量修复，而是记录 `RefactorEvent`，在下次 `open_pointer` 发现指针失效时，按四级降级链（git rename → 符号搜索 → snippet hash → 语义回退）按需重定位。

---

## 范围

**做什么：**

**RefactorEvent 记录：**
- Memory Compiler 触发时（T026），若 diff 包含 `rename detection` 信息（`similarity index \d+%`），记录 `refactor_events` 表（soul.db v5 迁移）
- 字段：`{ event_id, project_id, commit_sha, renames: [{old_path, new_path, similarity}], detected_at }`

**PointerRelocator（四级重定位链）：**

```
1) git rename 线索
   - 查 refactor_events 中最近的 rename 记录
   - 若 old_path == pointer.repo_path → new_path 候选

2) 符号搜索
   - 在 new_path（或同模块目录）用 Tree-sitter / ripgrep 搜索 pointer.symbol
   - 返回文件路径 + 行号候选

3) snippet hash 近邻
   - 读取 evidence_index.content_hash
   - 在候选文件中用 rolling hash 搜索相似片段（Jaccard 相似度 > 0.8）

4) 语义回退（仅 Canon 级 cue）
   - 若有 embedding 可用：对 pointer 的 gist 做 embedding 查询，找最相似的 evidence_index 记录
   - 返回候选（必须再经用户 Checkpoint 确认）
```

**懒自愈触发（在 T019 的 open_pointer 中集成）：**
- `open_pointer` 发现指针失效（文件不存在 / symbol 不存在）→ 调用 `PointerRelocator.relocate(pointer)`
- 重定位成功：更新 `evidence_index.pointer`（新路径）→ 返回新位置的内容
- 重定位失败或语义回退：返回 `{ found: false, relocation_status: 'failed'|'semantic_candidate', candidate? }`
- 更新 `evidence_index`：无论成功/失败，记录 `relocation_attempted_at` + `relocation_result`

**自愈任务管理（速率限制）：**
- 低优先级队列（`HealingQueue`）：所有重定位任务串行执行
- 速率限制：每分钟最多 5 次重定位尝试（防止 CPU/IO 突刺）
- 可取消：Core 关闭时清空队列
- UI 可显示"N 个指针需要自愈"状态

**refactor_events 表（soul.db v5 迁移）：**
```sql
CREATE TABLE refactor_events (
  event_id    TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  commit_sha  TEXT NOT NULL,
  renames     TEXT NOT NULL,   -- JSON array of {old_path, new_path, similarity}
  detected_at TEXT NOT NULL
);
CREATE INDEX idx_refactor_project ON refactor_events(project_id, detected_at);
```

**evidence_index 扩展（v5 迁移中 ALTER TABLE）：**
```sql
ALTER TABLE evidence_index ADD COLUMN relocation_status TEXT;
ALTER TABLE evidence_index ADD COLUMN relocation_attempted_at TEXT;
ALTER TABLE evidence_index ADD COLUMN relocated_pointer TEXT;
```

**不做什么：**
- 不做全量自愈扫描（懒加载，只处理被访问到的指针）
- 不实现 Pointer 的内存自动归档/清理（留运营性功能）

---

## 假设

- rename detection：通过 `git diff --find-renames <commit>^..<commit>` 解析 `similarity index` 行
- ripgrep（`rg`）用于快速符号搜索（可移植 binary，由 toolchain 管理）
- 语义回退仅对 Canon 级 cue 启用（避免在 Working 级浪费 embedding 资源）
- Jaccard 相似度计算：将代码行 tokenize 成 unigram 集合（简单空格分词）

---

## 文件清单

```
packages/soul/src/pointer/pointer-relocator.ts
packages/soul/src/pointer/git-rename-detector.ts
packages/soul/src/pointer/symbol-searcher.ts      ← Tree-sitter + ripgrep
packages/soul/src/pointer/snippet-matcher.ts       ← rolling hash / Jaccard
packages/soul/src/pointer/semantic-fallback.ts     ← embedding 相似检索
packages/soul/src/pointer/healing-queue.ts
packages/soul/src/db/migrations/v5.ts
packages/soul/src/__tests__/pointer-relocator.test.ts
packages/soul/src/__tests__/healing-queue.test.ts
```

---

## 接口与 Schema 引用

- `EvidenceRow`（T017 的 `schema.ts`）：更新 relocation 字段
- `MemoryOperationEvent.open`（`@do-what/protocol`）：重定位结果包含在响应中

---

## 实现步骤

1. soul.db 迁移 `v5.ts`：`refactor_events` 表 + `ALTER TABLE evidence_index ADD COLUMN` 三个字段
2. 创建 `src/pointer/git-rename-detector.ts`：解析 `git diff --find-renames` 输出，写 `refactor_events`
3. 创建 `src/pointer/symbol-searcher.ts`：ripgrep 调用（`rg --json <symbol> <dir>`）+ Tree-sitter 候选
4. 创建 `src/pointer/snippet-matcher.ts`：Jaccard 相似度实现（unigram tokenize + set intersection / union）
5. 创建 `src/pointer/semantic-fallback.ts`：embedding 查询（调用 T026 的 `ComputeProvider.embed`）→ 余弦相似度排序
6. 创建 `src/pointer/pointer-relocator.ts`：四级链组合，每级失败时降级
7. 创建 `src/pointer/healing-queue.ts`：低优先级串行队列，速率限制
8. 集成到 T019 的 `open-pointer-handler.ts`：失效时调用 `HealingQueue.enqueue`
9. 编写测试：各级重定位的 mock 测试；速率限制；失败降级链

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/soul test -- --testNamePattern "relocat|healing"

# 端到端验证（模拟文件重命名场景）
# 1. 写入一条带 pointer 的 cue
sqlite3 ~/.do-what/state/soul.db "
INSERT INTO evidence_index (evidence_id, cue_id, pointer, pointer_key, level)
VALUES ('ev-1', 'cue-test-1', 'git_commit:abc123 repo_path:src/auth.ts symbol:authenticate',
        'sha256-of-pointer', 'full');
"

# 2. 模拟文件移动（直接修改 evidence_index，不需真实 git）
# 调用 open_pointer（文件不存在 → 触发自愈）
TOKEN=$(cat ~/.do-what/run/session_token)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"soul.open_pointer","args":{"pointer":"git_commit:abc123 repo_path:src/auth.ts symbol:authenticate","level":"hint"}}' \
  http://127.0.0.1:3847/mcp/call
# 预期：{ found: false, relocation_status: 'failed', suggested_relocation: true }
# 或（若 symbol 在新路径找到）：{ found: true, relocated_to: 'src/auth/service.ts:...' }

# 验证 healing_queue 统计
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:3847/soul/healing/stats
# 预期：{ queued: 0, completed: 1, failed: 0 }
```

---

## 风险与降级策略

- **风险：** 四级链全部失败，指针永久失效（文件删除/重大重构）
  - **降级：** 标记 evidence_index 的 `relocation_status = 'irrecoverable'`；open_pointer 返回 `{ found: false, archived: true }`；UI 提示用户是否手动更新或删除该 cue
- **风险：** snippet hash 的 Jaccard 相似度在代码变更较大时误匹配（把不相关函数当作目标）
  - **降级：** Jaccard 阈值提高到 0.85；同时要求候选文件路径与原路径同目录层级（防跨模块误匹配）
- **风险：** ripgrep 不在 PATH 中（未安装）
  - **降级：** 降级为 Node.js 原生 `fs.readdir` + 正则搜索（性能差，但功能可用）；记录 toolchain 断言失败日志
