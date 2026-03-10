# T009 · projection-store（Projection Store）

**Epic:** v0.1-UI  
**分组:** State  
**依赖:** T006，T007  
**可并行:** 可与 T008、T012 并行  
**状态:** 待开始  

---

## 目标

落地 `projectionStore`，承载 timeline、inspector、soul 等富视图投影，并实现 active projection 截断原则。

---

## 涉及文件/目录

```text
packages/app/src/stores/projection/
packages/app/src/selectors/
packages/app/src/lib/events/
```

---

## 实现要点

- 维护 `runTimelines`、`runInspectors`、`soulPanels`、`mountedRunIds`。
- 只为 active / mounted run 合并细粒度 projection 事件。
- inactive run 只允许更新 summary / hot state，不灌 token chunk、changed files diff、plan diff。
- 为 timeline 分页保留 `hasMoreBefore`、`nextBeforeRevision`、`loadedRange`。

---

## 验收标准

- [ ] projection 只服务富视图，不驱动控制按钮
- [ ] inactive run 不常驻细粒度 projection merge
- [ ] mounted run 数量有明确上限
- [ ] timeline / inspector / soul projection 的结构可独立 refetch

---

## 风险 / 注意事项

- 若 active projection 截断做错，后台 run 会把前端内存养胖。
- 该 store 允许延迟，但不允许被当成控制态真相。
