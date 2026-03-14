# C007 - 恢复 App 壳结构并剥离展示舞台

**优先级：** P0  
**依赖：** C006  
**涉及范围：**

- `packages/app/src/app/`
- `packages/app/src/assets/`
- `packages/app/src/components/`
- `packages/app/src/styles/`
- `UI/preview-active.html`
- `UI/preview-empty.html`
- `UI/preview-settings.html`
- `UI/styles.css`
- `UI/UI-DESIGN-SPEC.md`
- `UI/svg/`

---

## 背景

在进入具体页面实现前，必须先把 App shell 级结构拉回正轨。  
当前实现最容易犯的错误不是缺一个按钮，而是把 preview 的展示舞台误做进 App 本体，并在壳结构上继续自由发挥。

---

## 目标

1. 恢复 App 本体的壳结构，而不是复刻展示舞台。
2. 固定品牌、图标来源和页面框架。
3. 为 C008-C010 提供稳定的页面承载骨架。

---

## 本任务必须完成

1. 按 preview 与 `UI/UI-DESIGN-SPEC.md` 恢复 App shell 的基础框架。
2. 明确剥离外层展示舞台：
   - 外层灰棕背景不是 App 内部背景
   - 外层留白和阴影不进入产品布局语义
3. 顶栏品牌固定为纯文字 `do-what`。
4. 设计源图标来自 `UI/svg/`，但运行时 SVG 必须迁入 `packages/app/src/assets/`。
5. 不得把 `UI/` 当成运行时资源目录，也不得在运行时代码中直接引用 `UI/svg/**`。
6. 为 Active / Empty / Settings 三类页面建立正确的外壳容器与区域边界。

---

## 本任务不包含

- 不完成 Empty、Sidebar、Workbench、Settings 的全部业务细节。
- 不实现所有最终交互。
- 不在本任务中处理占位按钮策略。

---

## 验收标准（DoD）

1. Electron 窗口内显示的是 App 本体，而不是 preview 外层展示舞台。
2. Active / Empty / Settings 三类页面都有稳定的壳结构承载。
3. 品牌仍为纯文字 `do-what`。
4. 运行时 SVG 仅位于 `packages/app/src/assets/`，且设计源可追溯到 `UI/svg/`。

---

## 完成后更新

- [x] `closure-overview.md` 中 C007 状态改为“已完成”
- [x] `AGENTS.md` 中收口任务进度同步
