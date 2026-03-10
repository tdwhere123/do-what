# T018 · timeline-data-model-and-pagination（Timeline 数据模型与分页）

**Epic:** v0.1-UI  
**分组:** Timeline  
**依赖:** T009，T013  
**可并行:** 可与 T021 并行  
**状态:** 待开始  

---

## 目标

落实 timeline projection 数据模型、HTTP 分页、loadedRange 结构与最新一页优先策略。

---

## 涉及文件/目录

```text
packages/app/src/components/timeline/
packages/app/src/stores/projection/
packages/app/src/lib/core-http-client/
```

---

## 实现要点

- timeline 默认只加载最新一页。
- 历史翻页统一走 `beforeRevision + limit`。
- 为 merged timeline、nodeThreads、laneOrder、markers 预留正式结构。
- 分页状态与 optimistic tail 明确分层，不互相污染。

---

## 验收标准

- [ ] Timeline 首屏不回传整条历史
- [ ] 向上翻页只影响头部历史
- [ ] projection 中存在 `hasMoreBefore`、`nextBeforeRevision`、`loadedRange`
- [ ] timeline 数据模型可同时支撑 merged 与 threaded 视图

---

## 风险 / 注意事项

- Core timeline API 目前未落地，前期只能依赖 mock。
- 如果分页与 optimistic tail 混在一起，后续排序会很难收。
