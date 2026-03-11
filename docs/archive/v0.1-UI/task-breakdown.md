# v0.1-UI 任务拆解方案

> 状态：In implementation（T001A–T032 已完成，下一步 T033）
>
> 真相源：
> - `docs/archive/v0.1-UI/frontend_backend_contract_v0.1.md`
> - `docs/archive/v0.1-UI/workbench_state_model_v0.1.md`
>
> 视觉参考：
> - `UI/UI-DESIGN-SPEC.md`
> - `UI/preview-active.html`
> - `UI/preview-empty.html`
> - `UI/preview-settings.html`
>
> 约束：视觉稿仅作参考；若与真相源冲突，以两份 `v0.1-UI/*.md` 为准。

---

## A. 文档理解摘要

### 这轮 v0.1-UI 要做什么

本轮不是重做前端方案，而是把已经确定的 Electron + React + TypeScript 前端方向，
拆成可以逐步交付的实现任务。

前端需要在 `packages/app` 内落地一个正式的 Workbench + Settings UI，
并严格遵守以下架构边界：

- Core 是唯一真相源。
- 前端只通过 `HTTP snapshot/query + SSE + command` 与 Core 交互。
- 控制态、Projection、本地 UI 态、Pending Command、Ack Overlay 必须分层。
- Timeline、Approval、Inspector、Soul、Settings、Governance 都要有稳定落脚点。
- T001A / T001B 已完成 runtime/scaffold 决策与 `packages/app` 正式工程骨架，后续任务直接在该基础上推进。

### 本轮范围内的模块边界

- `packages/app`
  - Electron + React + TypeScript 的 runtime/scaffold
  - 页面、组件、样式、图标、前端 store、selector、command dispatcher
  - HTTP client、SSE client、session guard、reconciliation manager
- `packages/protocol`
  - 前端共享 contract/type/schema 的正式落点
  - 前后端对齐所需的 snapshot/query/command/SSE/probe 类型定义
- `packages/core`
  - 为 UI 暴露必要的 `/api/*` 查询面、命令面、probe 接口、SSE envelope
  - 保持 Core 单一真相源，不把 UI 状态反向写回 Core
- `UI/`
  - 仅为临时设计源
  - 最终采用的 token、SVG、组件结构需迁移进 `packages/app`

### 不在本轮范围内的内容

- 重做 Core / Soul / Policy / Orchestration 架构
- 新增长期维护的独立 `packages/ui`
- 让前端自行推导工作流 DAG 或控制态
- 把 message 塞进 `ackOverlayStore`
- 暗色模式正式实现
- 把 Electron + React + TypeScript 总体方向重新拿出来讨论

---

## B. 任务分组

### Foundation / shared types / contracts

- [T001A](./tasks/T001A-runtime-scaffold-decision.md) `runtime-scaffold-decision`（已完成）
- [T001B](./tasks/T001B-packages-app-bootstrap.md) `packages-app-bootstrap`（已完成）
- [T002](./tasks/T002-frontend-contract-baseline.md) `frontend-contract-baseline`（已完成）
- [T003](./tasks/T003-mock-fixtures-and-adapters.md) `mock-fixtures-and-adapters`（已完成）
- [T004](./tasks/T004-design-tokens-and-theme-base.md) `design-tokens-and-theme-base`（已完成）
- [T005](./tasks/T005-svg-icon-and-empty-assets.md) `svg-icon-and-empty-assets`（已完成）
- [T006](./tasks/T006-core-http-client.md) `core-http-client`（已完成）
- [T007](./tasks/T007-core-event-client-and-session-guard.md) `core-event-client-and-session-guard`（已完成）

### State stores / selectors / query bridge

- [T008](./tasks/T008-hot-state-store.md) `hot-state-store`（已完成）
- [T009](./tasks/T009-projection-store.md) `projection-store`（已完成）
- [T010](./tasks/T010-pending-command-store.md) `pending-command-store`（已完成）
- [T011](./tasks/T011-ack-overlay-and-reconciliation.md) `ack-overlay-and-reconciliation`（已完成）
- [T012](./tasks/T012-ui-store-and-settings-bridge.md) `ui-store-and-settings-bridge`（已完成）

### Workbench / Timeline / Inspector / Approval / Memory / Settings 模块

- [T013](./tasks/T013-workbench-shell-bootstrap.md) `workbench-shell-bootstrap`（已完成）
- [T014](./tasks/T014-workspace-sidebar.md) `workspace-sidebar`（已完成）
- [T015](./tasks/T015-workbench-empty-states.md) `workbench-empty-states`（已完成）
- [T016](./tasks/T016-template-registry-and-create-run-draft.md) `template-registry-and-create-run-draft`（已完成）
- [T017](./tasks/T017-create-run-modal-and-command-flow.md) `create-run-modal-and-command-flow`（已完成）
- [T018](./tasks/T018-timeline-data-model-and-pagination.md) `timeline-data-model-and-pagination`（已完成）
- [T019](./tasks/T019-timeline-render-merged-and-threaded.md) `timeline-render-merged-and-threaded`（已完成）
- [T020](./tasks/T020-timeline-optimistic-message-tail.md) `timeline-optimistic-message-tail`（已完成）
- [T021](./tasks/T021-approval-card-and-cli-overlay.md) `approval-card-and-cli-overlay`（已完成）
- [T022](./tasks/T022-inspector-files-plan-history.md) `inspector-files-plan-history`（已完成）
- [T023](./tasks/T023-inspector-collaboration-and-git.md) `inspector-collaboration-and-git`（已完成）
- [T024](./tasks/T024-governance-checkpoint-panels.md) `governance-checkpoint-panels`（已完成）
- [T025](./tasks/T025-drift-resolution-panels.md) `drift-resolution-panels`（已完成）
- [T026](./tasks/T026-soul-panel-and-memory-projections.md) `soul-panel-and-memory-projections`（已完成）
- [T027](./tasks/T027-memory-governance-and-proposal-review.md) `memory-governance-and-proposal-review`（已完成）
- [T028](./tasks/T028-settings-query-tabs.md) `settings-query-tabs`（已完成）
- [T029](./tasks/T029-settings-lease-interruption.md) `settings-lease-interruption`（已完成）

### Core API / SSE / reconciliation / pagination / optimistic rendering

- [T030](./tasks/T030-core-api-snapshot-and-query-surface.md) `core-api-snapshot-and-query-surface`（已完成）
- [T031](./tasks/T031-core-command-and-probe-routes.md) `core-command-and-probe-routes`（已完成）
- [T032](./tasks/T032-core-sse-envelope-and-event-alignment.md) `core-sse-envelope-and-event-alignment`（已完成）

### 测试与验收 / 清理

- [T033](./tasks/T033-real-core-integration-tests.md) `real-core-integration-tests`
- [T034](./tasks/T034-visual-parity-and-ui-design-source-cleanup.md) `visual-parity-and-ui-design-source-cleanup`

---

## C. 原子任务清单

当前进度：`T001A`–`T032` 已完成；后续从 `T033` 开始。

| ID | 标题 | 分组 | 前置依赖 | 可并行 |
|----|------|------|----------|--------|
| T001A | runtime-scaffold-decision | Foundation | 无 | 否 |
| T001B | packages-app-bootstrap | Foundation | T001A | 否 |
| T002 | frontend-contract-baseline | Foundation | T001B | 否 |
| T003 | mock-fixtures-and-adapters | Foundation | T002 | 可与 T004 并行 |
| T004 | design-tokens-and-theme-base | Foundation | T001B | 可与 T003 并行 |
| T005 | svg-icon-and-empty-assets | Foundation | T004 | 可与 T006 并行 |
| T006 | core-http-client | Foundation | T001B，T002 | 可与 T005 并行 |
| T007 | core-event-client-and-session-guard | Foundation | T001B，T002 | 可与 T006 并行 |
| T008 | hot-state-store | State | T006，T007 | 可与 T009、T012 并行 |
| T009 | projection-store | State | T006，T007 | 可与 T008、T012 并行 |
| T010 | pending-command-store | State | T006，T007，T008 | 可与 T011 前的其它任务并行 |
| T011 | ack-overlay-and-reconciliation | State | T009，T010 | 否 |
| T012 | ui-store-and-settings-bridge | State | T001B | 可与 T008、T009 并行 |
| T013 | workbench-shell-bootstrap | Workbench | T005-T012 | 否 |
| T014 | workspace-sidebar | Workbench | T008，T013 | 可与 T015 并行 |
| T015 | workbench-empty-states | Workbench | T005，T013 | 可与 T014 并行 |
| T016 | template-registry-and-create-run-draft | Workbench | T003，T012 | 可与 T017 并行 |
| T017 | create-run-modal-and-command-flow | Workbench | T010，T013，T016 | 否 |
| T018 | timeline-data-model-and-pagination | Timeline | T009，T013 | 可与 T021 并行 |
| T019 | timeline-render-merged-and-threaded | Timeline | T018 | 可与 T020 并行 |
| T020 | timeline-optimistic-message-tail | Timeline | T010，T011，T018 | 否 |
| T021 | approval-card-and-cli-overlay | Approval | T008，T010，T011，T013 | 可与 T022 并行 |
| T022 | inspector-files-plan-history | Inspector | T009，T013 | 可与 T021、T023 并行 |
| T023 | inspector-collaboration-and-git | Inspector | T022 | 可与 T024 并行 |
| T024 | governance-checkpoint-panels | Governance | T010，T011，T022 | 可与 T023、T025 并行 |
| T025 | drift-resolution-panels | Governance | T010，T011，T022 | 可与 T024、T026 并行 |
| T026 | soul-panel-and-memory-projections | Soul | T009，T013 | 可与 T025、T027 并行 |
| T027 | memory-governance-and-proposal-review | Soul | T010，T011，T026 | 否 |
| T028 | settings-query-tabs | Settings | T006，T012，T013 | 可与 T029 并行 |
| T029 | settings-lease-interruption | Settings | T008，T012，T028 | 否 |
| T030 | core-api-snapshot-and-query-surface | Core API | T002 | 可与 T031 前半并行 |
| T031 | core-command-and-probe-routes | Core API | T030 | 否 |
| T032 | core-sse-envelope-and-event-alignment | Core API | T030，T031 | 否 |
| T033 | real-core-integration-tests | 验收 | T017-T032 | 否 |
| T034 | visual-parity-and-ui-design-source-cleanup | 验收 | T013-T033 | 否 |

---

## D. 推荐实施顺序

### 必须先做

1. `T001A（已完成） -> T001B（已完成） -> T002`
2. `T002 -> T006/T007`
3. `T008/T009/T012`
4. `T010 -> T011`
5. `T013`

### 可并行推进

- `T003` 与 `T004`
- `T008`、`T009`、`T012`
- `T014` 与 `T015`
- `T016` 与右栏基础样式类任务
- `T023` 与 `T024/T025` 的视觉壳层
- `T028` 与 Core 侧 `T030`

### 必须在集成阶段再做

- `T031` 对象级 probe
- `T032` SSE envelope、`coreSessionId`、`causedBy`
- `T033` mock -> real Core 集成测试
- `T034` 视觉对照、UI 设计源清理

---

## E. 待确认问题

当前无 runtime/scaffold 级待确认项。

runtime/scaffold 方案已经由：

- `T001A-runtime-scaffold-decision`
- `docs/archive/v0.1-UI/runtime-scaffold-decision.md`

明确拍板，不再把以下内容视为悬空讨论：

- Electron + React + TypeScript 方向
- bundler
- Electron dev runner
- packaging
- 路由模式
- 状态库落点
- 样式系统载体

若后续需要调整，只能作为显式变更重新开文档，不在当前任务体系里隐含漂移。

---

## 关键约束落点

### Core 单一真相源

- 前端只读 snapshot / query / event / ack / probe
- 不允许组件自行推导控制态
- 对应任务：`T002`、`T006`、`T008`、`T009`、`T030-T032`

### HTTP snapshot/query + SSE + command

- 初始化走 HTTP
- 增量走 SSE
- 写操作统一走 command
- 对应任务：`T002`、`T006`、`T007`、`T010`、`T030-T032`

### message 不进入 ackOverlayStore

- message optimistic 只来自 `pendingCommandStore`
- Timeline 只追加 optimistic tail，不做 K-V overlay
- 对应任务：`T010`、`T011`、`T020`

### timeline 必须支持分页

- 默认只拉最新一页
- 历史翻页走 `beforeRevision + limit`
- 头部分页不得打乱尾部 optimistic tail
- 对应任务：`T018`、`T019`、`T020`、`T030`

### overlay 超时不能静默删除

- `revision >= ack.revision` 只能触发 `reconciling`
- 必须经过 probe/refetch
- 不一致则进入 `desynced`
- 对应任务：`T011`、`T021`、`T027`、`T031-T032`

### desynced 必须有明确出路

- `Retry Sync`
- `Dismiss / Rollback`
- 不允许挂成无动作僵尸态
- 对应任务：`T011`、`T020`、`T021`、`T027`

### active / mounted run 才接收细粒度 projection merge

- inactive run 只更新 hot summary / selected list 数据
- 不常驻后台 run 的 token chunk / files diff / plan diff
- 对应任务：`T009`、`T014`、`T018`、`T032`

### settings lease 打断 dirty form 必须保留 interrupted draft

- 先保存 interrupted draft
- 再锁字段
- 再 refresh
- 再提示用户
- 对应任务：`T012`、`T028`、`T029`

### T001A / T001B 已固定的工程前提

- bundler：Vite
- Electron dev runner：Electron Forge + Vite 插件
- packaging：Electron Forge makers
- routing：React Router + HashRouter
- state：TanStack Query + Zustand
- styling：全局 design token + CSS Modules

这些前提直接影响 `T001B` 以及所有 `packages/app` 相关任务的落地方式。

---

## 说明

- 本文件只负责任务拆解，不是实现说明书。
- 每张任务卡都按“可单独实现、可单独 review、可单独验收、可单独回滚”组织。
- 若后续真相源文档更新，应优先更新任务卡的依赖与验收标准，而不是在实现阶段临时改口。


