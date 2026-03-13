# C008 - 恢复 Empty 与 Sidebar 的 workspace-first 体验

**优先级：** P0  
**依赖：** C007  
**涉及范围：**

- `packages/app/src/components/sidebar/`
- `packages/app/src/pages/`
- `packages/app/src/lib/commands/`
- `UI/preview-empty.html`
- `UI/preview-active.html`
- `UI/UI-DESIGN-SPEC.md`

---

## 背景

在完成 App 壳结构后，第一批真正承载业务语义的 UI 不是中央主流区，而是 Empty 与 Sidebar：

- Empty 决定用户第一步是否理解“先打开工作区”
- Sidebar 决定 workspace tree 是否真的成立
- New Run 是否被正确挡在 workspace 之后，也由这两处决定

---

## 目标

1. 让 Empty 页面回到 workspace-first 的开始页语义。
2. 让左栏真正成为 workspace / run 的业务树，而不是装饰目录。
3. 让创建 workspace、选择 workspace、New Run 前置校验回到正确路径。

---

## 本任务必须完成

1. Empty 页面必须包含明确的 `打开工作区` 主动作。
2. 左栏必须展示真实的 workspace tree 与 run list 层级。
3. 添加工作区按钮 `+` 必须承担真实目录选择或等价创建入口。
4. `新建 Run` 在没有 workspace 时不得直接创建孤立 run。
5. New Run modal 可以打开，但在提交前必须校验 workspace 条件。
6. 当前选中 workspace 与左栏高亮、Empty / Active 页面状态保持一致。

---

## 本任务不包含

- 不恢复中央 Workbench 主流区的全部细节。
- 不完成 Settings 信息架构。
- 不处理所有占位按钮的最终禁用态。

---

## 验收标准（DoD）

1. 没有 workspace 时，用户会首先看到 `打开工作区` 的明确入口。
2. 创建或打开 workspace 后，左栏能反映真实 workspace 与 run 层级。
3. 没有 workspace 时，`新建 Run` 不会绕过约束直接创建 run。
4. 左栏与页面状态都遵循 workspace-first 语义。

---

## 完成后更新

- [ ] `closure-overview.md` 中 C008 状态改为“已完成”
- [ ] `AGENTS.md` 中收口任务进度同步
