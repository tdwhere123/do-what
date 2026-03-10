# T023 · inspector-collaboration-and-git（右栏协作与 Git 视图）

**Epic:** v0.1-UI  
**分组:** Inspector  
**依赖:** T022  
**可并行:** 可与 T024 并行  
**状态:** 待开始  

---

## 目标

实现右栏 Git Tree / CLI Cluster / 协作切换区块。

---

## 涉及文件/目录

```text
packages/app/src/components/inspector/
packages/app/src/stores/projection/
packages/app/src/stores/ui/
```

---

## 实现要点

- 以单一右栏区块承载 Git 与协作双模式视图。
- Git 视图展示分支、tree、diff summary。
- 协作视图展示参与节点、角色、最近动作、交接关系。
- toggle 只属于 UI 本地态，不改变 projection 结构。

---

## 验收标准

- [ ] Git 与协作视图在同一块内切换
- [ ] 视图切换不触发额外业务写操作
- [ ] 协作节点信息可与 projection 同步更新
- [ ] 空状态与无并行场景有独立展示

---

## 风险 / 注意事项

- 真实 Git / 协作数据结构尚未完全定型。
- 右栏 toggle 若耦合到底层 query，会让交互变重。
