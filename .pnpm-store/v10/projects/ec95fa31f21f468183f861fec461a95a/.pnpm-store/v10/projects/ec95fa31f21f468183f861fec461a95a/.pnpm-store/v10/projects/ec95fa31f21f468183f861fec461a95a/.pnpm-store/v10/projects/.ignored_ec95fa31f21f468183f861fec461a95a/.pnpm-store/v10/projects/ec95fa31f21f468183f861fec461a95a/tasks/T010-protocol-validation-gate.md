# T010 · 协议验证门控（Claude Hooks + Codex App Server Smoke Test）

**Epic:** E1.5 – Protocol Validation Gate
**依赖:** T005～T009（Core 骨架完成）
**估算改动:** ~200 行脚本 + 验证报告

---

## 目标

这是一个**门控 Ticket**——在进入 E2/E3 大量实现工作之前，验证 Claude Code（Hooks）和 Codex（App Server）的实际协议行为是否与方案文档一致。产出：验证报告（`docs/protocol-validation-report.md`）+ 可重跑的验证脚本。

**若此步发现协议不符预期，必须回头修改方案，代价最小。**

---

## 范围

**做什么：**
- 编写 `scripts/validate-claude-hooks.ts`：
  - 启动一个最简 Hook Runner（监听 stdin，将 hook 事件转发到 Core `/events`）
  - 使用 `claude` CLI 执行简单任务（`echo test`），带上 hook 配置
  - 捕获并记录实际收到的 hook 事件 JSON，与 Protocol 类型做 zod 解析验证
- 编写 `scripts/validate-codex-appserver.ts`：
  - 启动 `codex app-server` 子进程
  - 发送一条简单 JSONL 消息，检验双向通信
  - 记录实际收到的事件格式
- 验证以下关键问题（对应方案 Step 1.5 的检查点）：
  1. Hook 事件格式是否与 Protocol Schema 兼容？未知字段是否能 passthrough？
  2. Hook 超时行为：200ms 内能否响应？
  3. deny → reroute 到 MCP 工具的成功率（mock 测试，记录结论）
  4. Codex App Server 的事件类型覆盖（token_stream / plan_node / diff / approval_request）
  5. EngineQuota 可行性初步判断（Claude `--print` flag 可用性）
- 产出 `docs/protocol-validation-report.md`：
  - 每个检查点的状态（✅ 符合 / ⚠️ 部分符合 / ❌ 不符合）
  - 发现的格式差异（字段名、类型、枚举值）
  - 后续需要修改的 Protocol Schema 或适配器策略

**不做什么：**
- 不实现完整适配器（留 E2/E3）
- 不部署 MCP server（留 T012）

---

## 假设

- 开发机已安装 `claude` CLI（最新稳定版）且已登录
- 开发机已安装 `codex` CLI（最新稳定版）且有 API Key
- Claude Code 的 hooks 配置格式遵循官方文档（PreToolUse / PostToolUse / Stop）
- Codex App Server 通过 `codex app-server --stdio` 启动，使用 JSONL 通信

---

## 文件清单

```
scripts/validate-claude-hooks.ts
scripts/validate-codex-appserver.ts
scripts/validation-runner.ts             ← 统一运行两个验证脚本
docs/protocol-validation-report.md      ← 输出报告（手动填写，脚本提供原始数据）
```

---

## 接口与 Schema 引用

- 所有 Protocol Schema（`@do-what/protocol`）：用于验证实际事件的兼容性

---

## 实现步骤

1. 创建 `scripts/validate-claude-hooks.ts`：spawn `claude` with hook config → 记录原始 JSON → 用 zod parse 验证 → 打印 diff（预期 vs 实际）
2. 创建 `scripts/validate-codex-appserver.ts`：spawn `codex app-server` → 发送消息 → 记录响应 → 验证格式
3. 运行两个脚本，收集原始数据
4. 根据实际数据，手动填写 `docs/protocol-validation-report.md`，明确列出每个差异和处置方案
5. **如有差异**：在同一 PR 中修改 `packages/protocol` 中的 schema（加 `.passthrough()`、调整字段名等）确保前向兼容
6. **如发现严重不兼容**：在报告中标记为 ❌，并创建新 Ticket 记录需要修改的方案章节

---

## DoD + 验收命令

```bash
# 运行协议验证（需已安装 claude + codex CLI）
npx tsx scripts/validation-runner.ts 2>&1 | tee /tmp/validation-output.txt

# 预期：所有关键检查点输出状态（✅/⚠️/❌）
# 报告文件生成
cat docs/protocol-validation-report.md

# 关键验收标准：
# 1. docs/protocol-validation-report.md 存在且非空
# 2. 报告中无 ❌ 条目（或有 ❌ 但已创建对应修复 Ticket）
# 3. Protocol Schema 中的 zod parse 对实际 hook 事件成功率 >= 95%
# 4. Core SSE 能收到来自 hook runner 的事件（端到端连通）
```

---

## 风险与降级策略

- **风险：** Claude CLI 版本更新导致 hook 事件格式变化（这是最可能触发方案修改的点）
  - **降级：** 若关键字段缺失，在 protocol schema 中将该字段改为 `z.optional()`；若事件类型完全变化，在报告中标记并暂停 E2 开发
- **风险：** Codex App Server 接口不稳定或文档不完整
  - **降级：** 降级为一次性 Tool 运行模式（见方案 4.4），在报告中记录"Codex App Server 不可用"，E3 调整为黑盒 CLI 模式
- **风险：** EngineQuota（Claude `--print`）不可行
  - **降级：** 按方案已预定：EngineQuota 默认不启用，Soul 走 LocalHeuristics，无需修改主路径
