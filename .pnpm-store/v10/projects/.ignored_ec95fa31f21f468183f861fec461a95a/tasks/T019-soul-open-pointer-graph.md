# T019 · Soul: soul.open_pointer（Hint/Excerpt/Full）+ soul.explore_graph

**Epic:** E4 – Soul Read Path
**依赖:** T018（memory_search 完成）
**估算改动:** ~400 行

---

## 目标

实现 `soul.open_pointer` MCP tool（三段式显影 Hint/Excerpt/Full，严格 token 预算）和 `soul.explore_graph` MCP tool（图谱遍历），以及 Pointer 解析与证据展开的核心逻辑。

---

## 范围

**做什么：**

**soul.open_pointer：**
- 解析 pointer 字符串（格式：`type:value` 组合，如 `git_commit:abc123 + repo_path:src/auth.ts + symbol:authenticate`）
- 三级展开：
  - `hint`：返回 gist + pointer 元数据（不读文件，< 50 tokens）
  - `excerpt`：返回文件中最相关片段（受 `max_tokens`/`max_lines` 限制，默认 200 tokens）
  - `full`：返回完整 symbol/heading 单元（受 `max_tokens` 限制，默认 800 tokens，按 symbol/heading 边界截断）
- 证据访问控制：
  - 路径白名单：只能访问 workspace 内路径（`tools.file_read` 白名单策略复用）
  - 预算硬限制：超过 `max_tokens` → 自动降级（full → excerpt → hint）并在响应中标注 `degraded: true`
- pointer 失效处理：git commit 不存在 / 文件不存在 → 触发懒自愈（记录 `pointer_relocation_needed` 到 evidence_index），返回 `{ found: false, suggested_relocation: true }`
- 更新 `evidence_index.last_accessed` + `access_count`
- 发布 `MemoryOperationEvent.open`

**soul.explore_graph：**
- 从 `entity_name` 出发，在 `memory_graph_edges` 中做 BFS（`depth` 跳）
- 返回边 + 关联 cue 的 gist（仅 Hint 级，不展开证据）
- `limit`：最多返回节点数（默认 20）
- 发布 `MemoryOperationEvent.search`（复用事件类型）

**Pointer 解析器（`PointerParser`）：**
- 解析：`"git_commit:abc123 repo_path:src/auth/login.ts symbol:authenticate"` → `{ gitCommit, repoPath, symbol, snippetHash? }`
- `pointer_key` 生成：规范化排序后 sha256（用于 evidence_index 快速查找）

**Evidence Extractor（基础版）：**
- 读取文件内容（通过 `tools.file_read` 接口或直接 fs.readFile，路径白名单校验）
- `hint`：直接返回 gist（不读文件）
- `excerpt`：读文件后定位 symbol（基础版：行号范围搜索，不依赖 LSP）
- `full`：读文件后提取完整函数/类（Tree-sitter 解析，若不可用则按行范围兜底）

**不做什么：**
- 不实现完整 LSP 符号定位（留 toolchain 包）
- 不实现 Pointer 自愈链路（记录需求，留 T027）

---

## 假设

- Tree-sitter（`tree-sitter` npm 包）用于基础符号提取；若不可用，按函数起始行 + 缩进推断范围
- pointer string 格式：空格分隔的 `key:value` pairs

---

## 文件清单

```
packages/soul/src/pointer/pointer-parser.ts
packages/soul/src/pointer/pointer-key.ts
packages/soul/src/evidence/evidence-extractor.ts
packages/soul/src/evidence/symbol-extractor.ts      ← Tree-sitter + 行范围回退
packages/soul/src/mcp/open-pointer-handler.ts
packages/soul/src/mcp/explore-graph-handler.ts
packages/soul/src/__tests__/pointer-parser.test.ts
packages/soul/src/__tests__/open-pointer.test.ts
packages/soul/src/__tests__/explore-graph.test.ts
```

---

## 接口与 Schema 引用

- `SoulToolsSchema['soul.open_pointer']`, `SoulToolsSchema['soul.explore_graph']`（`@do-what/protocol`）
- `MemoryOperationEvent.open`（`@do-what/protocol`）

---

## 实现步骤

1. 创建 `src/pointer/pointer-parser.ts`：`parsePointer(str)` → `PointerComponents`
2. 创建 `src/pointer/pointer-key.ts`：`generatePointerKey(components)` → sha256 of normalized string
3. 创建 `src/evidence/symbol-extractor.ts`：Tree-sitter parse → 查找 symbol → 返回行范围；Tree-sitter 不可用时按函数关键词 + 缩进推断
4. 创建 `src/evidence/evidence-extractor.ts`：`extract(pointer, level, budget)` → 调用 file_read + symbol_extractor，按预算截断
5. 创建 `src/mcp/open-pointer-handler.ts`：MCP handler，解析 → 权限检查 → extract → 更新 evidence_index → 发布事件
6. 创建 `src/mcp/explore-graph-handler.ts`：BFS 图遍历 + 返回结果
7. 编写测试：pointer 解析各格式；extract 三级测试（用 mock 文件）；图遍历 BFS 测试

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/soul test -- --testNamePattern "pointer|graph"

# open_pointer smoke test（Hint 级，不读文件）
TOKEN=$(cat ~/.do-what/run/session_token)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"soul.open_pointer","args":{"pointer":"git_commit:abc123 repo_path:src/auth.ts","level":"hint","max_tokens":100}}' \
  http://127.0.0.1:3847/mcp/call
# 预期：返回 gist 字段，不读取文件内容

# explore_graph smoke test
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"soul.explore_graph","args":{"entity_name":"auth","track":"architecture","depth":2}}' \
  http://127.0.0.1:3847/mcp/call
# 预期：返回 nodes 和 edges 数组
```

---

## 风险与降级策略

- **风险：** Tree-sitter 的 Node.js binding 在 Windows 需要 native 编译
  - **降级：** Tree-sitter 设为可选依赖；若加载失败，symbol extractor 回退为正则 + 缩进推断（处理 TypeScript/Python/Go 的常见函数声明模式）
- **风险：** `git show <commit>:<path>` 命令在 pointer relocation 时超时
  - **降级：** 超时（2000ms）后返回 `{ found: false, reason: 'git_timeout' }`，不阻塞 MCP tool 响应
