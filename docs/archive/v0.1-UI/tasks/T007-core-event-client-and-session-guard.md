# T007 · core-event-client-and-session-guard（SSE 客户端与会话守卫）

**Epic:** v0.1-UI  
**分组:** Foundation  
**依赖:** T001B，T002  
**可并行:** 可与 T006 并行  
**状态:** 待开始  

---

## 目标

建立统一 SSE client、事件规范化流程与 `coreSessionId` 生命周期守卫。

---

## 明确前提

- 本任务承接 `T001A` 已拍板结果，以及 `T001B` 建立的 renderer 启动链与应用级 provider / store 挂载位。
- 事件分发最终要落到 TanStack Query + Zustand 并存的前端状态骨架上，而不是临时散落在组件内。
- Electron 下页面导航已固定为 `React Router + HashRouter`，事件层不再为其它路由模式设计分叉行为。

---

## 涉及文件/目录

```text
packages/app/src/lib/core-event-client/
packages/app/src/lib/core-session-guard/
packages/app/src/lib/events/
```

---

## 实现要点

- SSE 连接只允许一条主事件管线：`SSE -> normalizeEvent -> dispatchToStores`。
- 统一管理 `connecting / connected / disconnected / reconnecting`。
- 提取 `coreSessionId`、`revision`、`causedBy`、`runId`、`workspaceId` 等前端关键字段。
- 一旦识别 Core 生命周期切换，通知 pending/overlay 进入统一清理逻辑。
- 事件入口需能直接接入 `T001B` 建立的 store / provider 挂载点。

---

## 验收标准

- [ ] 组件不自行监听 SSE
- [ ] 事件进入前端后先规范化，再分发到 store
- [ ] `coreSessionId` 变化能够被统一捕获
- [ ] 断线 / 重连 / Core 重启路径有明确守卫
- [ ] SSE client 可被应用级 bootstrap 稳定复用

---

## 风险 / 注意事项

- 当前 Core `/events` 输出还是裸事件，后续需与 T032 对齐。
- `normalizeEvent` 只做兼容与抽取，不做业务推理。
- 不允许在本任务中绕开统一事件入口，临时把 SSE 绑定进页面组件。
