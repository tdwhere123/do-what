# T025 · drift-resolution-panels（Drift / Integration Gate 处置面板）

**Epic:** v0.1-UI  
**分组:** Governance  
**依赖:** T010，T011，T022  
**可并行:** 可与 T024、T026 并行  
**状态:** 待开始  

---

## 目标

实现 drift diagnostics、integration gate 诊断与处置入口，不让异常只停留在提示层。

---

## 涉及文件/目录

```text
packages/app/src/components/drift/
packages/app/src/components/governance/
packages/app/src/lib/commands/
```

---

## 实现要点

- 展示 soft stale / hard stale nodes 与相关摘要。
- 展示 integration gate 状态与待决操作。
- `resolveDrift` 与 `decideIntegrationGate` 统一走 command dispatcher。
- 所有对象型处置都接入 reconciling / desynced 自愈路径。

---

## 验收标准

- [ ] drift 异常可见且可处置
- [ ] integration gate 有明确决策入口
- [ ] 处置动作不绕过 pending/overlay 管线
- [ ] 异常状态不是只读展示，而是可闭环处理

---

## 风险 / 注意事项

- 依赖 inspector/probe 字段完整度。
- 若异常处置入口过早写死文案，后续治理演化会受限。
