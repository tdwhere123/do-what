# do-what 改造总规划

> 基于 OpenWork 开源项目，改造为个人桌面 AI 控制台。
> 每个版本完成后在本目录新建 `vX.X-record.md` 记录实际改动和问题。

## 版本路线

| 版本 | 主题 | 状态 |
|------|------|------|
| v0.1 | 清理基线 | 待开始 |
| v0.2 | 多引擎（OpenCode / Claude Code / Codex） | 待开始 |
| v0.3 | 任务编排（线性 / 并行 / 迭代） | 待开始 |
| v0.4 | 两层记忆系统（Soul 升级） | 待开始 |
| v0.5 | UI 重设计 | 待开始 |

## 关键依赖关系

```
v0.1 → v0.2 → v0.3
              ↘ v0.4
v0.2 + v0.4 → v0.5
```

## 核心设计决策记录

### 多引擎策略
- OpenCode：现有路径（orchestrator / direct）
- Claude Code：本机 CLI 已登录，通过 `claude --serve` 模式暴露 HTTP
- Codex：OpenAI OAuth 账号登录，用额度，直接调用 OpenAI Responses API
- 每个 session 绑定一个引擎，引擎选择器在 Composer 底部

### Session DAG（右上角缩略图）
- 以项目为单位展示 session 依赖关系
- 节点 = session，连线 = 上下文依赖关系
- 放在主界面右上角，默认折叠为小图标
- 点击节点跳转 session，右键新建分支

### 两层记忆（Soul 升级）
- Core Memory：持久化，人格/偏好/项目知识（`~/.config/do-what/core-memory.json`）
- Working Memory：近期上下文，当前焦点，未完成线索（`~/.config/do-what/working-memory.json`）
- 多引擎共同读写同一份记忆
- 进化机制：显式反馈 + 隐式观察 + heartbeat 整合

### 已删除模块
- 自动更新（个人用不需要）
- OpenCode Router / identities（Telegram/Slack 连接器）
- plugins + mcp 合并为 extensions tab
- config tab 并入 settings

## 执行约定

- `pnpm typecheck` 必须在每个版本结束时通过
- UI Style Bible（`plans/ui-style-bible.md`）先由 Claude 起草，Codex 按 Bible 实施
- 待确认项在每个版本开始前确认
