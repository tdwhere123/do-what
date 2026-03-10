# T005 · svg-icon-and-empty-assets（SVG 图标与空状态资产）

**Epic:** v0.1-UI  
**分组:** Foundation  
**依赖:** T004  
**可并行:** 可与 T006 并行  
**状态:** 待开始  

---

## 目标

把 `UI/svg/` 中需要的图标、装饰元素、空状态素材封装为 `packages/app` 的正式运行时资产。

---

## 涉及文件/目录

```text
UI/svg/
packages/app/src/assets/
packages/app/src/components/icons/
```

---

## 实现要点

- 按导航、状态、动作、Soul、空状态等分类迁移 SVG。
- 小图标统一封装为可接受 `size` / `className` 的组件，并支持 `currentColor`。
- 装饰性大 SVG 与空状态图保持可控目录结构。
- 剔除无运行时用途、无真相源支持的冗余素材。

---

## 验收标准

- [ ] 图标组件可被页面直接复用
- [ ] 小图标默认可通过 `currentColor` 控色
- [ ] 空状态素材目录清晰，不再散落在 `UI/svg`
- [ ] 运行时不再依赖裸 `<img src="UI/svg/...">`

---

## 风险 / 注意事项

- `UI/svg` 资产量大，必须只迁移实际采用的最小集合。
- 装饰素材不能抢占功能信息层次。
