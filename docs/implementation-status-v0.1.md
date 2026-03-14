# do-what v0.1 实现状态总表

状态判定口径：

- `已实现`：仓库中有真实运行代码，且有调用链或测试支撑
- `部分实现`：有真实代码，但默认运行闭环、写路径或持久化不完整
- `占位/只读`：只有查询面、静态快照、兼容层或 failure ack
- `未实现`：当前代码中没有可确认的运行时落点

## 1. 前端 UI / Workbench

**目标职责**

- 提供桌面 UI，承载 workbench、timeline、inspector、settings 等用户交互面。

**当前实现状态**

- `部分实现`

**证据文件**

- `packages/app/src/main/main.ts`
- `packages/app/src/app/App.tsx`
- `packages/app/src/app/workbench-page-content.tsx`
- `packages/app/src/components/sidebar/workspace-sidebar.tsx`
- `packages/app/src/components/empty/workbench-empty-state.tsx`
- `packages/app/src/pages/settings/settings-page-content.tsx`

**当前判断**

- Electron 壳、路由、sidebar、timeline、inspector、settings 都已落到 live 页面实现，不再依赖 preview 舞台包装。
- 主路径已经收口为 `workspace-first`：Empty 主 CTA 打开工作区，Sidebar `+` 走真实 `workspace.open`，`New Run` 只在具体 workspace 上下文内发起。
- Active / Workbench 已把 timeline、composer、inspector 绑定到当前 `workspace + run + engine`，发送行为会按引擎可用性和全局锁诚实禁用。
- Settings 已重组为 `Engines / Soul / Policies / Environment / Appearance` 五域独立内容区，而不是单一字段节视图。
- UI 默认 transport 已切为 `http`；Core 不可达时展示离线屏，显式 `?transport=mock` / `VITE_CORE_TRANSPORT=mock` 才进入 mock。

**已知缺口 / 限制**

- Inspector 中的 `memory pin/edit/supersede`、`drift resolution`、`integration gate decision` 当前保留可见入口，但在 UI 中已 disabled，并统一标注 `v0.2` 占位。
- Empty 次动作 `浏览历史` 当前仍是 disabled 的诚实占位，不会触发命令或假提交。
- Settings 仍是进程内 session-local 草稿，不会在重启后持久化。
- 运行时 SVG 已集中在 `packages/app/src/assets`，且当前代码未再直接引用 `UI/svg`；`UI/svg` 继续仅作为设计源素材库维护。

**是否可视为 v0.1 完成**

- 可以视为 v0.1 主路径已经成立。
- 仍不能把延期到 v0.2 的占位能力误写成已完成产品能力。

## 2. 状态管理

**目标职责**

- 管理控制态、查询投影、本地 UI 态、乐观命令与 ack 生命周期。

**当前实现状态**

- `已实现`

**证据文件**

- `packages/app/src/stores/hot-state/hot-state-store.ts`
- `packages/app/src/stores/projection/projection-store.ts`
- `packages/app/src/stores/pending-command/pending-command-store.ts`
- `packages/app/src/stores/ack-overlay/ack-overlay-store.ts`
- `packages/app/src/stores/settings-bridge/settings-bridge-store.ts`
- `packages/app/src/stores/ui/ui-store.ts`

**当前判断**

- store 分层清晰，且有 runtime 组装代码。
- ack overlay 与 optimistic message tail 都有真实 reconciliation 逻辑。

**已知缺口 / 限制**

- 某些 overlay 会因为后端缺失可写路径而进入 desynced，而不是完成业务动作。

**是否可视为 v0.1 完成**

- 可以视为 UI 侧 v0.1 已实现。

## 3. Core / 服务层

**目标职责**

- 作为 HTTP/SSE 服务中心，提供 query、command、auth、event 分发与状态持久化。

**当前实现状态**

- `已实现`

**证据文件**

- `packages/core/src/server/http.ts`
- `packages/core/src/server/routes.ts`
- `packages/core/src/server/auth.ts`
- `packages/core/src/server/sse.ts`
- `packages/core/src/server/ui-query-service.ts`
- `packages/core/src/server/ui-command-service.ts`

**当前判断**

- Core 是当前代码中最完整的运行时中心。
- UI query 面和部分 command 面已经可用。

**已知缺口 / 限制**

- Core 内没有看到自动拉起外部引擎适配器的接线。
- 部分 command 明确返回 unsupported failure ack。

**是否可视为 v0.1 完成**

- 就“HTTP/SSE + query/command 基础服务层”而言可视为完成。
- 就“全链路执行中枢”而言仍是部分实现。

## 4. 协议与数据契约

**目标职责**

- 作为事件、查询、命令、Soul、治理等共享类型真相源。

**当前实现状态**

- `已实现`

**证据文件**

- `packages/protocol/src/core/ui-contract.ts`
- `packages/protocol/src/events/index.ts`
- `packages/protocol/src/core/*.ts`
- `packages/protocol/src/soul/*.ts`
- `packages/protocol/src/mcp/*.ts`

**当前判断**

- schema 覆盖范围很广，且有测试。
- UI 与 Core 的多数边界都能在 protocol 中找到明确类型。

**已知缺口 / 限制**

- 协议的存在不代表对应写路径全部落地。

**是否可视为 v0.1 完成**

- 可以。

## 5. 事件系统

**目标职责**

- 写入事件日志、分配 revision、向 Core 与 UI 广播事件。

**当前实现状态**

- `已实现`

**证据文件**

- `packages/core/src/eventbus/event-bus.ts`
- `packages/core/src/event-handler/sync-path.ts`
- `packages/core/src/event-handler/async-path.ts`
- `packages/core/src/server/sse.ts`

**当前判断**

- EventBus、SSE envelope、ack cause 关联都已存在。
- HotState 与 projection 都通过事件驱动更新。

**已知缺口 / 限制**

- 事件系统完整不等于上层业务流程完整。

**是否可视为 v0.1 完成**

- 可以。

## 6. 存储层

**目标职责**

- 为 Core 和 Soul 提供 SQLite 持久化与 worker 写入路径。

**当前实现状态**

- `已实现`

**证据文件**

- `packages/core/src/db/schema.ts`
- `packages/core/src/db/database-worker.ts`
- `packages/core/src/db/worker-client.ts`
- `packages/soul/src/db/schema.ts`
- `packages/soul/src/db/soul-worker.ts`
- `packages/soul/src/db/worker-client.ts`

**当前判断**

- `state.db` 与 `soul.db` 是分开的。
- Core 与 Soul 都有 migration 和测试。

**已知缺口 / 限制**

- `SettingsStore` 是进程内内存快照，不持久化到 SQLite。重启后所有 settings 恢复默认值。UI 已在 Settings 页面顶部标注此限制，持久化支持计划在 v0.2。

**是否可视为 v0.1 完成**

- 可以，但 settings 配置持久化不在其中。

## 7. Soul / 记忆相关

**目标职责**

- 维护长期记忆、evidence、pointer、proposal/review、memory_repo。

**当前实现状态**

- `部分实现`

**证据文件**

- `packages/soul/src/mcp/dispatcher.ts`
- `packages/soul/src/db/schema.ts`
- `packages/soul/src/repo/memory-repo-manager.ts`
- `packages/soul/src/search/memory-search.ts`
- `packages/soul/src/pointer/*`
- `packages/soul/src/write/*`

**当前判断**

- Soul 子系统本身是实的，不是概念。
- search/open_pointer/propose/review 都有入口与测试。
- memory_repo 确实以 Git 仓形式存在。

**已知缺口 / 限制**

- UI 对既有 memory 的 pin/edit/supersede 未通过 Core 接通真实写路径。
- Soul 的很多能力更偏底层服务和测试验证，而不是默认产品流程。

**是否可视为 v0.1 完成**

- 不能按“完整产品体验”视为完成。
- 可以视为“底层记忆子系统已大体落地”。

## 8. Engine / CLI 适配

**目标职责**

- 接入 Claude Code 与 Codex CLI，向 Core 提供引擎事件。

**当前实现状态**

- `部分实现`

**证据文件**

- `packages/engines/claude/src/claude-adapter.ts`
- `packages/engines/claude/src/hook-runner.ts`
- `packages/engines/codex/src/codex-adapter.ts`
- `packages/engines/codex/src/codex-process-manager.ts`
- `packages/core/src/server/http.ts`

**当前判断**

- 适配器代码和测试都在。
- 事件归一化、审批转发、process manager 都不是空实现。
- Core 启动后会对 `Core / Claude / Codex / Soul` 做默认探测，并通过 `WorkbenchSnapshot.modules` 向 UI 暴露显式模块状态。
- UI 已按当前 run 的引擎绑定发送门禁；未连接、探测失败、认证失败或未安装时都会给出明确状态与禁用提示。

**已知缺口 / 限制**

- Core 启动后不会自动拉起 Claude/Codex 适配器；适配器需要人工外部启动。
- `create-run` 会创建 RunMachine，但在无引擎事件输入时只会停留在 waiting / idle，不会自动产生执行进展。
- 当前开发态单入口 `pnpm dev` 只负责等待 Core 健康并启动 App，不负责 packaged 场景下的引擎编排。

**是否可视为 v0.1 完成**

- 不能按“自动引擎执行闭环”视为完成。

## 9. Governance / baseline lock / focus surface / integration

**目标职责**

- 管理并发冲突、基线锁、治理租约、集成前判定与 worktree 生命周期。

**当前实现状态**

- `部分实现`

**证据文件**

- `packages/protocol/src/core/governance.ts`
- `packages/protocol/src/core/focus-surface.ts`
- `packages/protocol/src/core/baseline-lock.ts`
- `packages/core/src/governance/*`
- `packages/core/src/integrator/*`
- `packages/core/src/run/worktree-lifecycle.ts`

**当前判断**

- 后端逻辑、表结构和测试都在。
- Inspector 能展示部分 governance 状态。

**已知缺口 / 限制**

- 部分治理动作按钮没有真实可写后端路径。
- integration gate decision 当前走 unsupported path。

**是否可视为 v0.1 完成**

- 可视为后端治理基建已实现。
- 不可视为完整用户闭环已完成。

## 10. 配置与工程化

**目标职责**

- 管理工作区、构建、打包、运行时目录与环境变量。

**当前实现状态**

- `部分实现`

**证据文件**

- 根 `package.json`
- `scripts/dev.mjs`
- `pnpm-workspace.yaml`
- `turbo.json`
- `packages/app/forge.config.js`
- `packages/core/src/config.ts`
- `packages/app/src/lib/runtime/runtime-config.ts`

**当前判断**

- Monorepo、构建和 Electron 打包配置是存在的。
- 运行时目录与 token 约定明确。
- 根命令 `pnpm dev` 已成为默认开发启动入口，会先等待 Core `/health`，再拉起 App。
- `pnpm dev:core` / `pnpm dev:app` 继续保留给调试使用。

**已知缺口 / 限制**

- 单入口编排目前只覆盖开发态，不处理 packaged 场景下的 Core / engine 自启动。
- UI 默认 transport 为 `http`；mock 仅在显式配置时开启。
- `toolchain` 包目前基本为空。
- 本次盘点未发现统一 ESLint / Prettier 配置。

**是否可视为 v0.1 完成**

- 只能视为部分实现。

## 11. 测试与质量保障

**目标职责**

- 通过 schema、单测、集成测试覆盖关键链路。

**当前实现状态**

- `已实现`

**证据文件**

- `packages/core/src/__tests__/*`
- `packages/app/src/__tests__/real-core.integration.test.ts`
- `packages/app/src/app/app-root.test.tsx`
- `packages/app/src/pages/settings/settings-page-content.test.tsx`
- `packages/app/src/components/inspector/inspector-rail.test.tsx`
- `packages/soul/src/__tests__/*`
- `packages/engines/claude/src/__tests__/*`
- `packages/engines/codex/src/__tests__/*`
- `packages/protocol/src/__tests__/*`

**当前判断**

- 仓库有较多针对核心链路的测试。
- `app` 还有真实 Core 集成测试，不只是 mock 测试。
- `app` 侧回归已覆盖 workspace-first 空态、run 切换、发送门禁、Settings 五域和占位诚实性。

**已知缺口 / 限制**

- 当前没有从仓库中直接看到覆盖率门禁。
- 测试存在不等于默认运行体验完整。
- sign-off 截图已入库，但当前还没有自动化视觉 diff 门禁。

**是否可视为 v0.1 完成**

- 可以视为“有实质性测试支撑”。

## 12. 文档现状

**目标职责**

- 让首次进入仓库的人能从当前代码理解项目结构、运行方式和边界。

**当前实现状态**

- `部分实现`

**证据文件**

- `README.md`
- `docs/archive/*`
- `docs/INTERFACE_INDEX.md`

**当前判断**

- archive 文档很多，但它们主要是历史方案和任务卡。
- README 已回填真实启动路径、已知限制与引擎接入边界。
- `docs/archive/v0.1-closure/code-vs-expected-audit.md` 现在承担“当前代码 vs 预期”的证据化审计，不再只靠任务卡口头描述。
- `docs/archive/v0.1-closure/sign-off/` 已补齐 Active / Empty / Settings 截图与最终 sign-off 说明。

**已知缺口 / 限制**

- archive 文档仍然很多，首次阅读时仍需区分历史设计与当前实现。

**是否可视为 v0.1 完成**

- 可以视为基础文档已对齐当前实现，但首次阅读仍需区分 archive 中的历史计划。

## 13. archive 中提过但当前未见完整运行时落点的能力

这部分不是说仓库完全没有相关代码，而是说当前不能把它们写成“默认已成体系可用”。

| 能力或说法 | 当前判断 | 说明 |
| --- | --- | --- |
| Core 默认直接拉起 Claude/Codex 执行 run | `未见完整运行时落点` | 适配器包存在，但 `packages/core` 启动路径中未看到接线 |
| Archive 作为独立运行时层与 Projection 并列存在 | `未见运行时模块` | 当前看到的是 `docs/archive/` 历史文档目录，不是运行时子系统 |
| memory pin/edit/supersede 的完整 UI -> Core -> Soul 可写闭环 | `未实现` | 当前 Core 明确返回 unsupported failure ack |
| drift resolution 的完整可写闭环 | `未实现` | 当前 Core 明确返回 unsupported failure ack |
| integration gate decision 的完整可写闭环 | `未实现` | 当前 Core 明确返回 unsupported failure ack |
| 持久化 settings 配置中心 | `未实现` | 当前 `SettingsStore` 为进程内内存快照，重启后恢复默认值 |
