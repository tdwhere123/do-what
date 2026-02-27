# do-what 版本历史（v0.1 ~ v0.5）

> 本文件整合了 v0.1~v0.5 的规格（spec）与执行记录（record/recond）。
> 当前活跃设计规范见：`ui-style-bible.md`、`codebase-map.md`。

---

## 总规划

### 版本路线

| 版本 | 主题 | 状态 |
|------|------|------|
| v0.1 | 清理基线（删除更新器、Router、合并 tab） | ✅ 完成 |
| v0.2 | 多引擎（OpenCode / Claude Code / Codex 并行） | ✅ 完成 |
| v0.3 | 任务编排（Project 容器 + Session DAG） | ✅ 完成 |
| v0.4 | 两层记忆系统（Soul 升级） | ✅ 完成 |
| v0.5 | UI 重设计（暖米色调 + DAG 组件） | ✅ 完成（基础落地） |

### 依赖关系
```
v0.1 → v0.2 → v0.3
              ↘ v0.4
v0.2 + v0.4 → v0.5
```

### 核心设计决策

**多引擎策略**
- OpenCode：现有路径（orchestrator / direct HTTP）
- Claude Code：`claude -p "prompt" --output-format stream-json` CLI
- Codex：`codex "prompt"` CLI，或 fallback OpenAI Responses API
- 每个 session 绑定一个引擎，选择器在 Composer 底部

**Session DAG**
- 以 Project 为单位展示 session 依赖关系（`parentSessionIds[]`）
- 主界面右上角，默认折叠为 `◆ N sessions`，展开为 280×200px 浮层

**两层记忆**
- 系统记忆：`~/.config/do-what/shared/system.md`（全局注入 prompt 前缀）
- 项目记忆：`<workdir>/AGENTS.md`（工具自动读取）

**已删除模块**
- 自动更新（updater plugin）
- OpenCode Router（Telegram/Slack 连接器）
- identities tab
- plugins/mcp 合并为 extensions

---

## v0.1 — 清理基线

### 规格摘要

**目标**：删除冗余模块，保持最小可跑状态。

删除内容：
1. 自动更新模块（`@tauri-apps/plugin-updater`、`UpdateHandle` 类型、所有 update effect）
2. OpenCode Router 模块（`packages/opencode-router/`、`identities.tsx`、所有 `OpenworkOpenCodeRouter*` 类型）
3. Dashboard Tab 合并：保留 `scheduled / soul / skills / extensions / settings`

### 执行记录

**完成项**：
- 删除 `packages/app/src/app/context/updater.ts`
- 从 `package.json` 删除 `@tauri-apps/plugin-updater`
- 从 `tauri.conf.json` 删除 updater plugin；从 `Cargo.toml` 删除 `tauri-plugin-updater`
- 从 `lib.rs` 移除 `tauri_plugin_updater` 注册与 `updater_environment` 命令
- 删除 `packages/opencode-router/`（整个包）、`identities.tsx`
- 从 `pnpm-workspace.yaml` 排除 `packages/opencode-router`
- 从 `tauri.conf.json` 删除 `sidecars/opencode-router`
- 清理 `openwork-server.ts`：删除 `OpenworkOpenCodeRouter*` 类型和 Router 方法
- 清理 `tauri.ts`：删除 `OpenCodeRouterInfo` 和 `opencodeRouterInfo` 函数
- 清理 `commands/opencode_router.rs` 和 `opencode_router/` 目录
- Dashboard 收敛为 5 个 tab（新增 sessions 占位）

**验证**：`pnpm typecheck` ✅ / `pnpm dev:ui` 启动无报错 ✅

---

## v0.2 — 多引擎运行时

### 规格摘要

**目标**：Claude Code CLI 和 Codex CLI 作为并列引擎运行，App 启动进程、捕获 stdout、渲染结构化输出卡片。

**新增文件**：
- `packages/app/src/app/lib/agent-output-parser.ts`：RunEvent union + parseClaudeCodeChunk + parseCodexChunk + OutputBuffer（300ms debounce）
- `packages/app/src/app/lib/shared-config.ts`：SharedConfig / McpEntry 类型，rules.md 读写，buildPromptPrefix
- `packages/app/src/app/components/agent-run/`：7个卡片组件（text/tool-call/bash/file-write/code/error/done-banner）
- `packages/desktop/src-tauri/src/commands/agent_run.rs`：`agent_run_start`、`agent_run_abort`、`check_runtime_available`

**修改文件**：
- `state/sessions.ts`：新增 `AgentRun` 类型（runtime/type/status/events/projectId/parentSessionIds）和 store
- `lib/tauri.ts`：新增 `agentRunStart`、`agentRunAbort`、`checkRuntimeAvailable`
- `pages/settings.tsx`：新增 `runtimes` tab，显示引擎版本/状态
- `components/session/composer.tsx`：底部加运行时下拉选择器（OpenCode/CC/Codex）

**Tauri 命令**（`agent_run_start` 核心逻辑）：
```rust
// Claude Code: claude -p "prompt" --output-format stream-json [--cwd dir]
// Codex: codex "prompt" [--cwd dir]
// 读 stdout 行，emit 到前端 "agent-run-output/{run_id}"
```

### 执行记录

**完成项**：
- 新增 `agent-output-parser.ts`（RunEvent + 两个解析函数 + OutputBuffer）
- 新增 `shared-config.ts`（SharedConfig/McpEntry + 读写 + buildPromptPrefix）
- 新增 `components/agent-run/` 目录（8个文件，含 index.tsx）
- 修改 `state/sessions.ts`：AgentRun 类型 + agentRuns store + add/update/append 方法
- 修改 `lib/tauri.ts`：3个 IPC 封装函数
- 修改 `types.ts`：SettingsTab 增加 `"runtimes"`
- 修改 `settings.tsx`：Runtimes 子页（CC/Codex 状态卡片）
- 修改 `composer.tsx`：runtime 下拉 UI
- 新增 `commands/agent_run.rs`：3个 Tauri 命令 + RunMap
- 修改 `commands/mod.rs` 和 `lib.rs`：注册新命令

**未完成（留后续）**：
- Sidebar AgentRun 列表 + CC/CX badge 尚未接入
- Composer 非 OpenCode 发送链路未贯通（真正调用 agentRunStart）

**验证**：`pnpm typecheck` ✅（`cargo check` 因网络限制未完成）

---

## v0.3 — 项目任务编排

### 规格摘要

**目标**：Project 容器管理多个 session/run，侧边栏按 project 分组。

**核心模型**：
```
Project（项目容器，对应一个 workdir）
  └── Session / AgentRun（叶节点）
        parentSessionIds?: string[]   ← 依赖关系
        projectId?: string
```

**修改内容**：
- `state/sessions.ts`：新增 `Project` 类型 + project store（createProject / addSessionToProject）+ localStorage 持久化
- `lib/shared-config.ts`：新增 `buildContextPrefix(parentSessionIds)`（摘要拼接）
- `composer.tsx`：新增 project 选择器 + 前置 session 多选（chip 形式）
- `sidebar.tsx`：按 project 分组显示，可折叠
- `app.tsx`（sendPrompt）：自动注入父 session 摘要 + 建立 project 关联

### 执行记录

**完成项**：
- 新增 `Project` 类型和 store（含去重 + lastActiveAt 更新）
- 新增 `listAgentRunTextEvents` 用于摘要
- `buildContextPrefix`：从 agentRuns 提取文本，截断到 1000 chars，格式化输出
- Composer：project 下拉（含 "+ New project" 弹窗）+ 前置 session chip 多选
- Sidebar：Project 分组 + Quick Chats 分组，可折叠
- app.tsx sendPrompt：注入上下文前缀 + 自动建立 project 关联

**验证**：`pnpm typecheck` ✅ / `pnpm build:ui` ✅（有 chunk size 警告）

---

## v0.4 — 记忆系统

### 规格摘要

**目标**：两层记忆（系统 + 项目），Soul 页面升级为三段式编辑器。

| 层 | 文件路径 | 何时注入 |
|----|---------|---------|
| 系统记忆 | `~/.config/do-what/shared/system.md` | 每次 session 启动注入 prompt 前缀 |
| 项目记忆 | `<project_workdir>/AGENTS.md` | 工具自动读取（CC/Codex/OpenCode 均支持） |

**新增文件**：
- `lib/memory.ts`：readSystemMemory / writeSystemMemory / readProjectMemory / writeProjectMemory / buildSystemMemoryPrefix（截断 500 chars）
- `lib/memory-extractor.ts`：MemoryCandidate + extractMemoryCandidates（规则提取，不调 AI）
- `state/memory-candidates.ts`：useMemoryCandidates / addMemoryCandidates / dismissMemoryCandidate

**提取规则**：
- `file_write` → `*.json/*.toml/*.yaml` → project 候选
- `text` 含关键词（记住/always/never/prefer）→ system 候选
- `done.durationMs > 30000` → 提醒用户记录

**Soul 页面**（`pages/soul.tsx`）三段式：
1. 关于你（system.md 编辑器）
2. 当前项目（project 切换 + AGENTS.md 编辑器）
3. 待记录（候选列表 + 写入/忽略）

### 执行记录

**完成项**：
- 新增 `lib/memory.ts`（Tauri 环境用 invoke，Web 环境 localStorage 兜底）
- 修改 `lib/shared-config.ts`：buildPromptPrefix 注入 `<system_memory>` + `<rules>`
- 新增 `lib/memory-extractor.ts`（规则版提取）
- 新增 `state/memory-candidates.ts`
- 修改 `state/sessions.ts`：AgentRun 增加 `_memoryCandidatesExtracted` + 触发提取
- 重写 `pages/soul.tsx`：三段式编辑器
- 修改 `pages/dashboard.tsx`：SoulView 透传 workspaces/activeWorkspaceId

**验证**：`pnpm typecheck` ✅

---

## v0.5 — UI 重设计

### 规格摘要

**目标**：暖米色调极简三栏布局，session DAG 可视化，引擎徽章清晰。

**设计规范**：见 `ui-style-bible.md`（完整规范）

**新增文件**：
- `packages/app/src/app/styles/tokens.css`：全套 Design Token（背景/边框/文字/引擎徽章/间距/圆角/阴影）
- `packages/app/src/app/components/session-dag.tsx`：DAG 折叠浮层（折叠态 `◆ N sessions`，展开态 280×200px）

**修改文件**：
- `index.css`：引入 tokens.css + body 暖米色背景 + `--dls-*` 兼容映射 + `.runtime-badge` CSS
- `components/session/sidebar.tsx`：根容器改用 `bg-[var(--color-bg-sidebar)]`
- `pages/session.tsx`：引入 SessionDagWidget + 主内容区改为 `relative`

### 执行记录

**完成项**：
- 新增 `styles/tokens.css`（暖米色体系完整 token）
- 修改 `index.css`（@import + 兼容映射 + runtime-badge 样式）
- 新增 `components/session-dag.tsx`（折叠/展开 + project store 数据源 + parentSessionIds 缩进）
- 修改 `pages/session.tsx`（接入 SessionDagWidget + activeProjectId 计算）
- 修改 `components/session/sidebar.tsx`（暖色背景 token）

**验证**：`pnpm typecheck` ✅ / `pnpm dev:ui` 启动 ✅

**备注**：v0.5 在 2026-02-27 因部分问题回滚后重新梳理。当前代码库包含以上完成项。后续 v0.5 延续改动需另起计划。

### v0.5 延续改动（2026-02-27）

**改动内容**：右侧栏视觉升级 + Favicon 修复 + 移动端中文标签

**文件列表**：
- `packages/app/index.html`：插入 SVG favicon（螺旋形）优先于 PNG 后备
- `packages/app/src/app/index.css`：追加 `@keyframes float-gentle`（轻浮动 + 微旋转，3.5s 周期）
- `packages/app/public/svg/organic/shape/star/Elements-organic-shape-star-wink.svg`：新增（从 UI/svg 复制）
- `packages/app/src/app/pages/dashboard.tsx`：
  - aside 加宽 `w-12→w-16`，按钮 `w-10→w-12`，图标 `w-5→w-6`
  - 顶部添加 star-wink 微动态装饰（float-gentle 动画）
  - 三组按钮之间加分隔线，tooltip 改中文
  - 底部藤蔓图标 `w-8→w-10`
  - 移动端 nav label：Sessions→会话 / Automations→自动化 / Soul→记忆 / Skills→技能 / Extensions→扩展 / Settings→设置
- `packages/app/src/app/pages/session.tsx`：
  - 同 dashboard.tsx aside 同规格升级（`w-12→w-16`，图标 `w-5→w-6`，分隔线，中文 tooltip）

**验证**：`pnpm typecheck` 需 0 errors
