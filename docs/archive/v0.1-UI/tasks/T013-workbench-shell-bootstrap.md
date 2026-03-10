# T013 · workbench-shell-bootstrap（Workbench Shell 与 Bootstrap）

**Epic:** v0.1-UI  
**分组:** Workbench  
**依赖:** T005-T012  
**可并行:** 否  
**状态:** 待开始  

---

## 目标

建立 AppShell / WorkbenchPage 的首屏骨架，接通 session token 初始化、snapshot bootstrap 与 SSE 启动链。

---

## 明确前提

- 本任务必须承接 `T001A` 已拍板结果与 `T001B` 建立的正式工程骨架，不再对 runtime / scaffold 保持中立。
- 页面壳层运行在 `React Router + HashRouter` 下，Workbench 应作为正式页面路由承载，而不是临时条件分支视图。
- Query client、Zustand 挂载点、全局 design token 与 CSS Modules 基础样式都应被视为既有前提，而不是在本任务里再次决定。

---

## 涉及文件/目录

```text
packages/app/src/app/
packages/app/src/pages/workbench/
packages/app/src/components/layout/
```

---

## 实现要点

- 提供三栏布局与 Workbench 路由落点。
- 应用启动时读取 session token，初始化 HTTP/SSE client。
- 首屏先拉 workbench snapshot，再建立事件订阅。
- 为 loading、offline、error、frozen banner 留出固定壳层。
- Bootstrap 流程需直接接入 `T001B` 提供的 React 入口、HashRouter、Query client 与 Zustand store 挂载位。

---

## 验收标准

- [ ] Workbench 页面可完成 bootstrap
- [ ] 首屏初始化顺序清晰：token -> snapshot -> SSE
- [ ] 布局壳层不依赖真实业务细节即可渲染
- [ ] 全局冻结提示有稳定挂载位
- [ ] Workbench 已作为 HashRouter 页面壳层稳定挂载

---

## 风险 / 注意事项

- 本任务不再讨论工具链与路由模式，只承接 `T001A/T001B` 已确定结果。
- bootstrap 逻辑不能提前混入页面级业务判断。
- 若后续页面结构要调整，应通过显式文档变更，而不是在 bootstrap 层隐式改写路由前提。
