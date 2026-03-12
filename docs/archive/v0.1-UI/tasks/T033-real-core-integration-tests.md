# T033 · real-core-integration-tests（真实 Core 集成测试）

**Epic:** v0.1-UI  
**分组:** 验收  
**依赖:** T017-T032  
**可并行:** 否  
**状态:** 已完成

---

## 目标

在 mock 跑通后，用真实 Core 查询面、命令面、SSE 路径完成端到端集成测试。

---

## 涉及文件/目录

```text
packages/app/src/__tests__/
packages/core/src/__tests__/
packages/app/src/test/fixtures/
```

---

## 实现要点

- 覆盖 bootstrap、create run、message、approval、memory、settings lease、offline、pagination、desynced 等关键路径。
- 验证 mock -> real Core 切换不要求组件重写读源。
- 验证 pending/overlay/reconciling/desynced 的整条收敛链。
- 把 query、command、SSE 三条链路联测，而不是只做孤立单测。

---

## 验收标准

- [x] 真实 Core 下可跑通主要端到端路径
- [x] message optimistic tail 与对象 overlay 都能正确收敛
- [x] 断线 / Core 重启 / lease 打断 / pagination 均有测试覆盖
- [x] mock 与 real Core 的切换不会导致 UI 结构重写

---

## 风险 / 注意事项

- Core API 与 SSE 对齐若滞后，集成测试会大量阻塞。
- 若只测 happy path，会掩盖 desynced 与 reconciling 风险。
