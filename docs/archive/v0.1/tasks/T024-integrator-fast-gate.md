# T024 · Integrator 流程 + Fast Gate（增量诊断）

**Epic:** E6 – Worktree 并行 + Integrator
**依赖:** T023（Worktree 管理）
**估算改动:** ~400 行

---

## 目标

实现 Integrator：按 DAG 拓扑序将各 Run 的 worktree patch 合入主工作区，并在每次合入后执行 Fast Gate（增量诊断：LSP typecheck + lint + 基础 test，不新增错误则通过）。Fast Gate 失败时广播给相关 Run 并触发 replay。

---

## 范围

**做什么：**

**Integrator（串行合入）：**
- 输入：完成的 Run 列表（含 patch + touched_paths）
- 按 DAG 拓扑序排列（默认基于 touched_paths 依赖，无依赖则按完成时间）
- 逐个执行：`git apply <patch> --index` 到主工作区（通过 GitOpsQueue）
- 冲突处理：apply 失败 → 标记为 `conflict`，暂停后续合入，通知 UI

**Fast Gate：**
- 每次 `git apply` 成功后执行增量诊断：
  - TypeScript：`tsc --noEmit --incremental`（仅检查 touched_paths 涉及的文件）
  - ESLint：`eslint <touched_files> --max-warnings 0`
  - 可选 test：若 touched_paths 有对应测试文件，执行 `vitest run <test_files>`
- **增量验证策略**（防"脏基线"）：
  - 合入前记录 baseline 诊断数（从 SQLite `diagnostics_baseline` 表读）
  - 合入后重新扫描，计算 delta
  - 规则：`after_count <= baseline_count` 则通过（不新增错误）
  - 首次运行：自动创建 baseline（用户确认）
- Fast Gate 通过 → 更新 baseline → 触发下一个 Run 合入
- Fast Gate 失败：
  1. 停止后续合入
  2. 广播 `IntegrationEvent.gate_failed`（含 `touched_paths`、`new_diagnostics`）
  3. 受影响的 Run（在同 touched_paths 上的后续任务）进入 `replay` 流程（在其 worktree 中 rebase + 重试）

**DAG 构建器（简化版）：**
- 输入：`{ runId, touched_paths }[]`
- 输出：拓扑排序后的 runId 列表
- 依赖规则：若 Run A 的 touched_paths 与 Run B 有交集，A 完成后 B 才能合入（A → B）
- 无交集 → 可任意顺序合入（实际按完成时间）

**不做什么：**
- 不实现完整 LSP 集成（使用 CLI 命令，不调用 LSP server 协议）
- 不实现 replay 逻辑（触发信号，实际 replay 由引擎适配器处理）

---

## 假设

- `git apply` 失败（冲突）时 Core 不自动解决，暂停并通知 UI
- Fast Gate 超时（单项 > 60 秒）→ 超时视为失败
- `diagnostics_baseline` 表在 state.db 中（新增 DDL，通过 Core 迁移）
- replay 信号：发布 `RunLifecycleEvent` 的特殊 `replay_requested` 状态，由引擎适配器订阅并重新执行

---

## 文件清单

```
packages/core/src/integrator/integrator.ts
packages/core/src/integrator/dag-builder.ts
packages/core/src/integrator/fast-gate.ts
packages/core/src/integrator/baseline-tracker.ts
packages/core/src/integrator/index.ts
packages/core/src/db/migrations/v2.ts             ← diagnostics_baseline 表
packages/core/src/__tests__/integrator.test.ts
packages/core/src/__tests__/dag-builder.test.ts
packages/core/src/__tests__/fast-gate.test.ts
```

---

## 接口与 Schema 引用

- `RunLifecycleEvent.completed`（`@do-what/protocol`）：触发 Integrator
- `ToolExecutionEvent`（`@do-what/protocol`）：git apply 工具事件
- 新增 `IntegrationEvent`（需在 T002/T003 的 protocol 中补充）：`gate_passed | gate_failed | conflict | replay_requested`

---

## 实现步骤

1. 在 `packages/protocol` 中补充 `IntegrationEvent` schema（扩展 T002/T003 成果）
2. Core state.db 迁移 `v2.ts`：添加 `diagnostics_baseline(workspace_id, error_count, created_at, updated_at)` 表
3. 创建 `src/integrator/dag-builder.ts`：`buildDAG(runs): string[]`（拓扑排序）
4. 创建 `src/integrator/baseline-tracker.ts`：读写 `diagnostics_baseline`，计算 delta
5. 创建 `src/integrator/fast-gate.ts`：
   - `run(workspace_path, touched_paths): GateResult`
   - 依次调用 tsc / eslint（spawn child_process，超时 60s）
   - 与 baseline 比较，返回 `{ passed, delta, new_diagnostics }`
6. 创建 `src/integrator/integrator.ts`：串行 `git apply` + FastGate；失败时广播 + 停止
7. 编写测试：DAG 拓扑排序（含环检测）；Fast Gate mock 诊断工具；冲突处理

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/core test -- --testNamePattern "integrator|dag|fast-gate"

# 验证 DAG builder（无需真实 git）
node -e "
import('@do-what/core').then(m => {
  const dag = m.buildDAG([
    {runId:'A', touched_paths: ['src/auth.ts']},
    {runId:'B', touched_paths: ['src/auth.ts', 'src/user.ts']},
    {runId:'C', touched_paths: ['src/api.ts']}
  ]);
  console.log('DAG order:', dag);
  // 预期：A 在 B 前；C 可与 A/B 并行（任意顺序）
});
"

# 完整集成测试（需 workspace 是 git repo）
# 启动 Core → 触发 2 个并行 Run → 等待完成 → 触发 Integrator → 观察 SSE 事件
TOKEN=$(cat ~/.do-what/run/session_token)
curl -N -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3847/events | \
  grep -E "gate_passed|gate_failed|conflict"
```

---

## 风险与降级策略

- **风险：** Fast Gate 中 `tsc --incremental` 在大型 repo 中仍然很慢（> 60s）
  - **降级：** Fast Gate 超时不阻塞 Integrator，改为异步警告（`gate_timeout`）；用户可在 policy.json 中禁用某些 gate 检查
- **风险：** `diagnostics_baseline` 在项目初始化时就有大量错误（脏基线），delta 判断失效
  - **降级：** 提供 `POST /integrator/reset-baseline`：强制重新扫描并更新 baseline；UI 显示"当前 baseline 有 N 个已有错误（不计入增量门控）"
