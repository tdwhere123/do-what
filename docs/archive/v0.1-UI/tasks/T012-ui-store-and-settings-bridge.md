# T012 · ui-store-and-settings-bridge（UI 本地态与 Settings Bridge）

**Epic:** v0.1-UI  
**分组:** State  
**依赖:** T001B  
**可并行:** 可与 T008、T009 并行  
**状态:** 待开始  

---

## 目标

落地 `uiStore` 与最小 `settingsQueryBridgeStore`，承载本地交互态、workspace draft 隔离与 settings interrupted draft。

---

## 明确前提

- 本任务承接 `T001A` 已拍板的状态栈结果，以及 `T001B` 建立的 Query client / Zustand 挂载点。
- Query-first 已明确由 TanStack Query 承担；本任务中的本地 UI 态与 bridge store 只负责 Zustand 侧最小职责。
- 本任务不再讨论 Redux、自研大一统 store 或其它未拍板的状态基础设施。

---

## 涉及文件/目录

```text
packages/app/src/stores/ui/
packages/app/src/stores/settings-bridge/
packages/app/src/selectors/
```

---

## 实现要点

- 维护布局、tab、modal、timelineViewMode、输入框草稿等纯本地状态。
- 按 `workspaceId` 隔离 `createRunDraftsByWorkspace`。
- 为 settings lease 打断场景预留 `interruptedDraft` 保存结构。
- `uiStore` / bridge store 的设计需贴合 `T001B` 建立的 Zustand 挂载位。
- 不把任何业务真相写进 uiStore。

---

## 验收标准

- [ ] Create Run 草稿按 workspace 隔离
- [ ] 切 workspace 不会串草稿
- [ ] lease 打断场景有本地草稿保存位
- [ ] uiStore 不承担业务控制态
- [ ] Query-first 与本地 UI store 的边界清晰

---

## 风险 / 注意事项

- bridge 容易做成第二套状态中心，必须保持最小化。
- 本地草稿与真实 query 值必须清晰分离。
- 不允许把 TanStack Query 的远端真相缓存重新复制进 Zustand。
