# T032 · core-sse-envelope-and-event-alignment（SSE Envelope 与事件对齐）

**Epic:** v0.1-UI  
**分组:** Core API  
**依赖:** T030，T031  
**可并行:** 否  
**状态:** 待开始  

---

## 目标

让 Core SSE 输出满足前端所需的 `revision + coreSessionId + event + causedBy` envelope，并补齐系统事件/active projection 友好语义。

---

## 涉及文件/目录

```text
packages/core/src/server/sse.ts
packages/core/src/state/
packages/protocol/src/events/
```

---

## 实现要点

- SSE 输出从裸事件升级为可被前端稳定消费的 envelope。
- 尽量为关键状态变更补回 `causedBy.clientCommandId / ackId`。
- 补齐 `CoreSessionChanged`、health、projection lag 等前端关注事件。
- 确保 inactive run 可以只消费 summary 所需事件，而不用细粒度投影常驻。

---

## 验收标准

- [ ] SSE 事件可提供 `revision`、`coreSessionId`、`event` 包装
- [ ] 前端可优先用精确命中而不是 revision 猜测清 pending/overlay
- [ ] Core 生命周期切换能被前端稳定识别
- [ ] active projection 截断所需字段足够明确

---

## 风险 / 注意事项

- 现有 `/events` 还是裸 event，升级时要注意兼容已有开发路径。
- 如果 causedBy 回填过少，前端仍会大量落入 reconciling。
