# T009 · Core: Policy Engine 骨架

**Epic:** E1 – Core Skeleton
**依赖:** T004（PolicyConfigSchema）、T007（DB schema，approval_queue）、T008（ApprovalMachine）
**估算改动:** ~300 行

---

## 目标

实现 Policy Engine：读取 `~/.do-what/policy.json`（用 `PolicyConfigSchema` 校验），对工具调用请求做 `auto-allow / ask-user / deny` 三路判定，并将 `ask-user` 请求入队到 ApprovalMachine。同时生成 `hook-policy-cache.json` 供 Hook Runner 使用。

---

## 范围

**做什么：**
- `PolicyEngine` 类：
  - `load(path)` / `reload()`：读取并校验 policy.json，失败时回退到 DEFAULT_POLICY
  - `evaluate(toolName, args, context): PolicyDecision`：
    - 查匹配规则（精确工具名 → default 字段）
    - Path 规则：`file_read`/`file_write`/`file_patch` 的路径白名单/黑名单匹配（glob 模式）
    - Command 规则：`shell_exec` 的命令前缀匹配
    - Domain 规则：`web_fetch` 的域名白名单
  - `PolicyDecision`：`{ result: 'allow' | 'ask' | 'deny', reason: string }`
- `ask` 决策 → 调用 `ApprovalMachine` 入队
- `deny` 决策 → 直接返回 `ToolExecutionEvent.denied`
- `allow` 决策 → 直接返回 `ToolExecutionEvent.approved`
- 写 `hook-policy-cache.json`：Core 启动时 + 每次 policy.json 变更后，刷新缓存文件（`HookPolicyCacheSchema` 格式）
- 文件监听：`fs.watch(policyPath)` 监听 policy.json 变更，触发 reload + 缓存刷新

**不做什么：**
- 不实现 UI 审批界面（留 app 包）
- 不实现工具执行（留 packages/tools）
- 不实现 Hook Runner（留 T011）

---

## 假设

- policy.json 路径：`~/.do-what/policy.json`；若不存在，自动从 `DEFAULT_POLICY` 生成初始文件
- `hook-policy-cache.json` 路径：`~/.do-what/run/hook-policy-cache.json`
- Path 白名单/黑名单匹配使用 `micromatch`（轻量 glob 库）
- `<workspace>` token 在匹配前替换为当前活跃 workspace 的根路径
- 超时审批：ApprovalMachine 超时后 PolicyEngine 收到 `deny` 回调，发布 `ToolExecutionEvent.denied`

---

## 文件清单

```
packages/core/src/policy/policy-engine.ts
packages/core/src/policy/decision.ts          ← PolicyDecision type + reason 常量
packages/core/src/policy/cache-writer.ts      ← 写 hook-policy-cache.json
packages/core/src/policy/path-matcher.ts      ← glob 路径/命令/域名匹配工具
packages/core/src/policy/index.ts
packages/core/src/__tests__/policy-engine.test.ts
packages/core/package.json                   ← 添加 micromatch 依赖
```

---

## 接口与 Schema 引用

- `PolicyConfigSchema, DEFAULT_POLICY`（`@do-what/protocol`）：加载和校验 policy.json
- `HookPolicyCacheSchema`（`@do-what/protocol`）：写 hook-policy-cache.json
- `ToolExecutionEvent`（`@do-what/protocol`）：审批结果发布的事件类型
- `ApprovalMachine`（T008）：`enqueue(item)` 入口

---

## 实现步骤

1. `packages/core/package.json` 添加 `micromatch`
2. 创建 `src/policy/path-matcher.ts`：`matchPath(pattern, path)`, `matchCommand(allowList, command)`, `matchDomain(allowList, url)` 工具函数
3. 创建 `src/policy/decision.ts`：`PolicyDecision` type + `DENY_REASONS` / `ALLOW_REASONS` 常量
4. 创建 `src/policy/cache-writer.ts`：`writePolicyCache(policy: PolicyConfig, path: string)`，序列化为 `HookPolicyCacheSchema` 格式
5. 创建 `src/policy/policy-engine.ts`：
   - `load()` + `reload()` + `watch()` 实现
   - `evaluate(toolName, args, context): PolicyDecision` 三路判定
   - `askUser(toolName, args, runId): Promise<PolicyDecision>` → 调用 ApprovalMachine.enqueue → 等待结果
6. 集成到 Core 启动序列（在 T005 的 `http.ts` 启动后初始化 PolicyEngine）
7. 编写测试：各路径/命令/域名规则的匹配测试；mock ApprovalMachine 测试 ask-user 流程

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/core test -- --testNamePattern policy
# 预期：所有规则匹配测试通过

# 验证 policy cache 生成
pnpm --filter @do-what/core start &
CORE_PID=$!
sleep 2
cat ~/.do-what/run/hook-policy-cache.json | head -20
# 预期：JSON 文件存在，包含 version/updatedAt/rules 字段

# 验证默认 policy.json 生成
cat ~/.do-what/policy.json | grep '"tools.shell_exec"'
# 预期：包含 shell_exec 的 "ask" 默认值

kill $CORE_PID
```

---

## 风险与降级策略

- **风险：** `micromatch` 的 glob 语法与用户配置的 `allow_paths` 模式不兼容（如 Windows 路径分隔符）
  - **降级：** 路径规范化：匹配前将 `\` 替换为 `/`；在文档中明确 allow_paths 使用正斜杠
- **风险：** `fs.watch` 在 Windows 上对网络驱动器或某些目录不触发事件
  - **降级：** 补充 30 秒定时轮询 policy.json 的 mtime，作为 watch 的双保险
