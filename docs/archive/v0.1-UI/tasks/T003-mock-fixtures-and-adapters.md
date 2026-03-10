# T003 · mock-fixtures-and-adapters（Mock 基线与适配器）

**Epic:** v0.1-UI  
**分组:** Foundation  
**依赖:** T002  
**可并行:** 可与 T004 并行  
**状态:** 待开始  

---

## 目标

建立 mock-first 开发基线，让 `packages/app` 可以在真实 Core 接口未齐备前先跑通 UI 骨架与状态流。

---

## 涉及文件/目录

```text
packages/app/src/lib/mocks/
packages/app/src/test/fixtures/
packages/app/src/lib/template-registry/
```

---

## 实现要点

- 提供 workbench snapshot、timeline page、inspector、settings、SSE event fixture。
- 提供 `TemplateDescriptor[]` 的 adapter 与 fixture。
- fixture 要覆盖 active run、empty state、approval、memory、lease lock、desynced 等典型场景。
- 保证 mock 与 contract 同源，而不是手写第二套野生结构。

---

## 验收标准

- [ ] UI 可在无真实 Core 条件下跑通主要页面状态
- [ ] fixture 覆盖 create run / timeline / approval / settings / soul 基本场景
- [ ] template descriptor 的 mock 结构与 contract 一致
- [ ] mock 与 real API 切换时不需要重写组件读源

---

## 风险 / 注意事项

- fixture 容易随真实 Core 漂移，必须只从 T002 契约生成或映射。
- 本任务只提供 mock 基线，不替代真实 Core 集成。
