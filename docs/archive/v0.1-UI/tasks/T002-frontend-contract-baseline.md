# T002 · frontend-contract-baseline（前端共享契约基线）

**Epic:** v0.1-UI  
**分组:** Foundation  
**依赖:** T001B  
**可并行:** 否  
**状态:** 待开始  

---

## 目标

把 `frontend_backend_contract_v0.1.md` 与 `workbench_state_model_v0.1.md` 收敛为前端可直接消费的共享 contract/type 基线，避免 UI 直接猜接口。

---

## 明确前提

- 本任务承接 `T001A` 已拍板结果，以及 `T001B` 建立的 `packages/app` 正式工程骨架。
- Electron + React + TypeScript、Vite、Electron Forge + Vite 插件、Electron Forge makers、React Router + HashRouter、TanStack Query + Zustand、全局 design token + CSS Modules 都不再属于待确认项。
- 本任务只固化前后端契约，不重新讨论 runtime / scaffold 方向。

---

## 涉及文件/目录

```text
packages/protocol/src/
packages/app/src/lib/
docs/INTERFACE_INDEX.md
```

---

## 实现要点

- 固化 workbench snapshot、timeline query、inspector query、settings query 的返回形状。
- 固化 command、ack、probe、error code、SSE envelope 的前端消费类型。
- 保留与现有 protocol/core 类型的映射层，不强行改写真相源职责边界。
- 类型入口与 adapter 落点需贴合 `T001B` 建立的 `packages/app` 目录与 provider 结构，而不是继续保持工具链悬空。
- 如有接口新增/变更，同步标注到 `docs/INTERFACE_INDEX.md`。

---

## 验收标准

- [ ] 前端不再直接依赖裸 JSON 结构
- [ ] snapshot/query/command/SSE/probe/error code 有统一类型入口
- [ ] contract 中明确 `Core 是唯一真相源`
- [ ] 接口变更点已在 `docs/INTERFACE_INDEX.md` 记录

---

## 风险 / 注意事项

- 现有 `packages/protocol/src/core/*` 与文档建议命名并不完全一致，需走映射而不是硬替换。
- 本任务不能发明文档外的新架构，只能把既有文档收成可实现契约。
- 不允许把 runtime / scaffold 决策重新带回本任务讨论。
