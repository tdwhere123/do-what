# T016 · Codex 适配器：Contract Tests

**Epic:** E3 – Codex Engine Adapter
**依赖:** T015（Codex 适配器完成）
**估算改动:** ~250 行测试 + fixture 文件

---

## 目标

对 Codex App Server 的典型事件序列做录制与回放测试，确保事件归一化逻辑在 Codex CLI 版本变化时有明确的回归基准。

---

## 范围

**做什么：**
- 录制 3 个典型 Codex 场景的 JSONL fixture（与 T013 并行，独立 fixture）：
  1. **简单任务**：plan_node + token_stream + run_complete
  2. **工具调用审批**：approval_request → approved → tool_result → run_complete
  3. **用户取消**：running → cancel → run_failed
- 回放测试：驱动 `EventNormalizer`，验证输出事件序列
- 断言：归一化输出的事件类型、字段完整性、revision 单调递增

**不做什么：**
- 不测试真实 Codex 进程（只测归一化层）

---

## 文件清单

```
packages/engines/codex/fixtures/scenario-simple.jsonl
packages/engines/codex/fixtures/scenario-approval.jsonl
packages/engines/codex/fixtures/scenario-cancel.jsonl
packages/engines/codex/src/__tests__/contract/replay.test.ts
```

---

## 接口与 Schema 引用

- 所有 Protocol 事件类型（`@do-what/protocol`）

---

## 实现步骤

1. 录制或手动构造 3 个 fixture 文件
2. 编写 `replay.test.ts`：逐行 feed 给 `EventNormalizer`，收集输出，对关键字段做断言
3. 在 CI 中标记 Codex CLI 版本（`codex --version`）

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/codex test -- --testNamePattern contract
# 预期：3 个场景的回放测试全部通过
```

---

## 风险与降级策略

- **风险：** fixture 录制时 Codex 版本与当前不同
  - **降级：** fixture 文件头注释版本号；测试输出版本不匹配警告
