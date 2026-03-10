# T028 · settings-query-tabs（Settings 五个 Tab 与 Query 读取）

**Epic:** v0.1-UI  
**分组:** Settings  
**依赖:** T006，T012，T013  
**可并行:** 可与 T029 并行  
**状态:** 待开始  

---

## 目标

实现 Settings 页面五个 tab 的 Query-first 读写结构与只读/禁用基础态。

---

## 明确前提

- 本任务承接 `T001A` 已拍板结果，以及 `T001B` / `T013` 已建立的页面、路由与 provider 骨架。
- Settings 页面在 Electron 下采用 `React Router + HashRouter` 正式路由模式，例如 `#/settings`，而不是局部 view state 切换。
- Query-first 已由 TanStack Query 定案；本任务不再重新讨论状态库或路由模式。

---

## 涉及文件/目录

```text
packages/app/src/pages/settings/
packages/app/src/components/settings/
packages/app/src/lib/core-http-client/
```

---

## 实现要点

- 按 Engines / Soul / Policies / Environment / Appearance 五个 tab 组织。
- 每个 tab 以 query 为主读取，以 patch/post 为主写入。
- Settings 页面作为 HashRouter 页面路由落点，而不是嵌在 Workbench 里的隐式子视图。
- 租约锁定字段先展示 readonly / disabled 状态。
- Settings 页面不在组件内部直接处理业务写状态。

---

## 验收标准

- [ ] Settings 五个 tab 有稳定页面结构
- [ ] Settings 作为 HashRouter 页面可独立进入
- [ ] 读取链路以 Query-first 为主
- [ ] 被治理租约锁定的字段可见且只读
- [ ] 设置页组件不直接持有业务真相

---

## 风险 / 注意事项

- settings API 尚未齐全，前期需要 mock + adapter。
- 若在组件层积累太多本地业务状态，后续 lease 打断会很难处理。
- 不允许把 Settings 退回成无正式路由的局部面板实现。
