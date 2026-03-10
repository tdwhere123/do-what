# T034 · visual-parity-and-ui-design-source-cleanup（视觉对照与 UI 设计源清理）

**Epic:** v0.1-UI  
**分组:** 验收  
**依赖:** T013-T033  
**可并行:** 否  
**状态:** 待开始  

---

## 目标

完成与 `UI/` 参考稿的视觉对照、运行时资产迁移收尾，并在确认安全后清理临时 UI 设计源。

---

## 涉及文件/目录

```text
UI/
packages/app/src/assets/
packages/app/src/styles/
packages/app/src/components/
```

---

## 实现要点

- 对照 `UI-DESIGN-SPEC.md` 与三份 preview HTML 做视觉验收。
- 确认运行时代码所需 token、SVG、布局都已收编进 `packages/app`。
- 删除或归档无运行时用途的 `UI/` 临时设计源。
- 清理后保证仓库中不存在双份前端真相源。

---

## 验收标准

- [ ] 关键页面与参考稿完成视觉对照
- [ ] 运行时代码不再依赖 `UI/` 目录下的 HTML/CSS/SVG 文件
- [ ] 确认采用资产已迁入 `packages/app`
- [ ] 临时 UI 设计源清理发生在真实集成验证之后

---

## 风险 / 注意事项

- 过早清理 `UI/` 会让后续视觉回归失去参考基线。
- 必须先完成真实 Core 集成验证，再做最终清理。
