# C002 — 禁用 unsupported 命令的 UI 入口

**优先级：** P0（必须，封版阻塞项）
**依赖：** C001 完成后执行（确保 transport=http 下按钮可见性正确）
**涉及包：** `packages/app`
**不得改动：** `packages/core`、`packages/protocol`、任何后端包

---

## 背景

以下 5 个 UI 命令在 Core 中明确返回 `unsupported failure ack`：
- `memory.govern`（memory pin / edit / supersede）
- `governance.resolve_drift`
- `governance.decide_integration_gate`

当用户点击这些按钮后，ack overlay 会进入 `desynced` 状态，体验不好也没有实际作用。

封版要求：这些按钮在 UI 中保持可见但改为 **disabled**，hover 时显示 tooltip 说明"此功能将在 v0.2 中支持"，不触发命令分发。

---

## 目标

把以下入口改为 disabled + tooltip，**不做隐藏**（隐藏会让用户以为功能不存在）：

| 入口 | 对应命令 | 位置 |
|------|---------|------|
| Memory pin 按钮 | `memory.govern` (action: pin) | Inspector memory probe 面板 |
| Memory edit 按钮 | `memory.govern` (action: edit) | Inspector memory probe 面板 |
| Memory supersede 按钮 | `memory.govern` (action: supersede) | Inspector memory probe 面板 |
| Drift resolution 按钮 | `governance.resolve_drift` | Inspector governance 面板 |
| Integration gate decision 按钮 | `governance.decide_integration_gate` | Inspector governance 面板 |

---

## 文件清单（只改这些文件）

先搜索确认按钮实际位置，预期在以下文件中：

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/app/src/components/inspector/inspector-rail.tsx` 或子组件 | 修改 | governance 面板按钮加 disabled + tooltip |
| memory probe 展示组件（搜索 `memory.govern` 或 `dispatchMemoryGovernance` 调用位置） | 修改 | memory 操作按钮加 disabled + tooltip |

**执行前必须先搜索确认按钮实际位置：**
```bash
grep -r "dispatchMemoryGovernance\|dispatchDriftResolution\|dispatchIntegrationGateDecision\|memory\.govern\|resolve_drift\|integration_gate" packages/app/src --include="*.tsx" -l
```

---

## 实现要点

### disabled + tooltip 实现模式

使用已有的 design token 和 CSS Modules 风格，保持与现有 disabled 按钮一致：

```tsx
// 示例模式（参考已有组件中的 disabled 实现方式）
<button
  disabled
  title="此功能将在 v0.2 中支持"
  className={styles.buttonDisabled}
  aria-label="Memory pin（v0.2）"
>
  Pin
</button>
```

- tooltip 文字统一：`"此功能将在 v0.2 中支持"`
- 不需要独立 Tooltip 组件，`title` 属性足够
- disabled 时不调用任何 dispatch 函数（直接 disabled 属性，不绑定 onClick）

### 确认无 desynced overlay 路径

改完后验证：点击（测试方式是通过 title 验证元素存在但已 disabled）不会触发 `dispatchMemoryGovernance`、`dispatchDriftResolution`、`dispatchIntegrationGateDecision`。

---

## 验收标准（DoD）

1. Inspector memory 面板中 pin/edit/supersede 按钮：`disabled` 属性存在，`title` 为"此功能将在 v0.2 中支持"
2. Inspector governance 面板中 drift resolution 和 integration gate decision 按钮：同上
3. 点击 disabled 按钮不产生任何 ack overlay 记录
4. `pnpm -w typecheck` 无新增类型错误
5. `pnpm --filter @do-what/app test` 通过

---

## 完成后更新

- [ ] `docs/archive/v0.1-closure/closure-overview.md` 中 C002 状态改为"已完成"
- [ ] `AGENTS.md` 当前阶段任务进度更新
