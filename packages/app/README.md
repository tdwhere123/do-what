# packages/app

`packages/app` 是 do-what 的业务前端（SolidJS + Vite）。

## 默认开发

```bash
pnpm --filter @do-what/ui dev
```

根命令 `pnpm dev` 会调用这里的开发服务。

## 关键脚本

- `dev`：本地开发
- `build`：生产构建
- `typecheck`：TypeScript 检查
- `test:health` / `test:sessions` / `test:e2e`：业务脚本测试

## 核心功能区块映射

- `session`：会话页与消息流
- `proto`：前端协议结构与事件消费
- `scheduled`：调度任务视图
- `soul`：记忆与上下文资产
- `skills`：技能管理页面
- `extensions`：扩展配置与管理

## 注意事项

- 本包是业务主链路入口，不依赖 router 才能运行。
- router 连接链路已从主线摘除，不作为前端能力入口。
- Settings 的 `Runtimes` 分页会调用桌面端统一状态接口并展示 `opencode/claude-code/codex` 的安装与登录状态。

## v0.8 完成记录 (2026-03-01)

- Web 安全 Tauri invoke fallback（`src/app/lib/tauri.ts`）
- 启动时 localStorage 迁移：`openwork.* → dowhat.*`
- Runtime 连接状态模块：`src/app/state/runtime-connection.ts`
- `sendPrompt` 无 runtime 连接时阻止发送
- 前端遗留别名已清除（`Openwork*` → `DoWhat*`）
- 系统通知文本全部汉化
- 默认浅色主题，暗色为暖棕方案



## v0.10 Update (2026-03-01)
- Composer placeholder updated to do-what branding.
- Dashboard broken Tailwind class fixed (navigation button sizing/alignment).
- Skills Hub no longer pulls a built-in repository by default; use Install from link or configure VITE_DOWHAT_HUB_*.
- Session branch/DAG widget removed; conversation flow no longer depends on project/parent-session linkage.
- OpenAI OAuth modal flow updated to manual completion with fallback method probing.
- Runtime availability UI now treats `opencode/claude-code/codex` with consistent installed-based gating.

