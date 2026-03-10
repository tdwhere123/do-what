# T029 · settings-lease-interruption（Settings lease 打断保护）

**Epic:** v0.1-UI  
**分组:** Settings  
**依赖:** T008，T012，T028  
**可并行:** 否  
**状态:** 待开始  

---

## 目标

实现 dirty form 被 governance lease 打断时的 interrupted draft 保留、refresh 与用户提示。

---

## 涉及文件/目录

```text
packages/app/src/pages/settings/
packages/app/src/stores/settings-bridge/
packages/app/src/stores/hot-state/
```

---

## 实现要点

- 监听 `GovernanceLeaseUpdated` 并判断是否命中正在编辑的字段。
- 若命中 dirty form，先保存 `interruptedDraft`。
- 随后把字段切为 readonly / disabled，并 refresh 服务器值。
- 明确提示 `leaseId`、受锁字段、草稿未生效但已本地保留。

---

## 验收标准

- [ ] lease 打断 dirty form 时不会静默抹掉本地输入
- [ ] `interruptedDraft` 被保存且可供用户复制
- [ ] 锁定态与本地草稿保留提示可同时可见
- [ ] 该保护逻辑不依赖组件自行手写分支

---

## 风险 / 注意事项

- 字段粒度锁定映射复杂，bridge 需要保持最小但足够准确。
- 若 refresh 顺序不对，会造成用户先看到旧值被覆盖。
