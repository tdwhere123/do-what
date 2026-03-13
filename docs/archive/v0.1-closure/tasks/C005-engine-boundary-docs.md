# C005 — 引擎接入边界文档化

**优先级：** P1（应该，封版质量）
**依赖：** C003 完成后执行（README 引擎章节基础在 C003 中建立）
**涉及文件：** `docs/implementation-status-v0.1.md`、`packages/app/src/components/`（可选）
**不得改动：** `packages/core`、`packages/protocol`、任何后端包

---

## 背景

当前 Core 启动后不会自动拉起引擎适配器（Claude/Codex）。
`create-run` 操作可以创建 RunMachine，但无引擎事件流入时，timeline 的展示状态需要确认。
封版前需要文档明确说明边界，并确认 UI 无引擎时不崩溃。

---

## 目标

1. `docs/implementation-status-v0.1.md` Engine 子系统条目：补充"v0.1 适配器已实现但未自动接线"的明确说明
2. 如果 UI 在无引擎时 Run 的 timeline/inspector 展示不合理（报错/空白/undefined），在组件层加 idle/waiting 状态兜底

---

## 前置人工确认（Codex 执行 C005 前，人工先做此验证）

1. 启动 Core（`pnpm dev:core`），不启动任何引擎适配器
2. 启动 App，连接 Core（HTTP 模式，C001 完成后）
3. 创建一个 Run（任意 template）
4. 确认以下内容：
   - Timeline 面板：有"run created"事件或合理的空态（不崩溃）
   - Inspector 面板：无 undefined/null 导致的渲染错误
   - Core RunMachine 处于 `waiting` 或 `idle` 状态（可通过 `GET /api/runs/:runId/inspector` 确认）
5. 把结果记录在此文档末尾的"验证结果"章节

---

## 文件清单（只改这些文件）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `docs/implementation-status-v0.1.md` | 修改 | Engine 子系统条目补充接线限制说明 |
| 若人工确认有崩溃：相关 timeline/inspector 组件 | 修改 | 加 null/empty guard 或 idle 状态展示 |

---

## implementation-status-v0.1.md 改动规格

在"Engine / CLI 适配"章节（第 8 节）的"已知缺口 / 限制"中，把现有的：
```
- 当前 Core 启动流程未见直接拉起这些适配器。
- 因此"创建 run 后默认启动真实引擎执行"不能当作现状。
```
更新为：
```
- Core 启动后不自动拉起引擎适配器（Claude/Codex）。引擎适配器需手动外部启动（见 README 引擎接入章节）。
- `create-run` 会创建 RunMachine 并进入 waiting 状态，但无引擎事件时不会有任何执行进展。
- UI timeline 在无引擎时展示 [此处填入人工验证结果：合理空态 / idle 提示 / 其他]。
- 完整的引擎自动注册与生命周期管理在 v0.2 中实现。

是否可视为 v0.1 完成：
- 适配器代码与测试已完成，可视为"引擎适配层已实现"。
- 端对端"UI创建run→引擎自动执行"流程未闭环，v0.2 补充。
```

---

## 可选 UI 改动（仅在人工确认有问题时做）

如果人工验证发现 timeline 在无引擎时展示崩溃或 undefined，在对应组件加：
- 空的 timeline：展示"等待引擎连接"或"Run 已创建，等待执行"的 empty state 文字
- 不需要独立组件，在已有的 `TimelinePane` 或 `WorkbenchEmptyState` 中加 `if runs.length > 0 && events.length === 0` 的 guard 即可

---

## 验收标准（DoD）

1. `docs/implementation-status-v0.1.md` Engine 条目有明确的接线限制说明和 v0.2 计划
2. 若有 UI 修改：`pnpm -w typecheck` 无新增类型错误，`pnpm --filter @do-what/app test` 通过
3. 无引擎时 Create Run → timeline 无 console.error，无 undefined 渲染错误

---

## 验证结果（人工填写，Codex 执行前必读）

> 此章节由人工执行前置验证后填写，Codex 根据结果决定是否需要 UI 改动。

- [ ] 已启动 Core（无引擎），创建 Run
- Timeline 展示：___________________
- Inspector 展示：___________________
- 是否有 console.error：___________________
- 是否需要 UI 改动：___________________

---

## 完成后更新

- [ ] `docs/archive/v0.1-closure/closure-overview.md` 中 C005 状态改为"已完成"
- [ ] `AGENTS.md` 当前阶段任务进度更新
