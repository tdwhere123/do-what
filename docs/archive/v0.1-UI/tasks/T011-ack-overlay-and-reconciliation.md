# T011 · ack-overlay-and-reconciliation（Ack Overlay 与协调恢复）

**Epic:** v0.1-UI  
**分组:** State  
**依赖:** T009，T010  
**可并行:** 否  
**状态:** 待开始  

---

## 目标

落地对象型 `ackOverlayStore`、延迟协调 GC、`reconciling`、probe/refetch 与 `desynced` 自愈出路。

---

## 涉及文件/目录

```text
packages/app/src/stores/ack-overlay/
packages/app/src/lib/reconciliation/
packages/app/src/lib/commands/
```

---

## 实现要点

- Ack Overlay 只服务对象型 UI 单元，不接 message。
- `revision >= ack.revision` 只能把 overlay 转入 `reconciling`，不能静默删除。
- `reconciling` 必须按 `reconcileTarget` 触发对象级 probe 或 run 级 refetch。
- `desynced` 必须显式提供 `Retry Sync` 与 `Dismiss / Rollback`。

---

## 验收标准

- [ ] message 不进入 `ackOverlayStore`
- [ ] overlay 超时不会被静默删除
- [ ] `reconciling` 与 `desynced` 状态对用户可见
- [ ] 每条同步异常都有可执行的恢复动作

---

## 风险 / 注意事项

- 对象 probe API 未就绪前，reconciliation 只能降级为 run 级 refetch。
- 如果 desynced 没有可见落脚点，用户会误判操作失败。
