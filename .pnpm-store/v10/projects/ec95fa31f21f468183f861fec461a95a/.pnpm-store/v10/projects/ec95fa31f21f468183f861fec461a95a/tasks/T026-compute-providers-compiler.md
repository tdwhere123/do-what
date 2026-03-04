# T026 · ComputeProvider 接口 + OfficialAPI/CustomAPI + Memory Compiler 触发器

**Epic:** E7 – Memory Compiler + 自我进化
**依赖:** T025（ComputeProvider 接口）、T022（Soul write path）
**估算改动:** ~500 行

---

## 目标

实现 OfficialAPI/CustomAPI ComputeProvider（通过远程 LLM 端点做语义级总结），以及 Memory Compiler 的完整触发逻辑（SessionEnd/PreCompact，包含预算门控与频率限制）。

---

## 范围

**做什么：**

**OfficialAPI ComputeProvider：**
- 使用 Anthropic SDK 调用官方 API（`anthropic.messages.create`）
- `summarize_diff(input)` → 构造 prompt（diff + conversation_summary）→ 调用 Claude（claude-haiku-4-5，低成本）→ 解析结构化 JSON 输出（cue_drafts）
- prompt 格式（严格 JSON schema 输出）：`"Analyze this git diff and extract memory cues as JSON array..."`
- `embed(texts)` → 调用 Anthropic embedding API（若可用，否则跳过）
- `cost_estimate(input)` → 基于 diff 长度估算 input tokens × haiku 单价
- `isAvailable()` → 检查 API Key 是否配置 + 是否在 daily budget 内

**CustomAPI ComputeProvider：**
- 兼容 OpenAI-compatible API（`openai` npm client，baseURL 可配置）
- `summarize_diff` + `embed` 实现（复用 OfficialAPI 逻辑，不同 client）
- 支持 `provider_type: 'openai-compatible' | 'anthropic-compatible'`
- 配置读取：`soul_config.custom_api: { base_url, api_key, provider_type, extra_headers? }`

**ComputeProviderRegistry（完善 T025 的 stub）：**
- 优先级：`LocalHeuristics < OfficialAPI < CustomAPI`（高级选项配置 CustomAPI）
- `getBestAvailable()` → 按优先级查找第一个 `isAvailable() == true` 的 provider
- 日预算跟踪：`DailyBudget` 类，读写 SQLite `soul_budgets(date, tokens_used, dollars_used)` 表（v4 迁移）
- 预算超限 → 强制降级到 `LocalHeuristics`

**Memory Compiler（MemoryCompiler）：**
- 触发时机：
  1. **SessionEnd**：订阅 `RunLifecycleEvent.completed` → 延迟 5 秒（让用户操作稳定）→ 触发
  2. **PreCompact**：订阅 Core 的 context_window_approaching 事件 → 立即触发
  3. **首次会话深度总结**（Bootstrapping）：T022 中的 `firstSessionDeepCompile` 调用入口
- 触发条件门控：
  - 频率上限：每个 project 每 10 分钟最多 1 次（记录 `last_compiled_at`）
  - 信息熵门控：`LocalHeuristics` 先跑一遍，若 `cue_drafts.length == 0` 则跳过 LLM 调用
  - 日预算门控：`cost_estimate > remaining_budget` → 跳过 + 通知 UI
- 执行流程：
  1. 从 Core 拉取最近 Run 的 git diff（`tools.git_diff` 或读 worktree patch）
  2. 调用 `getBestAvailable().summarize_diff(input, budget)`
  3. 对每个 `cue_draft` 调用 `ProposalService.propose()`（自动写入 Working 级 / 入 Checkpoint 队列）
  4. 发布 `MemoryOperationEvent`

**不做什么：**
- 不实现 UI 配置界面（CustomAPI 的 base_url/key 通过 Core API 写入 soul_config）
- 不实现 EngineQuota provider（方案已明确 v1 默认不启用）

---

## 假设

- `soul_config` 以 JSON 存储在 `~/.do-what/soul-config.json`（独立于 policy.json）
- Memory Compiler 运行在低优先级（使用 `setImmediate` / `setTimeout(fn, 0)` 避免阻塞主事件循环）
- LLM 调用使用 `claude-haiku-4-5`（低成本），prompt 限制 < 4000 tokens
- file_activity 触发默认关闭（方案 8.4），本 Ticket 不实现

---

## 文件清单

```
packages/soul/src/compute/official-api.ts
packages/soul/src/compute/custom-api.ts
packages/soul/src/compute/daily-budget.ts
packages/soul/src/compiler/memory-compiler.ts
packages/soul/src/compiler/compiler-trigger.ts
packages/soul/src/db/migrations/v4.ts              ← soul_budgets 表
packages/soul/src/config/soul-config.ts            ← soul_config 读写
packages/soul/src/__tests__/memory-compiler.test.ts
packages/soul/src/__tests__/official-api.test.ts
```

---

## 接口与 Schema 引用

- `ComputeProvider`（T025）：OfficialAPI/CustomAPI 实现此接口
- `ProposalService.propose()`（T021）：Compiler 产出 cue drafts 后调用
- `RunLifecycleEvent.completed`（`@do-what/protocol`）：Compiler 触发器订阅

---

## 实现步骤

1. 创建 `src/compiler/memory-compiler.ts`：`MemoryCompiler.compile(project_id, diff, summary)` 主流程
2. 创建 `src/compute/daily-budget.ts`：`DailyBudget`，读写 v4 迁移的 `soul_budgets` 表
3. 创建 `src/compute/official-api.ts`：Anthropic SDK 集成，JSON output format prompt，`isAvailable` 检查
4. 创建 `src/compute/custom-api.ts`：OpenAI client 集成，与 OfficialAPI 相同 prompt 格式
5. 完善 `src/compute/registry.ts`（T025 stub）：集成 DailyBudget + 3 个 provider 的优先级
6. 创建 `src/compiler/compiler-trigger.ts`：订阅 Core EventBus + 频率/熵门控 + 触发 MemoryCompiler
7. soul.db 迁移 `v4.ts`：`soul_budgets` 表
8. 编写测试：mock Anthropic SDK；预算超限降级测试；频率门控（同项目 10 分钟内不重复触发）；熵门控（空 diff 跳过）

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/soul test -- --testNamePattern "compiler|official-api|budget"

# LocalHeuristics 触发验证（不需要 API Key）
TOKEN=$(cat ~/.do-what/run/session_token)

# 运行一个 Run，等待完成，验证 Memory Compiler 自动触发
# 通过 SSE 观察 MemoryOperation 事件
curl -N -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3847/events | \
  grep "MemoryOperation" &
SSE_PID=$!

# 触发 Run
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -d '{"engine":"claude","prompt":"write a test file"}' \
  http://127.0.0.1:3847/_dev/start-run

sleep 30  # 等待 Run 完成 + Compiler 触发（5s 延迟）

# 验证有 MemoryOperation 事件出现
kill $SSE_PID

# 验证 Working 级 cue 已写入
sqlite3 ~/.do-what/state/soul.db \
  "SELECT gist, impact_level, source FROM memory_cues ORDER BY created_at DESC LIMIT 5;"
# 预期：有 source='local_heuristic' 的 Working 级 cue
```

---

## 风险与降级策略

- **风险：** Anthropic API 的结构化 JSON 输出格式不稳定（Claude 偶尔输出非 JSON）
  - **降级：** 使用 Anthropic SDK 的 `tool_use` 模式（强制 JSON schema 输出，比 prompt 直接要求更稳定）；解析失败时降级为 LocalHeuristics 结果
- **风险：** Memory Compiler 的 LLM 调用消耗超出预期（diff 很长，token 计数失准）
  - **降级：** 在 LLM 调用前截断 diff（最大 3000 tokens 约 12000 字符）；UI 在每次 Compiler 运行后显示实际消耗；超出日预算时强制停止并通知用户
