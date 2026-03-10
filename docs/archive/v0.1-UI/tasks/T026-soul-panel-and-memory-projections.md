# T026 · soul-panel-and-memory-projections（Soul Panel 与记忆投影）

**Epic:** v0.1-UI  
**分组:** Soul  
**依赖:** T009，T013  
**可并行:** 可与 T025、T027 并行  
**状态:** 待开始  

---

## 目标

实现 Soul panel / Memory drawer 的富投影读取，展示 memory list、proposal list、graph preview。

---

## 涉及文件/目录

```text
packages/app/src/components/soul/
packages/app/src/stores/projection/
packages/app/src/selectors/
```

---

## 实现要点

- Memory item 至少展示 scope、dimension、retentionState、manifestationState、claim、slot/conflict 摘要。
- Proposal 列表与 graph preview 有独立区块。
- Soul rail / Soul panel 只读 projection，不充当控制态真相。
- global scope 条目需要可被 UI 识别，为后续危险确认做准备。

---

## 验收标准

- [ ] Soul panel 能展示最小记忆字段集
- [ ] proposal 与 graph preview 有明确落点
- [ ] Soul 相关 UI 只消费 projection
- [ ] global scope memory 在 UI 中可被区分识别

---

## 风险 / 注意事项

- 现有 soul routes 只覆盖局部 projection，完整字段需后续 Core 补齐。
- Soul rail 的视觉表现不能改变真相源要求的信息结构。
