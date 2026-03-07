# T011 · Claude 适配器：Hook Runner 独立进程 + 策略缓存 + 事件转发

**Epic:** E2 – Claude Engine Adapter
**依赖:** T010（协议验证通过）、T004（HookPolicyCacheSchema）、T009（hook-policy-cache.json 已生成）
**估算改动:** ~400 行

---

## 目标

实现 Hook Runner 作为一个极轻的独立进程（`packages/engines/claude/hook-runner.ts`），在 200ms 内从本地策略缓存完成 allow/deny 决策，同时异步将事件转发给 Core 的 Event Bus。

---

## 范围

**做什么：**
- Hook Runner 可执行脚本（Node.js，无需打包）：读取 stdin，输出 JSON 到 stdout
  - Claude hooks 通过 stdin 传入事件 JSON，通过 stdout 返回 `{ action: "allow" | "deny", feedback?: string }`
- 策略缓存：启动时读取 `~/.do-what/run/hook-policy-cache.json`（`HookPolicyCacheSchema`）
  - 缓存未命中或读取失败 → 默认 `"ask"`（安全降级，但要在 100ms 内向 Core 发请求）
  - 缓存热重载：监听文件变更（`fs.watch`）
- 决策流程（< 50ms）：
  1. Parse stdin JSON（`ToolExecutionEvent.requested` 格式）
  2. 从缓存查 `toolName` 对应规则
  3. 若 `"allow"` → stdout `{action:"allow"}` + 异步转发 Core
  4. 若 `"deny"` → stdout `{action:"deny", feedback:"Use do-what MCP tools instead"}` + 异步转发 Core
  5. 若 `"ask"` → stdout `{action:"allow"}` + 同步等待 Core 审批（最多 200ms，超时则 allow，避免 hook 卡死 Claude）
- 异步事件转发 Core：HTTP POST `http://127.0.0.1:$PORT/internal/hook-event`（携带 session_token）
- Core 需新增内部端点 `POST /internal/hook-event`（无需外部鉴权层，但验证来源 IP 为 127.0.0.1）
- Hook Runner 通过 `DOWHAT_PORT` + `DOWHAT_TOKEN` 环境变量知道 Core 地址和 token（Core 启动时注入到 Claude 的执行环境）
- Claude hooks 配置文件生成：`ClaudeHooksConfig` 对象 → 写入 `~/.do-what/claude-hooks.json`（Core 每次启动 Claude 时传递）

**不做什么：**
- 不实现 deny+reroute 的 MCP 提示（留 T012）
- 不处理 tool 执行（留 packages/tools）

---

## 假设

- Claude Code hooks 配置格式（来自 T010 验证）：`PreToolUse` 和 `PostToolUse` hook 通过 `--hooks-file` 指定
- Hook Runner 脚本路径固定：`~/.do-what/bin/hook-runner.js`（Core 启动时软链到 npm 包产物）
- "ask" 决策的 200ms 超时内，Core 快速检查有无 override 规则（非完整审批流程），超时则 allow

---

## 文件清单

```
packages/engines/claude/src/hook-runner.ts         ← Hook Runner 主脚本
packages/engines/claude/src/policy-cache.ts        ← 策略缓存读取 + 热重载
packages/engines/claude/src/core-forwarder.ts      ← 异步转发事件到 Core
packages/engines/claude/src/hooks-config.ts        ← 生成 claude-hooks.json
packages/engines/claude/src/index.ts
packages/core/src/server/internal-routes.ts        ← POST /internal/hook-event 端点
packages/engines/claude/src/__tests__/hook-runner.test.ts
packages/engines/claude/src/__tests__/policy-cache.test.ts
```

---

## 接口与 Schema 引用

- `HookPolicyCacheSchema`（`@do-what/protocol`）：策略缓存读取
- `ToolExecutionEvent`（`@do-what/protocol`）：stdin 事件解析 + 转发给 Core 的事件格式
- `BaseEvent`（`@do-what/protocol`）：转发时的包装格式

---

## 实现步骤

1. 创建 `src/policy-cache.ts`：读取 `hook-policy-cache.json` + `fs.watch` 热重载 + `evaluate(toolName, args): 'allow'|'deny'|'ask'` 方法
2. 创建 `src/core-forwarder.ts`：`forward(event, port, token)` → 异步 HTTP POST，失败时写本地 error log（不影响主流程）
3. 创建 `src/hook-runner.ts`：读 stdin → zod parse → 策略决策 → 写 stdout → 异步 forward
4. 创建 `src/hooks-config.ts`：`generateHooksConfig(hookRunnerPath, env)` → 生成 Claude hooks JSON 格式
5. 在 Core 的 `src/server/internal-routes.ts` 添加 `POST /internal/hook-event`：接收事件 → 发布到 EventBus
6. 编写 Hook Runner 测试：mock stdin/stdout，验证 allow/deny/ask 三路决策；策略缓存热重载测试
7. 性能测试：1000 次决策循环，平均延迟 < 5ms（纯缓存路径）

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/claude test
# 预期：hook-runner 和 policy-cache 测试通过

# 端到端验证（需 Core 已启动）
pnpm --filter @do-what/core start &
CORE_PID=$!
sleep 1

# 模拟 Claude 触发 hook（通过 stdin）
echo '{"tool":"Bash","args":{"command":"ls"}}' | \
  DOWHAT_PORT=3847 DOWHAT_TOKEN=$(cat ~/.do-what/run/session_token) \
  node packages/engines/claude/dist/hook-runner.js

# 预期输出（stdout）：{"action":"deny","feedback":"Use do-what MCP tools instead"}
# （因为 tools.shell_exec 默认 deny Bash）

# 验证 Core SSE 收到事件
TOKEN=$(cat ~/.do-what/run/session_token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3847/state" | grep "hook_runner"

kill $CORE_PID
```

---

## 风险与降级策略

- **风险：** Claude 的 hook 调用超时（< 200ms）导致 Hook Runner 还没完成响应
  - **降级：** 若检测到接近超时（通过 `Date.now()` 监控），立即输出 `allow`（不拒绝，避免 Claude 卡死），同时异步通知 Core 审计
- **风险：** Hook Runner 进程崩溃（如内存耗尽）
  - **降级：** Claude hooks 配置中设置 `on_error: "allow"`（若 Claude 支持），退化为 Claude 原生执行；Core 通过检测 forward 失败次数触发警告
