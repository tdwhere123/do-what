# T021 · approval-card-and-cli-overlay（Approval 卡片与 CLI 风格审批区）

**Epic:** v0.1-UI  
**分组:** Approval  
**依赖:** T008，T010，T011，T013  
**可并行:** 可与 T022 并行  
**状态:** 待开始  

---

## 目标

实现 Approval Card / Popover，以及输入框上方的 CLI 风格审批操作区。

---

## 涉及文件/目录

```text
packages/app/src/components/approval/
packages/app/src/components/timeline/
packages/app/src/stores/hot-state/
```

---

## 实现要点

- 审批 UI 读取 hotStateStore、pendingCommandStore、ackOverlayStore。
- 支持 allow once / allow in session / reject 等决策。
- 冻结态下禁用审批动作但保留浏览。
- 审批相关 desynced 必须直接在卡片上暴露恢复动作。

---

## 验收标准

- [ ] 审批卡可完整展示 pending / acked / desynced / settled 相关状态
- [ ] 输入框上方存在 CLI 风格操作区
- [ ] 审批动作统一走 command dispatcher
- [ ] desynced 审批卡提供 `Retry Sync` 与 `Dismiss / Rollback`

---

## 风险 / 注意事项

- 视觉稿只给了局部审批样式，完整状态机展示仍需补齐。
- 审批卡若直接读 projection 决定控制态，会破坏分层。
