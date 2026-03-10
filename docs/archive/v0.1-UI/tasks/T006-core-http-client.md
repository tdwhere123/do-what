# T006 · core-http-client（Core HTTP Client）

**Epic:** v0.1-UI  
**分组:** Foundation  
**依赖:** T001B，T002  
**可并行:** 可与 T005 并行  
**状态:** 待开始  

---

## 目标

建立统一的 Core HTTP client，收口鉴权、query、command、错误解包与重试边界。

---

## 明确前提

- 本任务承接 `T001A` 已拍板结果，以及 `T001B` 建立的 renderer 入口、provider 挂载位与 `packages/app/src/lib/` 工程边界。
- Query 侧采用 TanStack Query，客户端能力需能被页面 query / mutation 层统一复用。
- 路由模式已经固定为 `React Router + HashRouter`，本任务不再为 BrowserRouter / MemoryRouter 预留额外分支。

---

## 涉及文件/目录

```text
packages/app/src/lib/core-http-client/
packages/app/src/lib/auth/
packages/app/src/lib/commands/
```

---

## 实现要点

- 统一注入 `Authorization: Bearer <core_session_token>`。
- 统一处理 snapshot/query/command 的请求与响应包装。
- 统一暴露 settings query、timeline query、inspector query、command post 等调用入口。
- 组件层禁止直接 `fetch` Core 业务接口。
- client 设计需能直接接入 `T001B` 建立的 Query client / renderer provider 骨架。

---

## 验收标准

- [ ] 组件不直接请求 Core 业务接口
- [ ] 所有 HTTP 响应都经统一 client 解包
- [ ] command 与 query 的错误处理边界一致
- [ ] client 保留 mock / real Core 切换能力
- [ ] Query 层可在不绕过统一 client 的前提下复用这些调用入口

---

## 风险 / 注意事项

- 真实 `/api/*` 路径尚未全部落地，client 需要先支持 mock adapter。
- 本任务只定义客户端边界，不补 Core 路由本身。
- 不允许在本任务里重新发明独立于 `T001B` provider 骨架之外的请求层。
