# T015 · workbench-empty-states（空工作台与右栏 idle 态）

**Epic:** v0.1-UI  
**分组:** Workbench  
**依赖:** T005，T013  
**可并行:** 可与 T014 并行  
**状态:** 待开始  

---

## 目标

实现无活跃 Run 时的空工作台、右栏 Overview/History idle 区块与空状态文案。

---

## 涉及文件/目录

```text
packages/app/src/components/empty/
packages/app/src/components/layout/
packages/app/src/pages/workbench/
```

---

## 实现要点

- 对齐真相源与视觉稿中的空工作台布局。
- 实现右栏 idle 的 Overview / History 两块。
- 复用 T005 迁移的空状态资产，不新增第二套素材。
- 空态下保留 New Run 等入口位。

---

## 验收标准

- [ ] 无活跃 run 时布局稳定且可交互
- [ ] 右栏 idle 区块可独立展示
- [ ] 空状态文案与真相源职责不冲突
- [ ] 空态不依赖 timeline / inspector projection

---

## 风险 / 注意事项

- History 的真实数据来源较弱，初期可能只能展示轻摘要或占位。
- 空状态不能偷偷承载未定义的新功能。
