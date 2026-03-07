# T012 · Claude 适配器：deny+reroute + AgentStuckException + MCP Server 注册

**Epic:** E2 – Claude Engine Adapter
**依赖:** T011（Hook Runner）、T008（RunMachine，AgentStuckException 触发）、T003（Tools API MCP Schema）
**估算改动:** ~500 行

---

## 目标

实现 Claude 适配器的完整运行时集成：deny+reroute 提示逻辑（引导 Claude 使用 do-what MCP 工具）、AgentStuckException 检测、以及 Tools API MCP Server 的注册与服务（作为 Claude 可调用的本地 MCP server）。

---

## 范围

**做什么：**

**ClaudeAdapter（核心类）：**
- `startRun(config)` → 构建 Claude 启动参数（`--hooks-file`, `--mcp-server`, `CLAUDE.md` 路径）→ 创建 RunMachine actor → spawn `claude` 进程
- Claude 进程管理：监听退出/错误事件 → 通知 RunMachine（`COMPLETE` / `FAIL`）
- `CLAUDE.md` 生成：写入 do-what 的强制约束（"所有文件写入和命令执行必须通过 do-what tools"）

**deny+reroute 逻辑：**
- Hook Runner 的 deny 响应中附带 `feedback`："Use `tools.shell_exec` / `tools.file_write` via do-what MCP instead of native Bash/Write."
- `AgentStuckException` 检测（在 Core 的 RunMachine 中）：同一 runId + 同一 toolName 连续 deny 次数 >= `AGENT_STUCK_THRESHOLD`（默认 2 次针对被 deny 工具）→ RunMachine `INTERRUPT`

**Tools API MCP Server：**
- 作为本地 MCP server 运行（HTTP/stdio，配置在 Claude 的 MCP 配置中）
- 注册 T003 中定义的全部 10 个 Tools API tool（`tools.shell_exec` 等）
- 每个 tool 的 handler：
  1. 调用 Core Policy Engine `evaluate(toolName, args)`
  2. `allow` → 调用 `packages/tools` 的执行器（暂 stub：返回 mock 结果）
  3. `ask` → 入队 ApprovalMachine，等待结果（无超时约束，可安全等待 UI 审批）
  4. `deny` → 返回 MCP error response
- 发布 `ToolExecutionEvent`（requested → approved/denied → executing → completed）

**不做什么：**
- 不实现实际工具执行（file/shell/git 的具体逻辑留 packages/tools）
- 不实现 UI 审批界面

---

## 假设

- MCP Server 使用 `@modelcontextprotocol/sdk`（官方 SDK）
- MCP Server 以 HTTP+SSE 模式运行（Claude Code 支持 HTTP MCP server），端口 `DOWHAT_MCP_PORT`（默认 3848）
- `CLAUDE.md` 写入 workspace 根目录（`.dowhat/CLAUDE.md`），Claude 启动时通过 `--system-prompt-file` 传入（若支持）或直接写工作区
- `claude` 进程由 Core 通过 Windows Job Object 管理（调用 `packages/tools` 的进程管理工具）

---

## 文件清单

```
packages/engines/claude/src/claude-adapter.ts       ← ClaudeAdapter 主类
packages/engines/claude/src/claude-process.ts       ← claude 进程 spawn + 监听
packages/engines/claude/src/claude-md-generator.ts  ← CLAUDE.md 内容生成
packages/engines/claude/src/mcp-server.ts           ← Tools API MCP Server
packages/engines/claude/src/tool-handlers.ts        ← 10 个 tool 的 handler（stub）
packages/engines/claude/src/__tests__/claude-adapter.test.ts
packages/engines/claude/src/__tests__/mcp-server.test.ts
packages/engines/claude/package.json               ← 添加 @modelcontextprotocol/sdk
```

---

## 接口与 Schema 引用

- `ToolsApiSchemas.*`（`@do-what/protocol`）：MCP Server tool 注册
- `ToolExecutionEvent`（`@do-what/protocol`）：发布工具生命周期事件
- `RunLifecycleEvent`（`@do-what/protocol`）：RunMachine 状态变更触发
- `RunMachine.send('INTERRUPT', {reason: 'agent_stuck'})`（T008）：AgentStuckException

---

## 实现步骤

1. 创建 `src/claude-md-generator.ts`：生成 do-what 约束 CLAUDE.md 内容（含工具清单和禁止规则）
2. 创建 `src/claude-process.ts`：`ClaudeProcess`，spawn `claude` 进程 + 监听 stdout/stderr + 触发 RunMachine 事件
3. 创建 `src/mcp-server.ts`：启动 MCP HTTP server，注册 10 个 Tools API tool（调用 `tool-handlers.ts`）
4. 创建 `src/tool-handlers.ts`：每个 tool handler 骨架（接收 MCP call → 调用 PolicyEngine → 发布事件 → 返回 stub result）
5. 创建 `src/claude-adapter.ts`：`startRun()` 组合上述组件；`AgentStuckDetector` 计数并触发 RunMachine INTERRUPT
6. 编写测试：mock Claude 进程退出场景；MCP server tool 调用 + Policy deny 流程；AgentStuckException 触发

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/claude test
# 预期：claude-adapter + mcp-server 测试通过

# MCP Server smoke test（需 Core 已启动）
pnpm --filter @do-what/core start &
CORE_PID=$!

# 启动 MCP Server
pnpm --filter @do-what/claude start-mcp &
MCP_PID=$!
sleep 1

# 列出 MCP tools
curl -s http://127.0.0.1:3848/tools | jq '.tools[].name'
# 预期：["tools.file_read","tools.file_write","tools.file_patch",
#         "tools.shell_exec","tools.git_apply","tools.git_status",
#         "tools.git_diff","tools.web_fetch","tools.docker_run","tools.wsl_exec"]

# 调用被 deny 的工具（shell_exec 默认 ask）
TOKEN=$(cat ~/.do-what/run/session_token)
curl -s -X POST http://127.0.0.1:3848/call \
  -H "Content-Type: application/json" \
  -d '{"name":"tools.shell_exec","arguments":{"command":"ls"}}'
# 预期：返回 MCP error 或 pending approval response

kill $MCP_PID $CORE_PID
```

---

## 风险与降级策略

- **风险：** Claude Code 版本更新后不支持某些 MCP server 配置格式
  - **降级：** 遵循 T010 验证报告中确认的格式；在 MCP server 启动时打印版本信息；适配器版本与 Claude CLI 版本绑定在 `engines` 字段
- **风险：** deny+reroute 成功率不稳定（Claude 不总是切换到 MCP 工具）
  - **降级：** 按方案 4.1：以路径 A（allow + UI 镜像）为主，路径 B（deny+reroute）作为严格模式，通过 policy.json 配置切换
