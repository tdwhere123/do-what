# T013 · Claude 适配器：Contract Tests（录制/回放）

**Epic:** E2 – Claude Engine Adapter
**依赖:** T012（Claude 适配器完成）
**估算改动:** ~300 行测试 + fixture 文件

---

## 目标

对"典型 Claude Code 会话事件序列"做录制与回放测试（Contract Tests），确保 Claude 适配器在 CLI 版本变化时有明确的回归基准。

---

## 范围

**做什么：**
- 录制 3 个典型会话场景的 hook 事件序列（JSONL fixture 文件）：
  1. **简单只读任务**：`file_read` + `grep` → 正常完成
  2. **写操作触发审批**：`Bash` → hook deny → reroute MCP `tools.shell_exec` → 用户 approve → 完成
  3. **AgentStuckException**：同一工具连续 deny 2 次 → INTERRUPT
- 回放测试：用 fixture 驱动 Hook Runner，不需要真实 Claude 进程
- 对回放输出做断言：
  - 每个事件的 `event_type` 和关键字段
  - 最终 Run 状态（completed / interrupted）
  - 审计日志中的事件数量与顺序
- 版本兼容性说明：fixture 文件注明录制时的 Claude CLI 版本；若版本不匹配，测试输出警告但不 fail

**不做什么：**
- 不录制所有可能的 hook 事件（只覆盖方案中明确的关键路径）

---

## 假设

- Fixture 文件存储在 `packages/engines/claude/fixtures/`
- 回放时 Hook Runner 从文件读 JSON（而非 stdin）
- 测试使用 in-memory SQLite（不依赖真实 Core 进程）

---

## 文件清单

```
packages/engines/claude/fixtures/scenario-readonly.jsonl
packages/engines/claude/fixtures/scenario-write-approve.jsonl
packages/engines/claude/fixtures/scenario-agent-stuck.jsonl
packages/engines/claude/src/__tests__/contract/replay.test.ts
packages/engines/claude/src/__tests__/contract/fixture-loader.ts
```

---

## 接口与 Schema 引用

- 所有 `*Event` 类型（`@do-what/protocol`）：fixture 中的事件 zod 验证

---

## 实现步骤

1. 录制：通过真实 Claude 会话（或手动构造），生成 3 个 JSONL fixture 文件，每行一个 hook event JSON
2. 创建 `fixture-loader.ts`：读取 JSONL 文件，逐行 parse + zod 验证，返回事件数组
3. 创建 `replay.test.ts`：
   - 为每个 fixture 场景：逐事件发给 Hook Runner → 收集输出 → 断言关键字段
   - 最终状态断言（RunMachine terminal state）
4. 添加 CI 友好的说明：若 Claude CLI 未安装，跳过录制步骤，只跑回放（fixture 已提交到 git）

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/claude test -- --testNamePattern contract
# 预期：3 个场景的回放测试全部通过

# 验证 fixture 格式（所有事件应能被 protocol schema parse）
node -e "
const {readFileSync} = require('fs');
const lines = readFileSync('packages/engines/claude/fixtures/scenario-write-approve.jsonl','utf8').trim().split('\n');
console.log('Lines:', lines.length);
lines.forEach((l,i) => { try { JSON.parse(l) } catch(e) { console.error('Line',i,'invalid JSON'); process.exit(1); } });
console.log('All fixture lines are valid JSON');
"
```

---

## 风险与降级策略

- **风险：** Claude CLI 版本更新导致 fixture 失效
  - **降级：** fixture 文件命名加版本后缀（如 `scenario-readonly-v1.4.jsonl`）；测试时从 `claude --version` 读取当前版本，若不匹配打印警告，CI 中标记为 `[WARN]` 而非 fail
