# C003 — README 快速开始精确化

**优先级：** P1（应该，封版质量）
**依赖：** C001 完成后执行（默认 transport 改变后，启动流程才稳定）
**涉及文件：** `README.md`
**不得改动：** 任何代码文件

---

## 背景

README 的快速开始章节需要反映 C001 之后的真实启动流程：
- App 默认连接 Core（HTTP 模式）
- 需要两个终端分别启动 Core 和 App
- Mock 模式存在但需要显式开启

同时需要明确列出 v0.1 已知限制，避免用户误解。

---

## 目标

更新 `README.md` 的以下内容（不新增章节，只精确化现有内容）：

1. **快速开始** — 改为两终端流程，使用新的快捷脚本
2. **已知限制** — 明确列出 3 项
3. **引擎接入（高级）** — 说明手动启动引擎适配器的方式

---

## README 变更规格

### 快速开始章节

替换为以下两步流程（保留已有的 `pnpm install` 前置步骤）：

```markdown
## 快速开始

### 前置条件

- Node.js ≥ 20
- pnpm 10.x（`npm install -g pnpm`）

### 安装

\`\`\`bash
pnpm install
pnpm -w build
\`\`\`

### 启动（需要两个终端）

**终端 1 — 启动 Core daemon：**
\`\`\`bash
pnpm dev:core
# Core 监听 127.0.0.1:3847，token 写入 ~/.do-what/run/session_token
\`\`\`

**终端 2 — 启动 UI：**
\`\`\`bash
pnpm dev:app
# Electron 窗口打开后自动连接 Core
\`\`\`

> **注意：** Core 必须先于 UI 启动。若 Core 未运行，UI 会展示"Core 未运行"提示页面。

### 开发调试（Mock 模式）

不启动 Core，仅验证 UI 组件：
\`\`\`bash
# URL 参数方式（在 Electron 开发窗口地址栏加参数）
pnpm dev:app   # 然后在地址栏加 ?transport=mock
# 或通过环境变量
VITE_CORE_TRANSPORT=mock pnpm dev:app
\`\`\`
```

### 已知限制章节（新增或更新）

```markdown
## v0.1 已知限制

| 限制 | 说明 | 计划版本 |
|------|------|---------|
| Settings 不持久化 | 设置在重启后恢复默认值，不保存到磁盘 | v0.2 |
| 引擎需手动启动 | Create Run 不自动拉起 Claude/Codex 引擎，需手动启动适配器（见下方） | v0.2 |
| 部分 Inspector 操作不可用 | Memory pin/edit/supersede、Drift resolution、Integration gate decision 为 v0.2 功能 | v0.2 |
```

### 引擎接入章节（新增）

```markdown
## 引擎接入（高级）

v0.1 的引擎适配器已实现，但需要手动启动。Core 不会自动拉起引擎进程。

**Claude Code 适配器：**
\`\`\`bash
# 需先构建
pnpm --filter @do-what/claude build
# 然后在 Claude Code 的 settings 中配置 hooks 指向 hook-runner
\`\`\`

**Codex 适配器：**
\`\`\`bash
pnpm --filter @do-what/codex build
# 详见 packages/engines/codex/README.md（待补充）
\`\`\`

> 完整的引擎自动注册和生命周期管理将在 v0.2 中实现。
```

---

## 验收标准（DoD）

1. `README.md` 快速开始章节包含两终端启动流程，命令使用 `pnpm dev:core` 和 `pnpm dev:app`
2. "已知限制"章节存在，包含 Settings/Engine/Inspector 三项
3. 引擎接入章节存在，说明手动启动方式
4. 从零按 README 步骤操作，可以成功启动并看到 UI 连接 Core

---

## 完成后更新

- [ ] `docs/archive/v0.1-closure/closure-overview.md` 中 C003 状态改为"已完成"
- [ ] `AGENTS.md` 当前阶段任务进度更新
