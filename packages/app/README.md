# @different-ai/openwork-ui

`packages/app` 是 do-what 的前端业务层（SolidJS + Vite）。

## 1. 核心职责

1. 会话 UI（消息列表、输入框、模型/运行时选择）
2. 工作区切换与基础设置
3. `scheduled/soul/extensions/proto` 业务入口与页面
4. 与 Tauri 命令桥和 openwork server API 的前端接线

## 2. 关键入口

- `src/app/app.tsx`: 全局状态与会话发送主链路
- `src/app/pages/session.tsx`: 会话页面主容器
- `src/app/components/session/composer.tsx`: 输入框与 runtime 选择
- `src/app/lib/tauri.ts`: Tauri invoke 封装

## 3. Runtime 发送逻辑（v0.6）

会话发送在 `app.tsx -> sendPrompt()`：
1. `opencode`: 走 OpenCode session API（原主链）
2. `claude-code` / `codex`: 走 Tauri `agent_run_start` 本地 CLI 执行

本地 runtime 输出在 Session 页面中的 `Local Runtime Output` 区域渲染。

## 4. 开发命令

```bash
pnpm --filter @different-ai/openwork-ui dev
pnpm --filter @different-ai/openwork-ui typecheck
pnpm --filter @different-ai/openwork-ui build
```
