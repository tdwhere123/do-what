# C001 — 修复默认 transport：HTTP 优先，Core 未运行时展示明确提示

**优先级：** P0（必须，封版阻塞项）
**涉及包：** `packages/app`
**不得改动：** `packages/core`、`packages/protocol`、任何后端包

---

## 背景

当前 `packages/app/src/lib/runtime/runtime-config.ts` 的 `readTransportMode` 函数：
```typescript
function readTransportMode(value: string | undefined): CoreTransportMode {
  return value === 'http' ? 'http' : 'mock';  // ← 默认 mock
}
```

这导致 `pnpm dev:app` 启动后默认进入 mock 模式，用户看到假数据却以为已连接真实 Core。
封版要求：默认走 HTTP，连不上 Core 时展示清晰的"Core 未运行"状态，不静默走 mock。

---

## 目标

1. `runtime-config.ts`：默认 transport 改为 `http`（无环境变量时）
2. App 启动后若 Core 不可达，展示独立的 `CoreOfflineScreen` 组件（带启动命令提示），不渲染 Workbench
3. Core 恢复后 App 自动重连（复用现有 reconnect 逻辑）
4. Mock 模式保留，通过 URL 参数 `?transport=mock` 或环境变量 `VITE_CORE_TRANSPORT=mock` 显式开启（用于测试/开发调试）

---

## 文件清单（只改这些文件）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/app/src/lib/runtime/runtime-config.ts` | 修改 | `readTransportMode` 默认值改为 `'http'` |
| `packages/app/src/app/core-offline-screen.tsx` | 新增 | "Core 未运行"展示组件 |
| `packages/app/src/app/App.tsx` 或 bootstrap 文件 | 修改 | 在连接状态为 `disconnected` + transport=http 时渲染 `CoreOfflineScreen` |

---

## 实现要点

### 1. runtime-config.ts 改动

```typescript
// 改前
function readTransportMode(value: string | undefined): CoreTransportMode {
  return value === 'http' ? 'http' : 'mock';
}

// 改后
function readTransportMode(value: string | undefined): CoreTransportMode {
  return value === 'mock' ? 'mock' : 'http';
}
```

### 2. CoreOfflineScreen 组件

- 纯展示，无状态
- 内容：标题"Core 未运行"、说明文字、启动命令 `pnpm dev:core`（代码块格式）
- 不需要自动重试按钮（依赖 SSE 重连机制即可）
- 样式：居中布局，与 `WorkbenchEmptyState` 风格一致

### 3. App.tsx / bootstrap 中的接入逻辑

检查时机：App 初始化时发起健康检查（`GET /health`），若失败则渲染 `CoreOfflineScreen`。
复用已有的连接状态：`CoreSessionGuard.getConnectionState()` 返回 `'disconnected'` 时展示离线屏。

**注意：** 不要在这里引入新的轮询逻辑。SSE 客户端已有重连机制，Core 上线后会自动重连。离线屏只需要监听 connectionState 从 `disconnected` 变为 `connected`/`reconnecting` 即可撤掉。

---

## 验收标准（DoD）

1. `pnpm dev:app`（Core 未运行）→ UI 展示 `CoreOfflineScreen`，看到"Core 未运行"和 `pnpm dev:core` 命令
2. `pnpm dev:app`（Core 已运行）→ 正常进入 Workbench，无额外 banner
3. `pnpm dev:app?transport=mock` → 进入 mock 模式（数据为 mock fixtures），不展示离线屏
4. `pnpm -w typecheck` 无新增类型错误
5. `pnpm --filter @do-what/app test` 通过（不能因为默认值变更导致现有测试失败）

**如果现有测试依赖 mock 模式作为默认值，需修复测试中的显式参数，不能改回默认值。**

---

## 完成后更新

- [ ] `docs/archive/v0.1-closure/closure-overview.md` 中 C001 状态改为"已完成"
- [ ] `AGENTS.md` 当前阶段任务进度更新
