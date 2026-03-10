# T004 · design-tokens-and-theme-base（设计 token 与基础主题）

**Epic:** v0.1-UI  
**分组:** Foundation  
**依赖:** T001B  
**可并行:** 可与 T003 并行  
**状态:** 待开始  

---

## 目标

把 `UI/` 中确认采用的颜色、字体、按钮、卡片、徽章、空状态规范迁入 `packages/app` 的正式样式体系。

---

## 明确前提

- 本任务承接 `T001A` 已拍板的样式载体结果，以及 `T001B` 建立的 `packages/app/src/styles/` 挂载点。
- 样式系统已经明确为“全局 design token + CSS Modules”，不再把样式载体保持为待确认项。
- 本任务只迁移真相源允许的正式 token / theme 基线，不把视觉参考稿提升为架构决策源。

---

## 涉及文件/目录

```text
UI/UI-DESIGN-SPEC.md
UI/styles.css
packages/app/src/styles/
```

---

## 实现要点

- 迁移暖纸质感主题、基础色票、状态色、Soul 层色。
- 建立字体、字号阶梯、按钮、徽章、卡片、动画偏好等基础 token。
- 样式系统按“全局 design token + CSS Modules”落地，不引入新的样式载体分支。
- 样式系统只收“运行时需要的正式 token”，不把参考 HTML 整包照搬。

---

## 验收标准

- [ ] `packages/app` 内存在正式 token / theme 基线
- [ ] 运行时样式不再依赖 `UI/*.html`
- [ ] 状态色、Soul 色、按钮/卡片/徽章规范已可复用
- [ ] 与真相源不冲突的视觉要素才被迁移
- [ ] token 与 CSS Modules 的职责边界清晰

---

## 风险 / 注意事项

- 视觉稿覆盖范围小于功能真相源，不能让样式文档反客为主。
- 暗色模式仍不在本轮范围内。
- 不允许在本任务里把样式系统重新改回 Tailwind、CSS-in-TS 或其它未拍板方案。
