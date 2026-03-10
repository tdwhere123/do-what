# T010 · pending-command-store（Pending Command Store）

**Epic:** v0.1-UI  
**分组:** State  
**依赖:** T006，T007，T008  
**可并行:** 可与 T011 前的其它任务并行  
**状态:** 待开始  

---

## 目标

落地 `pendingCommandStore` 与统一 command dispatcher，承载前端已发送命令的生命周期与 message optimistic tail 数据。

---

## 涉及文件/目录

```text
packages/app/src/stores/pending-command/
packages/app/src/lib/commands/
packages/app/src/selectors/
```

---

## 实现要点

- 统一生成 `clientCommandId`，记录 `entityType`、`entityId`、`runId`、`action`、`coreSessionIdAtSend`。
- 为 message 命令保存 `optimisticPayload` 与 `localSequence`，供 timeline 尾部渲染。
- 对象型命令记录 `reconcileTarget`，供后续 probe/refetch 使用。
- 所有真正发 command 的动作先经过 global lock 与 global memory guard。

---

## 验收标准

- [ ] 所有 command 都经过统一 dispatcher 与 pending store
- [ ] message optimistic 数据只来自 `pendingCommandStore`
- [ ] pending entry 能覆盖 pending / acked / failed / settled / desynced 生命周期
- [ ] Core 生命周期切换时能统一转 `COMMAND_CONNECTION_LOST`

---

## 风险 / 注意事项

- 命令类型覆盖 run / approval / memory / node / settings，多入口容易散落。
- 如果 `clientCommandId` 注入不统一，后续 causedBy 对齐会失效。
