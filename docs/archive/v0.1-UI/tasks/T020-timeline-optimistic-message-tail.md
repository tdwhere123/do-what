# T020 · timeline-optimistic-message-tail（Message optimistic tail）

**Epic:** v0.1-UI  
**分组:** Timeline  
**依赖:** T010，T011，T018  
**可并行:** 否  
**状态:** 待开始  

---

## 目标

实现 message optimistic tail、`localSequence` 排序与 `desynced` 行内恢复动作，且严格禁止 message 进入 `ackOverlayStore`。

---

## 涉及文件/目录

```text
packages/app/src/components/timeline/
packages/app/src/stores/pending-command/
packages/app/src/stores/ack-overlay/
```

---

## 实现要点

- Timeline 尾部 optimistic 项只从 `pendingCommandStore` 读取。
- 按 `localSequence -> createdAt` 排序 optimistic tail。
- `pending / acked / desynced` 三种视觉态要可区分。
- 一旦收到精确命中真实事件，立即移除对应 optimistic tail。

---

## 验收标准

- [ ] message 不进入 `ackOverlayStore`
- [ ] 向上翻页不会打乱尾部 optimistic tail
- [ ] desynced message 行内提供 `Retry Sync` 与 `Dismiss / Rollback`
- [ ] 真实事件命中后 optimistic tail 可被精确清理

---

## 风险 / 注意事项

- 若 SSE 精确命中缺失，message tail 会长期残留。
- 若乐观消息和历史分页混层，排序会失真。
