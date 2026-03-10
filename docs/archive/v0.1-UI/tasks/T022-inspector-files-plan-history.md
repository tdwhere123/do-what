# T022 · inspector-files-plan-history（右栏 Files / Plan / History）

**Epic:** v0.1-UI  
**分组:** Inspector  
**依赖:** T009，T013  
**可并行:** 可与 T021、T023 并行  
**状态:** 待开始  

---

## 目标

实现右栏 Files、Plan、History 三个基础 projection 区块。

---

## 涉及文件/目录

```text
packages/app/src/components/inspector/
packages/app/src/stores/projection/
packages/app/src/selectors/
```

---

## 实现要点

- Files 展示 changed files 与增删摘要。
- Plan 展示 todo/checklist 投影。
- History 展示 run 级历史摘要。
- 区块本身只消费 projection，不反推控制态。

---

## 验收标准

- [ ] 右栏基础区块可独立渲染
- [ ] Files / Plan / History 只读 projection
- [ ] 空状态有明确落脚点
- [ ] 切换 run 时可由 projection refetch 驱动更新

---

## 风险 / 注意事项

- History projection 细节较弱，可能需要先以最小摘要落地。
- 如果把 hot state 混进 inspector 细节，会让职责边界变脏。
