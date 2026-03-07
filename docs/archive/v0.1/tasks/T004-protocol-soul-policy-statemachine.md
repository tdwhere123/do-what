# T004 · Protocol: Soul MCP Schema + Policy 配置格式 + StateMachine 类型

**Epic:** E0 – Protocol & Schema
**依赖:** T003
**估算改动:** ~400 行

---

## 目标

定义 Soul 的 5 个 MCP tool schema、Policy 配置格式（`policy.json`）的 zod schema，以及 xstate v5 三台状态机（RunMachine / EngineMachine / ApprovalMachine）的类型骨架（context 类型 + event 联合类型），为 T008 实现状态机提供类型约束。

---

## 范围

**做什么：**

**Soul MCP Tools（5 个）：**
- `soul.memory_search`：`{ project_id, query, anchors?, limit?, tracks?, budget? }`
- `soul.open_pointer`：`{ pointer, level: 'hint|excerpt|full', max_tokens?, max_lines?, with_context? }`
- `soul.explore_graph`：`{ entity_name, track, depth?, limit? }`
- `soul.propose_memory_update`：`{ project_id, cue_draft, edge_drafts?, confidence, impact_level }`
- `soul.review_memory_proposal`：`{ proposal_id, action: 'accept|edit|reject|hint_only', edits? }`

**Policy 配置格式：**
- `PolicyConfigSchema`：每个 tool name 对应 `{ default: 'allow|ask|deny', allow_paths?, deny_paths?, allow_commands?, allow_domains? }`
- 内置默认策略常量（与方案 10.3 节对齐）
- Hook Runner 策略缓存格式（`HookPolicyCacheSchema`）：`{ version: string, updatedAt: string, rules: PolicyConfig }`

**StateMachine 类型骨架：**
- `RunContext`：`{ runId, status, workspaceId, agentId, engineType, createdAt, error? }`
- `RunEvent` union：覆盖所有 RunLifecycle 状态转换触发事件
- `EngineContext`：`{ engineType, connectionStatus, version?, pid?, failureCount }`
- `EngineEvent` union：connect / disconnect / circuit_break / heartbeat_timeout
- `ApprovalContext`：`{ queue: ApprovalItem[], activeItem? }`
- `ApprovalEvent` union：enqueue / user_approve / user_deny / timeout

**不做什么：**
- 不实现状态机逻辑（留 T008）
- 不实现 Soul 工具执行（留 T018/T019/T021/T022）

---

## 假设

- `cue_draft` 的结构：`{ gist: string, type: 'fact|pattern|decision|risk', anchors: string[], pointers: string[], confidence: number(0-1), impact_level: 'working|consolidated|canon' }`
- `tracks` 字段枚举：`'architecture|pattern|api|config|decision'`（可扩展，用 `z.string()` 不强约束）
- Policy `default` 字段若缺失，回退到 `'ask'`
- xstate v5 机器类型使用 `setup({types: {context, events}}).createMachine(...)` 模式

---

## 文件清单

```
packages/protocol/src/mcp/soul-tools.ts
packages/protocol/src/mcp/soul-tools.test.ts
packages/protocol/src/policy/config.ts            ← PolicyConfigSchema
packages/protocol/src/policy/hook-cache.ts        ← HookPolicyCacheSchema
packages/protocol/src/policy/index.ts
packages/protocol/src/policy/defaults.ts          ← 默认策略常量
packages/protocol/src/machines/run-types.ts       ← RunContext + RunEvent
packages/protocol/src/machines/engine-types.ts
packages/protocol/src/machines/approval-types.ts
packages/protocol/src/machines/index.ts
packages/protocol/src/__tests__/policy.test.ts
packages/protocol/package.json                    ← 添加 xstate@^5 类型依赖
```

---

## 接口与 Schema 引用

- `SoulToolsSchema.*` — T018/T019/T021/T022 (Soul 实现) 注册 MCP tools 时引用
- `PolicyConfigSchema` — T009 (Policy Engine) 读取 policy.json 时校验
- `HookPolicyCacheSchema` — T011 (Hook Runner) 写/读策略缓存时校验
- `RunContext / RunEvent` — T008 (xstate RunMachine 实现) 的类型约束
- `EngineContext / EngineEvent` — T008 (xstate EngineMachine 实现) 的类型约束
- `ApprovalContext / ApprovalEvent` — T008 (xstate ApprovalMachine 实现) 的类型约束

---

## 实现步骤

1. 创建 `src/mcp/soul-tools.ts`：5 个 Soul tool 的 zod input schema + JSON Schema 导出
2. 创建 `src/policy/config.ts`：`PolicyRuleSchema`（单工具规则）+ `PolicyConfigSchema`（完整配置 map）
3. 创建 `src/policy/defaults.ts`：导出 `DEFAULT_POLICY` 常量（对齐方案 10.3 节表格）
4. 创建 `src/policy/hook-cache.ts`：`HookPolicyCacheSchema`，包含 version + updatedAt + rules
5. 创建 `src/machines/run-types.ts`：`RunContext` interface + `RunEvent` discriminatedUnion（不含机器实现，仅类型）
6. 创建 `src/machines/engine-types.ts`、`approval-types.ts`：同上
7. 更新所有 `index.ts` re-export
8. 编写测试：Policy schema 解析（含默认值回填）、Soul tool schema 合法/非法输入

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/protocol test
# 所有测试通过，覆盖率 >= 90%（protocol 层纯 schema，测试简单）

pnpm --filter @do-what/protocol exec tsc --noEmit

# 验证 DEFAULT_POLICY 结构
node -e "
import('@do-what/protocol').then(p => {
  const rule = p.DEFAULT_POLICY['tools.shell_exec'];
  console.assert(rule.default === 'ask', 'shell_exec default should be ask');
  const rule2 = p.DEFAULT_POLICY['tools.file_read'];
  console.assert(rule2.default === 'allow', 'file_read default should be allow');
  console.log('DEFAULT_POLICY OK');
});
"
```

---

## 风险与降级策略

- **风险：** xstate v5 的类型骨架在 v5 正式版 vs RC 版之间有 breaking change
  - **降级：** 在 `package.json` 中固定 `xstate: "5.x.x"` 精确版本；类型骨架使用 generic 方式，减少对 v5 内部类型的直接依赖
- **风险：** `soul.propose_memory_update` 的 `cue_draft` 结构在 Soul 实现阶段可能需要调整
  - **降级：** `cue_draft` 暂用 `z.record(z.unknown())` 宽松类型，在 T021 实现时再收紧
