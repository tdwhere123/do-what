# T015 · Codex 适配器：事件归一化 + 审批流 + Tools API MCP Server

**Epic:** E3 – Codex Engine Adapter
**依赖:** T014（Codex 进程管理）、T012（Tools API MCP Server 参考）
**估算改动:** ~500 行

---

## 目标

将 Codex App Server 发出的原始 JSONL 消息归一化为 do-what 统一事件模型（Protocol），接管 Codex 的工具调用审批流，并为 Codex 注册 Tools API MCP Server（复用 T012 的实现）。

---

## 范围

**做什么：**

**事件归一化（Codex Raw → do-what Protocol）：**
- `token_stream` → `EngineOutputEvent.token_stream`
- `plan_node` → `EngineOutputEvent.plan_node`
- `diff` → `EngineOutputEvent.diff`
- `approval_request`（Codex 需要用户输入）→ `ToolExecutionEvent.requested` + 入队 ApprovalMachine
- `run_complete` → `RunLifecycleEvent.completed`
- `run_failed` → `RunLifecycleEvent.failed`
- 未知消息类型：`passthrough` 记录原始 JSON + warn log（不丢弃，不 crash）

**审批流：**
- Codex 发出 `approval_request` → Core ApprovalMachine 入队 → 等待用户操作
- 用户 approve/deny → 回传 Codex：`{type:"approval_response", approved: boolean, input?: string}`
- 超时（5 分钟）→ 自动 deny → 发送 cancel 到 Codex

**CodexAdapter（主类）：**
- `startRun(config)` → 调用 CodexProcessManager.spawn → 监听消息 → 归一化 → 发布到 EventBus
- `sendInput(runId, input)` → 通过 JSONL 通道发送 user_input
- `cancelRun(runId)` → 发送 cancel + 等待进程退出

**Tools API MCP Server（Codex 侧）：**
- 与 T012 相同的 10 个工具，但作为 Codex 工具调用的处理器（而非 Claude MCP）
- Codex 的工具调用通过 `approval_request` 事件携带 tool name + args，由 CodexAdapter 转发到 PolicyEngine

**不做什么：**
- 不重新实现工具执行逻辑（复用 T012 的 tool-handlers stub）

---

## 假设

- Codex 的 `approval_request` 格式（来自 T010 验证）：`{ type: 'approval_request', requestId: string, tool: string, args: object }`
- Codex 接受 `approval_response` 格式：`{ type: 'approval_response', requestId: string, approved: boolean, input?: string }`

---

## 文件清单

```
packages/engines/codex/src/event-normalizer.ts
packages/engines/codex/src/approval-handler.ts
packages/engines/codex/src/codex-adapter.ts
packages/engines/codex/src/__tests__/event-normalizer.test.ts
packages/engines/codex/src/__tests__/codex-adapter.test.ts
```

---

## 接口与 Schema 引用

- `EngineOutputEvent`, `ToolExecutionEvent`, `RunLifecycleEvent`（`@do-what/protocol`）：归一化输出类型
- `ApprovalMachine.enqueue()`（T008）：工具审批入队
- `ToolsApiSchemas.*`（`@do-what/protocol`）：Codex 工具调用的 schema 校验

---

## 实现步骤

1. 创建 `src/event-normalizer.ts`：`normalize(raw: unknown): BaseEvent | null` 工厂函数，处理所有已知消息类型
2. 创建 `src/approval-handler.ts`：监听 `ToolExecutionEvent.requested` → 入队 → 等待结果 → 回传 Codex
3. 创建 `src/codex-adapter.ts`：组合 ProcessManager + Normalizer + ApprovalHandler；实现 `startRun`, `sendInput`, `cancelRun`
4. 编写测试：用 fixture JSONL 驱动 normalizer，验证所有消息类型归一化正确；approval 超时流程测试

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/codex test
# 预期：event-normalizer + codex-adapter 测试通过

# 端到端验证（需真实 Codex CLI + Core）
pnpm --filter @do-what/core start &
TOKEN=$(cat ~/.do-what/run/session_token)
curl -N -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3847/events | \
  grep "EngineOutput" &
SSE_PID=$!

# 触发一个 Codex Run（通过 Core API，暂用 curl + dev endpoint）
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -d '{"engine":"codex","prompt":"echo hello world"}' \
  http://127.0.0.1:3847/_dev/start-run

sleep 5
# 预期：SSE 流中出现 EngineOutput.token_stream 事件

kill $SSE_PID
```

---

## 风险与降级策略

- **风险：** Codex 的 `approval_request` 格式与 T010 验证结果不一致（版本更新）
  - **降级：** 归一化器使用 zod `.passthrough()` + 宽松字段匹配（`requestId || id || request_id`），记录 warn 但不 crash
- **风险：** Codex 不支持 `approval_response` 的 deny 路径（不能拒绝工具调用）
  - **降级：** deny 时发送 `cancel` 中断整个 Run，并在事件日志中标注原因
