# v0.1 Closure 审计：当前代码 vs 预期

**日期：** 2026-03-13  
**范围：** 当前 `packages/app`、相关 protocol / docs，以及 v0.1 closure 所定义的产品体验基线。  
**口径：** 本文记录证据化偏差，不等于要求本轮全部修复。除 SVG 资产收口外，其余问题本轮只汇报和文档化。

## 标签说明

- `UI fix candidate`：明确属于后续应修的 UI / 前端实现问题
- `docs-only`：本轮只需要同步文档口径
- `report-only`：本轮只记录事实，不立即变更实现
- `already aligned`：当前代码已满足本轮 closure 要求

---

## 高优先级偏差

### 1. workspace-first 主路径尚未在 UI 上成立

**标签：** `UI fix candidate`

**证据：**

- `[workspace-sidebar.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/components/sidebar/workspace-sidebar.tsx)` 中左栏 `+` 绑定的是 `onCreateRun`，不是创建或打开 workspace。
- 同文件中的 `New Run` 仍是左栏主操作。
- `[workbench-empty-state.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/components/empty/workbench-empty-state.tsx)` 的 Empty 主 CTA 仍是 `Create Run`，而不是 `打开工作区`。
- `[workbench-page-content.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/pages/workbench/workbench-page-content.tsx)` 在提交 create-run 时仍存在 `workspaceIds[0] ?? 'workspace-main'` 的 fallback。
- `[app-command-actions.ts](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/lib/commands/app-command-actions.ts)` 已经存在 `dispatchCreateWorkspace()`，说明后端和 command 层能力已落地，但 UI 主路径没有接上。

**影响：**

- 当前产品体验仍然把 Run 当作起点，而不是把 workspace 作为第一业务实体。
- 这会让 Empty、Sidebar、New Run modal 与 v0.1 closure 目标持续错位。

---

### 2. Settings 仍是字段节视图，不是五域配置中心

**标签：** `UI fix candidate`

**证据：**

- `[settings-page-content.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/pages/settings/settings-page-content.tsx)` 仍然采用“按 tab 选 section + 单一卡片渲染 fields”的模式。
- 同页仍追加了 `Runtime`、`Lease locks`、`Settings overlays` 三类通用卡片，进一步弱化了五域信息架构。
- 引擎页当前并未承担“真实状态查看 + 重新检测”的独立职责，而只是普通字段节。

**影响：**

- Settings 虽然表面上已有五个 tab，但在信息架构层面仍未回到目标设计。
- 引擎、Soul、策略、环境、外观之间的职责边界仍然不够清晰。

---

### 3. 状态语义与引擎展示仍偏粗粒度

**标签：** `report-only`

**证据：**

- `[ui-contract.ts](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/protocol/src/core/ui-contract.ts)` 中 `CoreHealthStatusSchema` 仍只有 `unknown / idle / booting / healthy / running / degraded / offline / rebooting`。
- `[core-services-bootstrap.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/app/core-services-bootstrap.tsx)` 已经有 bootstrap failure 细分，但健康合成仍然基于上述粗状态。
- `[workspace-sidebar.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/components/sidebar/workspace-sidebar.tsx)` 只把 `health.claude` 当作 Engine 状态展示，没有形成完整引擎接入语义。

**影响：**

- 当前代码能表达“离线 / 启动中 / 健康 / 降级”等大类状态，但还不足以支撑 `not_installed / auth_failed / disabled` 这类更细产品语义。
- 文档应诚实记录这一点，避免把预期状态语义写成已实现。

---

## 中优先级偏差

### 4. App shell 仍保留明显舞台式包装，需要继续核实边界

**标签：** `report-only`

**证据：**

- `[app-shell.module.css](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/app/app-shell.module.css)` 仍保留 `.windowChrome`、居中 `max-width`、明显阴影和圆角壳。

**影响：**

- 这不一定是错误，因为 Electron 窗口 chrome 允许存在。
- 但它仍然是需要持续审视的边界点：哪些是合理窗口容器，哪些已经越界成 preview 展示舞台。

---

### 5. Create Run modal 更像模板表单，不完全符合新版 modal 语义

**标签：** `report-only`

**证据：**

- `[create-run-modal.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/components/create-run/create-run-modal.tsx)` 当前围绕 template 选择和 inputs 渲染，结构更接近配置表单。
- 与新版 UI 规范里强调的模式选择、节点选择、更多选项层级相比，还有明显差距。

**影响：**

- 当前 modal 不是坏的实现，但尚未与新版产品语义对齐。

---

### 6. 运行时 SVG 边界已经基本达成，但之前缺乏正式说明

**标签：** `docs-only`

**证据：**

- 全仓搜索未发现运行时代码直接引用 `UI/svg/**`。
- 当前运行时 SVG 都位于 `packages/app/src/assets/**`。
- 基于 hash 对比，现有运行时 SVG 都可以追溯到 `UI/svg/**` 中的设计源。

**影响：**

- 实际代码已经符合“运行时不直接依赖 `UI/svg`”的方向。
- 之前主要缺的是规则说明、来源映射和 closure 文档口径，而不是代码层面的重新搬运。

---

## 测试与夹具偏差

### 7. 测试仍固化旧产品假设

**标签：** `report-only`

**证据：**

- `[app-root.test.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/app/app-root.test.tsx)` 仍把 `Create Run` 作为默认主入口进行断言。
- 同文件还保留了包含损坏字符的断言字符串，说明测试文案本身也存在编码漂移。
- `[workbench-fixtures.ts](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/test/fixtures/workbench-fixtures.ts)` 固化了 `workspace-main`。
- `[settings-fixtures.ts](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/test/fixtures/settings-fixtures.ts)` 仍是字段节模型。

**影响：**

- 测试覆盖虽然存在，但部分断言和夹具已开始偏离新版产品目标。
- 这会让未来 UI 收口时出现“实现改对了、测试却在保旧”的冲突。

---

## 已对齐项

### 8. unsupported governance / memory 按钮已完成占位硬化

**标签：** `already aligned`

**证据：**

- `[inspector-rail.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/components/inspector/inspector-rail.tsx)` 中相关按钮已 disabled，并带有 `此功能将在 v0.2 中支持` tooltip。
- 对应测试 `[inspector-rail.test.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/components/inspector/inspector-rail.test.tsx)` 已覆盖该行为。

---

### 9. bootstrap 错误与离线态已经有真实区分基础

**标签：** `already aligned`

**证据：**

- `[core-services-bootstrap.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/app/core-services-bootstrap.tsx)` 已区分离线态、auth 失败和 snapshot 失败。
- `[App.tsx](/Users/3SMDYX-WPP02/Desktop/AI/do-what-local/do-what-new/packages/app/src/app/App.tsx)` 已在 HTTP transport 且 `bootstrapStatus === 'offline'` 时显示 `CoreOfflineScreen`。

**说明：**

- 这并不代表状态语义已经完全达标，只说明“错误诚实性”已经有了可继续深化的基础。

---

## 文档结论

- 本轮需要同步文档，不需要把上述偏差都立即修成代码。
- `README.md` 当前关于默认启动路径和手动引擎接入的描述仍与代码一致，因此本轮不强行改写 README。
- `docs/implementation-status-v0.1.md` 应记录：
  - workspace-first UI 主路径尚未成立
  - Settings 信息架构仍部分实现
  - 状态语义仍偏粗
  - 运行时 SVG 边界已经成立，但需继续维护

---

## 后续建议

1. 把 `workspace-first` UI 接线视为最高优先级前端问题。
2. 在真正重做 Settings IA 前，先不要把当前 settings 误写成“已完成”。
3. 将测试夹具整理纳入后续 UI 收口阶段，而不是等到最后一刻。
4. 保持 `UI/svg` 作为设计源、`packages/app/src/assets` 作为运行时资产源的双层结构，不要回退。
