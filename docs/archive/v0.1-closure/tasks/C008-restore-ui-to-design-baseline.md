# C008 — 按 `UI/` 恢复 Workbench / Empty / Settings 基线

**优先级：** P0（必须，当前前端观感与信息层级已偏离）
**涉及范围：**
- `packages/app/src/app/`
- `packages/app/src/components/`
- `packages/app/src/pages/`
- `packages/app/src/styles/`
- `UI/preview-active.html`
- `UI/preview-empty.html`
- `UI/preview-settings.html`
- `UI/UI-DESIGN-SPEC.md`

**注意：** `UI/` 是设计真相源，只读参考，不要把偏离现状继续当成目标。

---

## 背景

你已把之前的 UI 基线重新放回项目目录，但当前 React/Electron 前端与该基线存在明显偏差：

- 主界面布局、信息密度、层级和交互入口已明显变化
- Sidebar、Timeline、右侧信息栏、Settings 结构都与设计稿不一致
- 这不是简单视觉细节问题，而是产品已经失去原本的信息架构

收口阶段不能继续以“当前代码长什么样”为准，而要回到已恢复的设计基线。

---

## 目标

1. 以前端目录 `UI/` 为准，恢复 Workbench / Empty / Settings 的结构骨架
2. 恢复关键业务入口、信息分区和视觉层级，而不是只做样式微调
3. 让 UI 再次成为 v0.1 产品定义的一部分，而不是临时壳子

---

## 本任务必须完成

1. 以 `UI/preview-active.html` 为基线，恢复 Workbench 主界面结构：
   - 顶部栏
   - 左侧 workspace / run 区域
   - 中央 timeline / feed 区域
   - 右侧 files / plan / git-collab 信息区
2. 以 `UI/preview-empty.html` 为基线，恢复无 workspace / 无 run 时的空态结构和入口
3. 以 `UI/preview-settings.html` 为基线，恢复 Settings 的布局分区、卡片层次和页内组织方式
4. 关键入口必须与设计基线对齐：
   - 创建 workspace 入口
   - 创建 run 入口
   - Settings 入口
   - 状态区入口
5. 若当前组件层次无法支撑基线结构，允许拆分/重组 `packages/app` 前端组件
6. 任务卡实现时必须先做一次“现状页面 vs `UI/` 基线”的对照清单，避免只改颜色和字号

---

## 本任务不包含

- 不要求一次补齐所有动效、悬停细节和像素级装饰
- 不要求一次补齐所有 Soul / 协作浮层的最终行为
- 不要求一次解决所有数据源问题；本任务优先恢复结构与入口

---

## 验收标准（DoD）

1. Workbench 页面整体结构与 `UI/preview-active.html` 一致，不再只保留一个简化版骨架
2. 空态页面与 `UI/preview-empty.html` 的入口和层级一致
3. Settings 页面整体布局与 `UI/preview-settings.html` 的分区一致
4. 代码评审时可以逐段指出哪些区域已回到 `UI/` 基线，不能再用“整体看起来差不多”作为验收

---

## 人工严苛验收标准

- [ ] 打开 Workbench，与 `UI/preview-active.html` 逐区域对比：顶部栏 / 左侧 workspace-run 区 / 中央 timeline / 右侧信息区，**四个区域都能识别出对应结构**，不接受”整体看起来差不多”
- [ ] 必须能逐一指出每个区域对应设计稿的哪个部分
- [ ] 空态页面有明显”创建 workspace”入口，与 `UI/preview-empty.html` 布局方向一致
- [ ] Settings 页面切换 3 个以上 tab，内容**明显不同**，不出现高度同质化
- [ ] Settings 布局与 `UI/preview-settings.html` 主分区一致（分区命名和大结构吻合）
- [ ] `pnpm -w test` 全通过（不允许因本任务导致新的 FAIL）

## 完成后更新

- [ ] `closure-overview.md` 中 C008 状态改为”已完成”
- [ ] `AGENTS.md` 中收口任务进度同步

