# T008 · hot-state-store（控制态 Store）

**Epic:** v0.1-UI  
**分组:** State  
**依赖:** T006，T007  
**可并行:** 可与 T009、T012 并行  
**状态:** 待开始  

---

## 目标

落地 `hotStateStore` 与相关 selector，承载会直接影响控制区、禁用态与全局冻结态的状态。

---

## 涉及文件/目录

```text
packages/app/src/stores/hot-state/
packages/app/src/selectors/
packages/app/src/lib/events/
```

---

## 实现要点

- 维护 `revision`、`coreSessionId`、`connectionState`、`globalInteractionLock`。
- 维护 workspace/run/node/approval/governance/health 的 hot summary。
- 明确冻结规则：`disconnected | reconnecting` 或 `health.core !== healthy` 即锁交互。
- 只从 HTTP snapshot + SSE 更新，不从 projection 反推控制态。

---

## 验收标准

- [ ] 左栏、状态条、按钮禁用态只读 hot state
- [ ] Core 离线 / 重连时全局交互锁正确生效
- [ ] inactive run 的摘要更新不依赖 projection
- [ ] store 内不存在从 timeline/inspector 反推控制态的逻辑

---

## 风险 / 注意事项

- 当前 Core snapshot 字段明显少于前端目标，需要后续 T030 补齐。
- 热态必须稳定、轻量，不能混入富投影数据。
