# T030 · core-api-snapshot-and-query-surface（Core 查询面）

**Epic:** v0.1-UI  
**分组:** Core API  
**依赖:** T002  
**可并行:** 可与 T031 前半并行  
**状态:** 待开始  

---

## 目标

在 Core 侧补齐 UI 所需的查询面：workbench snapshot、template registry、timeline、inspector、settings。

---

## 涉及文件/目录

```text
packages/core/src/server/
packages/core/src/protocol/
packages/protocol/src/
```

---

## 实现要点

- 提供 `/api/workbench/snapshot`。
- 提供 `/api/workflows/templates`。
- 提供 `/api/runs/:runId/timeline` 与 `/api/runs/:runId/inspector`。
- 提供 `/api/settings/*` 查询与 patch/recheck 基础接口。

---

## 验收标准

- [ ] UI 主要查询面在 Core 中有正式路由落点
- [ ] query 结果能直接映射到 T002 契约
- [ ] timeline 查询支持分页参数
- [ ] settings 查询面支持后续租约联动

---

## 风险 / 注意事项

- 当前 Core 仅有 `/state`、`/events`、`/soul/*`，缺口较大。
- 不能为了 UI 方便破坏 Core 单一真相源。
