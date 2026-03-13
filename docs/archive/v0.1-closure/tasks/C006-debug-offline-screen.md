# C006 — 诊断并修复 App 启动时离线屏卡死

**优先级：** P0（阻断封版）
**涉及文件：**
- `packages/app/src/app/core-services-bootstrap.tsx`
- `packages/app/src/preload/preload.ts`
- `packages/app/src/lib/runtime/runtime-config.ts`
- `packages/app/src/lib/core-http-client/core-http-client.ts`
**不得改动：** `packages/core`、任何后端包

---

## 现象

1. `pnpm dev:core` 启动 Core（监听 127.0.0.1:3847）
2. Core 稳定运行后，`pnpm dev:app` 启动 App
3. App 展示「Core 未运行」离线屏，不自动恢复

---

## 已知背景

`core-services-bootstrap.tsx` 当前逻辑（`startHttpBootstrap`）：

1. 初次 `loadSnapshot()` → `getWorkbenchSnapshot()` 失败 → `isCoreReachable()` 检查 `/health`
2. `/health` 不通 → `setBootstrapOffline()` + 启动 3s 轮询定时器
3. 定时器触发 → `isCoreReachable()` → 若可达则重试 `loadSnapshot()`
4. SSE 'connected' 事件也触发重试

定时器逻辑已在文件中，但问题仍存在。需先诊断确认根因。

---

## 根因假说（按优先级验证）

### 假说 A — session token timing（最高优先）

- `preload.ts` 在 Electron **启动时一次性同步读取** `~/.do-what/run/session_token`
- Core 写入 token 约需 1-2s；若 preload 比 token 写入更早执行，读到 `null`
- `null` token → `getWorkbenchSnapshot()` 发 `Authorization: Bearer null` → Core 返回 401
- catch 块：`isCoreReachable()` 返回 `true`（Core 确实在跑）→ 走 `setBootstrapError()` 而非 `setBootstrapOffline()`
- 结果：**显示错误屏，定时器从未启动**

### 假说 B — 定时器重试时 token 仍为 null

- 即使定时器触发 `loadSnapshot()`，`services.config.sessionToken` 仍是启动时读到的 `null`
- Core 可达但每次重试都因 401 失败 → `setBootstrapError()` → 状态变 'error' → 定时器停止

### 假说 C — Electron CSP 阻断 fetch()

- 渲染进程向 `127.0.0.1:3847` 的 fetch 请求被 Electron 内容安全策略拦截
- `isCoreReachable()` 抛 security error（不是 ECONNREFUSED）→ 永远返回 false → 永久离线屏

---

## Codex 执行步骤

### 步骤 1：加诊断日志（必须先做，等人工确认日志后再继续）

在 `packages/app/src/app/core-services-bootstrap.tsx` 的 `loadSnapshot()` catch 块中，**在现有的 `isCoreReachable()` 调用前后**加日志：

```typescript
// catch 块开始处
console.debug('[bootstrap] loadSnapshot failed:', {
  errorName: error instanceof Error ? error.name : typeof error,
  errorMessage: error instanceof Error ? error.message : String(error),
  sessionToken: services.config.sessionToken ? '[有值]' : '[null]',
  baseUrl: services.config.baseUrl,
});
```

```typescript
// isCoreReachable() 调用后
const reachable = await isCoreReachable(services.config.baseUrl);
console.debug('[bootstrap] isCoreReachable:', reachable);
if (!reachable) {
  // ... 现有的 setBootstrapOffline() + startOfflineRetry()
}
```

在 `startOfflineRetry()` 定时器内加：

```typescript
console.debug('[bootstrap] offline retry tick, status:', useUiStore.getState().bootstrapStatus);
```

**注意：仅加日志，不改其他逻辑。提交后，人工在 Electron DevTools（Ctrl+Shift+I）Console 标签页查看输出，确认假说，再执行步骤 2。**

---

### 步骤 2（假说 A+B 成立时）：修复 token 刷新

目标：让重试路径能读到 Core 写入后的最新 token。

#### 2a. `packages/app/src/preload/preload.ts`

暴露 `readFreshSessionToken` 函数，供渲染进程在重试时调用：

```typescript
contextBridge.exposeInMainWorld('doWhatRuntime', {
  coreSessionToken: readCoreSessionToken(),
  coreSessionTokenPath: CORE_SESSION_TOKEN_PATH,
  readFreshSessionToken: () => readCoreSessionToken(),  // 新增：动态读取
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
```

#### 2b. 更新 `doWhatRuntime` 的 TypeScript 类型声明

找到 `window.doWhatRuntime` 的类型声明文件（可能在 `packages/app/src/types/electron.d.ts` 或 `packages/app/src/global.d.ts`），在 `DoWhatRuntime` 接口中加：

```typescript
readFreshSessionToken?: () => string | null;
```

#### 2c. `packages/app/src/lib/runtime/runtime-config.ts`

`RuntimeCoreConfig` 中加 `readFreshSessionToken` 字段，`getRuntimeCoreConfig()` 填充：

```typescript
export interface RuntimeCoreConfig {
  // ... 现有字段
  readonly readFreshSessionToken: (() => string | null) | null;
}

// getRuntimeCoreConfig() 中
return {
  // ... 现有字段
  readFreshSessionToken: window.doWhatRuntime?.readFreshSessionToken ?? null,
};
```

#### 2d. `packages/app/src/lib/core-http-client/core-http-client.ts`

让 `CoreHttpClientOptions.sessionToken` 支持 getter 形式，使 token 可动态更新（方案 B1）：

```typescript
export interface CoreHttpClientOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
  // 改为支持 getter，允许运行时刷新
  readonly sessionToken?: string | null | (() => string | null);
}
```

在 `request()` 函数内读取 token 时：

```typescript
const token = typeof options.sessionToken === 'function'
  ? options.sessionToken()
  : options.sessionToken;
const authHeaders = createCoreAuthHeaders(token);
```

#### 2e. `packages/app/src/app/core-services-bootstrap.tsx`

在 `startOfflineRetry()` 触发 `loadSnapshot()` 前刷新 token（通过 getter 自动生效，无需额外代码，前提是 2d 中 CoreHttpClient 已支持 getter）。

若 `app-services.ts` 在初始化 client 时传入的是固定值而非 getter，则需修改 `app-services.ts` 将 `sessionToken` 改为 `() => services.config.readFreshSessionToken?.() ?? services.config.sessionToken`。

---

### 步骤 3（假说 C 成立时）：检查 Electron 安全配置

检查 `packages/app/src/main/` 中创建 BrowserWindow 的代码，找到 `webPreferences` 和 CSP 设置：

- 确认 `webSecurity` 未被设为 `false`（若为 false 则有其他问题）
- 确认 CSP 的 `Content-Security-Policy` header 包含 `connect-src http://127.0.0.1:3847`
- 或在 `webPreferences` 中将 `allowRunningInsecureContent` 设为合适值

---

## 文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/app/src/app/core-services-bootstrap.tsx` | 修改 | 步骤 1 加诊断日志；步骤 2 修复重试时 token 刷新 |
| `packages/app/src/preload/preload.ts` | 修改 | 步骤 2a：暴露 `readFreshSessionToken` 函数 |
| `packages/app/src/types/electron.d.ts`（或同类声明文件） | 修改 | 步骤 2b：更新类型声明 |
| `packages/app/src/lib/runtime/runtime-config.ts` | 修改 | 步骤 2c：添加 `readFreshSessionToken` 字段 |
| `packages/app/src/lib/core-http-client/core-http-client.ts` | 修改 | 步骤 2d：支持 getter 形式的 sessionToken |

---

## 验收标准（DoD）

1. `pnpm dev:core` 启动（等 3s 让 Core 稳定），再 `pnpm dev:app` → App 正常进入 Workbench，**不显示离线屏**
2. `pnpm dev:app`（Core 未启动）→ 显示离线屏；此时 `pnpm dev:core` 启动，3s 内 App **自动恢复**进入 Workbench
3. `pnpm --filter @do-what/app typecheck` 无新增类型错误
4. `pnpm --filter @do-what/app test` 通过
5. DevTools console 无 401 / `Bearer null` 相关 error

---

## 完成后更新

- [ ] `docs/archive/v0.1-closure/closure-overview.md` 中 C006 状态改为「已完成」
- [ ] `AGENTS.md` 当前阶段任务进度更新
- [ ] 移除步骤 1 中加的临时诊断日志（`console.debug('[bootstrap] ...')`）
