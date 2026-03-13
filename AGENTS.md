# AGENTS.md - do-what v0.1 封版收口引导规则（Codex）

本文件是 Codex 在本仓库中的原生入口文档，提供项目定位、当前阶段、关键约束和收口任务执行口径。  
它与 `CLAUDE.md` 互补：`CLAUDE.md` 面向 Claude Code，`AGENTS.md` 面向 Codex。

---

## 项目定位

`do-what` 是一个本地单机的 AI 编码代理编排系统：

- **Core**：常驻 daemon（`127.0.0.1:3847`），管理 Run 状态、Policy 决策、Soul 记忆摄取
- **引擎**：Claude Code（Hooks 协议）与 Codex（App Server JSONL 协议）
- **Soul**：记忆系统，三轴模型（`formation_kind` / `dimension` / `focus_surface`），证据可溯
- **目标**：让 AI 引擎在有限授权下安全执行代码任务，危险操作统一经 Policy Engine 仲裁

---

## 四条承重墙

1. **单一真相源**  
   所有状态只认 Core（Event Log + SQLite Snapshot）。UI 与引擎不持有权威状态。

2. **危险动作收口**  
   文件写入、Shell 执行、网络访问必须经 `packages/core` 的 Policy Engine 和 Tools API MCP 通道。

3. **证据可溯**  
   所有记忆结论必须带 Pointer（`git_commit:sha + repo_path:path + symbol:name`）；结论不常驻上下文，只按需展开。

4. **Token 预算契约**  
   注入预算写死在 Protocol 层（Hint 600、Excerpt 500、Full 1500）；超预算必须降级，不允许静默超支。

---

## 当前阶段

**后端状态：** v0.1 与 v0.1.x 后端实现已完成，`core` 104/104，`soul` 61/61。  
**UI 状态：** v0.1-UI Epic 已完成，但当前进入封版收口重排。  
**当前任务：** v0.1 封版收口（C001-C013），目标是补齐最朴素业务闭环，并按线性实施顺序执行。

### 收口任务进度

| 任务 | 主题 | 状态 |
| --- | --- | --- |
| C001 | 重置 closure 基线与文档真相源 | 已完成（任务体系已重置） |
| C002 | 修复 bootstrap 错误诚实性 | 待执行 |
| C003 | 建立 workspace-first 主业务契约 | 待执行 |
| C004 | 补齐 Core / Engine / Soul 默认接线与状态语义 | 待执行 |
| C005 | 收口为单入口启动 | 待执行 |
| C006 | 建立 UI 交互分层模型 | 待执行 |
| C007 | 恢复 App 壳结构并剥离展示舞台 | 待执行 |
| C008 | 恢复 Empty 与 Sidebar 的 workspace-first 体验 | 待执行 |
| C009 | 恢复 Active / Workbench 主页面 | 待执行 |
| C010 | 重建 Settings 信息架构 | 待执行 |
| C011 | 同步 README 与实现边界文档 | 待执行 |
| C012 | 硬化占位能力与 UI 诚实性 | 待执行 |
| C013 | 最终 UI fidelity 与 closure sign-off | 待执行 |

**完整任务规格：** `docs/archive/v0.1-closure/tasks/C001-C013`  
**收口总览：** `docs/archive/v0.1-closure/closure-overview.md`

### 线性执行顺序

`C001 -> C002 -> C003 -> C004 -> C005 -> C006 -> C007 -> C008 -> C009 -> C010 -> C011 -> C012 -> C013`

### 进度维护规则

1. 每完成一个 `C###` 任务，同步更新本节表格和 `docs/archive/v0.1-closure/closure-overview.md`。
2. 若因收口改动了 protocol schema、Core HTTP、状态字段、启动编排或其他接口，必须同步更新 `docs/INTERFACE_INDEX.md`。
3. 收口阶段不做与主路径无关的扩张；凡是 v0.1 主路径成立所必需的改动，允许触达 `packages/app`、`packages/core`、启动脚本和必要文档。

**执行收口任务前，必须先读：**

- `docs/archive/v0.1-closure/closure-overview.md`
- 对应任务卡 `docs/archive/v0.1-closure/tasks/C###-*.md`

---

## UI 真相源与执行口径

本轮 UI 收口相关真相源优先级固定如下：

1. `UI/preview-active.html`
2. `UI/preview-empty.html`
3. `UI/preview-settings.html`
4. `UI/styles.css`
5. `UI/UI-DESIGN-SPEC.md`
6. `UI/svg/`

`docs/archive/v0.1-closure/UI-task-adjustments-v0.1.md` 只保留为说明材料，不再作为并列真相源。

### UI 关键约束

1. **Core 单一真相源（UI 侧）**

   前端不得自行推断关键控制态，读取来源严格分层：

   | 数据类型 | 来源 | 禁止 |
   | --- | --- | --- |
   | 控制态（Run status / policy / lease） | `CoreHotState`（SSE + HTTP snapshot） | 前端自行推导 |
   | 展示态（timeline events / files diff / plan diff） | `ProjectionStore`（HTTP query + SSE merge） | 把 Projection 当控制态 |
   | 本地 UI 态（active panel / modal / theme） | `UiShellStore`（Zustand，本地） | 与 Core 强同步 |
   | 待确认命令 | `PendingCommandStore`（optimistic tail） | 写回 Core |

2. **message 不进入 `ackOverlayStore`**

   - message optimistic 只来自 `pendingCommandStore`
   - Timeline 只追踪 optimistic tail，不走 K-V overlay
   - `ackOverlayStore` 只跟踪 command 与 ack 的生命周期

3. **overlay 超时不能静默删除**

   - `revision >= ack.revision` 时触发 `reconciling`，必须经过 probe / refetch
   - 不一致则进入 `desynced` 状态，必须提供 `Retry Sync` 与 `Dismiss / Rollback`
   - 禁止把 overlay item 静默删除

4. **Timeline 必须支持分页**

   - 默认只拉最新一页（`beforeRevision + limit`）
   - 历史翻页不得打乱尾部 optimistic tail

5. **Settings lease 不能打断 dirty form**

   - 先保留 interrupted draft，再锁字段，再 refresh，再提示用户
   - 不允许直接覆盖用户未提交的配置变更

6. **UI 交互必须按 A / B / C / D 分层**

   - A：v0.1 必须真实可用
   - B：允许只是本地 UI 交互
   - C：可保留占位，但必须诚实标识
   - D：纯展示元素，不应接业务语义

7. **展示舞台不属于 App 本体**

   preview 外层灰棕背景、留白和舞台阴影不应进入产品布局语义。

8. **品牌与图标不允许自由发挥**

   - 顶栏品牌固定为纯文字 `do-what`
   - 图标只允许使用 `UI/svg/`
   - 禁止引入第三方图标库

### 工程前提（已锁定，不再讨论）

| 关注点 | 选型 |
| --- | --- |
| bundler | Vite |
| Electron dev runner | Electron Forge + Vite 插件 |
| packaging | Electron Forge makers |
| routing | React Router + HashRouter |
| state | TanStack Query（服务端）+ Zustand（本地） |
| styling | 全局 design token（CSS variables）+ CSS Modules |

---

## 构建与测试命令

```bash
pnpm install
pnpm -w build
pnpm -w test
pnpm -w typecheck

pnpm --filter @do-what/<pkg> build
pnpm --filter @do-what/<pkg> test
pnpm --filter @do-what/<pkg> typecheck

pnpm dev
pnpm dev:core
pnpm dev:app
```

Core session token 默认位于 `~/.do-what/run/session_token`。

---

## 包结构

```text
packages/
  protocol/        所有 zod schema、MCP schema、状态机类型（类型真相源）
  core/            常驻 daemon（HTTP / SSE / EventBus / SQLite / xstate）
  app/             Electron + React UI
    src/main/      Electron 主进程
    src/preload/   contextBridge IPC
    src/renderer/  React renderer 入口
    src/app/       路由与页面
    src/stores/    Zustand stores
    src/services/  HTTP client / SSE client / session guard
    src/components/共享组件
    src/styles/    design tokens + global CSS + CSS Modules
  engines/
    claude/        Claude Code 适配器
    codex/         Codex 适配器
  soul/            记忆系统
  tools/           Tool Runner
  toolchain/       工具链断言与托管
```

包名格式：`@do-what/<name>`，例如 `@do-what/protocol`、`@do-what/core`。

---

## 不可违反的规则

1. **Protocol 是唯一类型真相源**  
   新增任何接口、事件、schema，必须先在 `packages/protocol/src/` 定义 zod schema，其他包通过 `@do-what/protocol` 引用。

2. **SQLite 写操作只走 DatabaseWorker**  
   `packages/core` 与 `packages/soul` 各有独立 `worker_threads` DatabaseWorker。主线程只用只读连接。

3. **Hook Runner 不能 import Core 模块**  
   `packages/engines/claude/src/hook-runner.ts` 是独立进程，不能引用 `packages/core` 任何模块。策略决策必须走纯缓存快路径。

4. **引擎不能直接写主工作区**  
   Claude / Codex 只在分配的 `worktree` 中操作；合入主工作区由 Integrator 串行完成。

5. **引擎事件 schema 一律 `.passthrough()`**  
   CLI 版本变化时要容忍未知字段；关键字段缺失时降级并告警，不直接抛错。

6. **危险操作只走 Tools API 通道**  
   Shell、文件写入、网络请求必须通过 `tools.shell_exec`、`tools.file_write`、`tools.web_fetch`。

7. **禁止模式**

   - 禁止在主线程直接调用 `better-sqlite3` 写方法
   - 禁止空 `catch {}`
   - 禁止同一语义字段在不同 schema 中使用不同约束宽度
   - 禁止 `any`
   - 禁止单文件超过 800 行
   - 禁止单函数超过 50 行
   - 禁止在 Worker `close()` 内部创建新 Worker

---

## 每个收口任务完成前的检查清单

- [ ] 对照对应任务卡完成“必须完成”项
- [ ] `pnpm --filter @do-what/app typecheck` 无新增类型错误
- [ ] `pnpm --filter @do-what/app test` 通过，且不引入新的 FAIL
- [ ] 若任务触达 `packages/core`、启动脚本或 protocol schema，已同步更新相关文档
- [ ] 若收口被迫新增接口或字段，已更新 `docs/INTERFACE_INDEX.md`
- [ ] `closure-overview.md` 与 `AGENTS.md` 中对应任务状态已同步

---

## 文档维护规则

### `docs/INTERFACE_INDEX.md`

以下变化必须同步更新接口索引：

| 变更类型 | 需要更新的章节 |
| --- | --- |
| 新增或修改 zod event schema | Protocol 事件类型 |
| 新增或修改 MCP tool schema | MCP Tools |
| 新增或修改 Core HTTP 端点 | Core HTTP 端点 |
| 新增或修改 SQLite 表或字段 | SQLite 表结构 |
| 新增或修改 xstate 状态或转换 | xstate 状态机 |
| 新增或修改 Pointer 格式 | Pointer 格式规范 |
| 新增内部通信消息类型 | 内部通信协议 |

更新格式要求：

- 在对应表格直接修改现有行，不追加重复行
- 在文件末尾追加变更记录：`日期 · C### · 变更说明`
- 若新增字段有枚举值，在“关键字段”列列出合法值

### `README.md`

以下情况必须同步更新 README：

| 变更类型 | 需要更新的内容 |
| --- | --- |
| 默认启动方式变化 | 快速开始 |
| 已知限制发生变化 | 已知限制 |
| 新增重要运行时文件或目录 | 运行时文件布局 |

单个 closure 任务完成本身，不自动要求更新 README；只有当默认主路径或已知限制确实变化时才更新。

---

## 代码规范

### TypeScript 命名规范

| 类别 | 规则 | 示例 |
| --- | --- | --- |
| Interface | PascalCase，禁止 `I` 前缀 | `RunContext` |
| Type alias | PascalCase | `RunId` |
| Zod schema 变量 | PascalCase + `Schema` 后缀 | `RunStartedEventSchema` |
| Zod 推断类型 | PascalCase，与 schema 同名去掉后缀 | `RunStartedEvent` |
| 函数 / 方法 | camelCase，动词开头 | `createReadConnection` |
| 模块级常量 | SCREAMING_SNAKE_CASE | `DEFAULT_PORT` |
| 文件名 | kebab-case | `database-worker.ts` |
| 测试文件 | 同名 + `.test.ts` | `run.test.ts` |

### Zod 规范

- 先写 schema，再导出 `z.infer`
- 所有引擎事件 schema 必须 `.passthrough()`
- `timestamp` 统一用 `.datetime()`
- 同一语义字段的约束宽度必须保持一致

### 错误处理规范

- 禁止静默吞错
- 可恢复场景必须记录 `warn`
- 不可恢复场景直接抛出明确错误

### 不可变性规范

- 不要原地修改 xstate context
- 使用新对象或新数组返回
- context 类型优先使用 `readonly`

### SQLite 连接规范

- 只读连接使用 `readonly: true`
- 再配合 `pragma('query_only = true')`

### 存根规范

- 禁止无注释的空存根
- 临时占位必须标注 `TODO(C###): ...`

---

## 关键文件速查

| 需要了解什么 | 读哪里 |
| --- | --- |
| 收口总览与封版检查清单 | `docs/archive/v0.1-closure/closure-overview.md` |
| 当前收口任务规格 | `docs/archive/v0.1-closure/tasks/C001-C013` |
| UI 基线 | `UI/preview-active.html`、`UI/preview-empty.html`、`UI/preview-settings.html`、`UI/styles.css`、`UI/UI-DESIGN-SPEC.md` |
| 当前架构真相 | `docs/architecture-as-built.md` |
| 各子系统实现状态 | `docs/implementation-status-v0.1.md` |
| 所有接口、端点、表结构速查 | `docs/INTERFACE_INDEX.md` |
| 仓库结构与运行方式 | `docs/project-inventory.md` |
| v0.1-UI 前后端契约参考 | `docs/archive/v0.1-UI/frontend_backend_contract_v0.1.md` |
| v0.1-UI 状态分层模型参考 | `docs/archive/v0.1-UI/workbench_state_model_v0.1.md` |
| 事件与 schema 源码 | `packages/protocol/src/` |
| Core HTTP 端点实现 | `packages/core/src/server/routes.ts` |
| UI 命令分发入口 | `packages/app/src/lib/commands/app-command-actions.ts` |
