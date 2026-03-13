# C009 - 恢复 Active / Workbench 主页面

**优先级：** P0  
**依赖：** C008  
**涉及范围：**

- `packages/app/src/pages/workbench/`
- `packages/app/src/components/`
- `packages/app/src/stores/`
- `UI/preview-active.html`
- `UI/UI-DESIGN-SPEC.md`

---

## 背景

只有在 Empty 与 Sidebar 已回到正确业务语义后，恢复 Active / Workbench 主页面才有意义。  
否则很容易出现“界面看起来像了，但输入区、右栏、run 绑定关系仍然是假”的情况。

---

## 目标

1. 按 preview 恢复 Workbench 的中央主流区和右栏结构。
2. 保证输入区、发送按钮、timeline、右栏都绑定到当前 workspace / run。
3. 不允许假发送、错绑 run、只高亮不切页等伪完成。

---

## 本任务必须完成

1. 恢复 Workbench 的主结构：
   - 中央主流区
   - 右侧信息区
   - 输入区
2. 中央区只承载与当前 run 相关的消息、工具调用、审批和结果。
3. 右栏按 preview 恢复已修改文件、计划、Git / 协作结构。
4. 主输入框必须绑定当前 run；无活跃 run 时禁用或提示。
5. 发送按钮必须和 workspace、run、engine 状态联动，不允许假发送。

---

## 本任务不包含

- 不重建 Settings 页面。
- 不在本任务中处理所有未实现按钮的最终占位策略。
- 不替代 C013 的最终 fidelity 审查。

---

## 验收标准（DoD）

1. Workbench 的中央区、右栏和输入区都明显回到 preview 结构。
2. 左栏切换 run 后，中央与右栏同步切换。
3. 无活跃 run 或引擎不可用时，发送按钮表现诚实可解释。
4. 不出现只切高亮、不切内容的伪切换。

---

## 完成后更新

- [ ] `closure-overview.md` 中 C009 状态改为“已完成”
- [ ] `AGENTS.md` 中收口任务进度同步
