# T005 · Core: HTTP Server + SSE + session_token 鉴权

**Epic:** E1 – Core Skeleton
**依赖:** T002, T003（需要 BaseEvent 类型）
**估算改动:** ~300 行

---

## 目标

在 `packages/core` 中启动一个绑定 `127.0.0.1` 的 Fastify HTTP server，实现 SSE 事件推送端点，并强制 `Authorization: Bearer <token>` 鉴权（session_token 在启动时生成，写入 `~/.do-what/run/session_token`，权限 600）。

---

## 范围

**做什么：**
- Fastify server 监听 `127.0.0.1:3847`（端口可通过环境变量 `DOWHAT_PORT` 覆盖）
- `GET /events`：SSE 端点，返回 `Content-Type: text/event-stream`，推送 `BaseEvent` 格式事件
- `GET /health`：无鉴权，返回 `{ ok: true, version: string, uptime: number }`
- `GET /state`：需鉴权，返回当前 State Snapshot（暂时返回空对象 `{}`，供后续 T007/T008 填充）
- 鉴权中间件：所有路由（除 `/health`）需 `Authorization: Bearer <token>`，失败返回 401 + 审计日志
- session_token 生成：`crypto.randomBytes(32).toString('hex')`（256-bit），写入 `~/.do-what/run/session_token`，Windows 下用 `fs.chmodSync` 设置权限（Linux/Mac 600，Windows 记录 ACL 设置建议）
- 优雅关闭：SIGTERM/SIGINT 时关闭所有 SSE 连接 + 停止 server

**不做什么：**
- 不实现 WebSocket（本版用 SSE）
- 不实现 Event Bus（留 T006）
- 不处理 Run 路由（留后续）

---

## 假设

- 端口固定 3847（`do-what` ASCII 之和，助记）；如端口被占用，尝试 3848-3850，再失败则报错退出
- `~/.do-what/` 目录若不存在，Core 启动时自动创建（`run/`, `state/` 等子目录）
- Windows 下 `fs.chmodSync` 不报错但不生效，需额外调用 `icacls`（通过 child_process spawn）设置 ACL

---

## 文件清单

```
packages/core/src/server/http.ts           ← Fastify server 创建与配置
packages/core/src/server/sse.ts            ← SSE 管理器（订阅/广播/断线清理）
packages/core/src/server/auth.ts           ← session_token 生成、读取、中间件
packages/core/src/server/routes.ts         ← /health, /events, /state 路由
packages/core/src/server/index.ts
packages/core/src/config.ts               ← 端口、路径等配置常量
packages/core/src/__tests__/server.test.ts ← HTTP/SSE/auth 集成测试
packages/core/package.json                ← 添加 fastify 依赖
```

---

## 接口与 Schema 引用

- `BaseEvent`（`@do-what/protocol`）：SSE 广播时的事件格式
- `SystemHealthEvent.engine_connect` — `/health` 端点触发

---

## 实现步骤

1. `packages/core/package.json` 添加：`fastify`, `@fastify/cors`, `@do-what/protocol`
2. 创建 `src/config.ts`：导出 `PORT`, `HOST`, `SESSION_TOKEN_PATH`, `STATE_DIR`, `RUN_DIR` 常量
3. 创建 `src/server/auth.ts`：`generateAndSaveToken()`, `loadToken()`, `authMiddleware()`
4. 创建 `src/server/sse.ts`：`SseManager` 类，维护连接 Map，`broadcast(event: BaseEvent)`, `close()`
5. 创建 `src/server/routes.ts`：注册 `/health`、`/events`（SSE 握手 + 连接注册）、`/state`
6. 创建 `src/server/http.ts`：组合 Fastify 实例 + 注册插件 + 挂载路由
7. 编写集成测试：验证无 token 401、有效 token 200、SSE 握手成功、优雅关闭

---

## DoD + 验收命令

```bash
# 启动 Core（后台）
pnpm --filter @do-what/core start &
CORE_PID=$!

# 等待启动
sleep 1

# 验证健康检查（无需 token）
curl -s http://127.0.0.1:3847/health | grep '"ok":true'

# 验证鉴权（无 token 应返回 401）
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3847/state
# 预期输出：401

# 验证带 token 可访问
TOKEN=$(cat ~/.do-what/run/session_token)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3847/state
# 预期输出：{}

# 验证 SSE 连接
curl -N -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3847/events &
SSE_PID=$!
sleep 2
kill $SSE_PID

# 单元测试
pnpm --filter @do-what/core test

# 清理
kill $CORE_PID
```

---

## 风险与降级策略

- **风险：** Windows 上 `fs.chmodSync` 不能实际限制文件权限
  - **降级：** 调用 `icacls ~/.do-what/run/session_token /inheritance:r /grant:r "%USERNAME%:R"` 设置 ACL；若 icacls 失败，记录 warning 日志但不阻塞启动
- **风险：** 端口冲突（3847 已被占用）
  - **降级：** 自动尝试 3848-3850；全部失败则启动失败 + 明确错误信息，提示用户设置 `DOWHAT_PORT` 环境变量
