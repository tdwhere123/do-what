# T024 · governance-checkpoint-panels（Governance / Checkpoint 面板）

**Epic:** v0.1-UI  
**分组:** Governance  
**依赖:** T010，T011，T022  
**可并行:** 可与 T023、T025 并行  
**状态:** 待开始  

---

## 目标

实现右栏 Governance 与 Checkpoint 面板，承载 lease、native surface report、pending/recent checkpoint 信息。

---

## 涉及文件/目录

```text
packages/app/src/components/governance/
packages/app/src/components/checkpoint/
packages/app/src/stores/projection/
```

---

## 实现要点

- Governance 面板显示 leaseStatus、native surface report、治理摘要。
- Checkpoint 面板显示 pending / recent checkpoint 列表。
- 对象型操作统一走 pending/overlay/reconciliation 管线。
- 面板只展示与当前 selected run 相关的富投影。

---

## 验收标准

- [ ] Governance 与 Checkpoint 有独立面板落点
- [ ] lease 与 native surface report 可见
- [ ] checkpoint pending/recent 可区分展示
- [ ] 相关操作能够接入统一 command 生命周期

---

## 风险 / 注意事项

- 现有视觉稿没有完整 governance/checkpoint 稿件，需要按真相源补壳。
- 字段缺失时要允许 panel 降级为空摘要。
