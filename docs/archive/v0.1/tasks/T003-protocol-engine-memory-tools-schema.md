# T003 · Protocol: EngineOutput + MemoryOperation + SystemHealth + Tools API MCP Schema

**Epic:** E0 – Protocol & Schema
**依赖:** T002
**估算改动:** ~500 行

---

## 目标

完成 `packages/protocol` 剩余三个事件族（EngineOutput、MemoryOperation、SystemHealth）的 zod schema，以及 Tools API 全部 10 个 MCP tool 的 JSON Schema 定义（用 zod 表达）。

---

## 范围

**做什么：**

**EngineOutputEvent：**
- `token_stream`：`{ text: string, isComplete: boolean }`
- `plan_node`：`{ nodeId: string, title: string, status: 'pending|active|done|failed' }`
- `diff`：`{ path: string, patch: string, hunks: number }`

**MemoryOperationEvent：**
- `search`：`{ query: string, results: CueRef[] }`
- `open`：`{ pointer: string, level: 'hint|excerpt|full', tokensUsed: number }`
- `propose`：`{ proposalId: string, cueDraft: object, requiresCheckpoint: boolean }`
- `commit`：`{ proposalId: string, commitSha?: string }`

**SystemHealthEvent：**
- `engine_connect`：`{ engineType: 'claude|codex', version: string }`
- `engine_disconnect`：`{ engineType: string, reason: string }`
- `circuit_break`：`{ engineType: string, failureCount: number }`
- `network_status`：`{ online: boolean }`

**Tools API MCP schema（10 个工具）：**
- `tools.file_read`：`{ path, encoding?, line_range? }`
- `tools.file_write`：`{ path, content, create_dirs? }`
- `tools.file_patch`：`{ path, patches: Patch[] }`
- `tools.shell_exec`：`{ command, cwd?, env?, timeout?, sandbox? }`
- `tools.git_apply`：`{ patch, worktree_id?, message? }`
- `tools.git_status`：`{ worktree_id? }`
- `tools.git_diff`：`{ ref_a?, ref_b?, paths? }`
- `tools.web_fetch`：`{ url, method?, headers?, body? }`
- `tools.docker_run`：`{ image, command, mounts?, env? }`
- `tools.wsl_exec`：`{ command, distro? }`

**不做什么：**
- 不实现工具执行逻辑（留给 packages/tools）
- 不定义 Soul MCP schema（留 T004）

---

## 假设

- MCP tool schema 以 zod 表达，同时通过 `zodToJsonSchema` 导出标准 JSON Schema（用于 MCP server 注册）
- `sandbox` 字段枚举：`'native' | 'wsl' | 'docker'`
- `line_range`：`{ start: number, end: number }`
- `Patch`：`{ type: 'replace|insert|delete', lineStart: number, lineEnd?: number, content?: string }`

---

## 文件清单

```
packages/protocol/src/events/engine.ts
packages/protocol/src/events/memory.ts
packages/protocol/src/events/system.ts
packages/protocol/src/mcp/tools-api.ts         ← Tools API zod schemas
packages/protocol/src/mcp/index.ts             ← re-export
packages/protocol/src/types/cue.ts             ← CueRef 等共享类型
packages/protocol/src/__tests__/engine.test.ts
packages/protocol/src/__tests__/memory.test.ts
packages/protocol/src/__tests__/tools-api.test.ts
packages/protocol/package.json                 ← 添加 zod-to-json-schema 依赖
```

---

## 接口与 Schema 引用

- `EngineOutputEvent` — T012/T015 (引擎适配器) 产生
- `MemoryOperationEvent` — T018/T019 (Soul read path) 产生
- `SystemHealthEvent` — T008 (状态机转换触发) 消费
- `ToolsApiSchema.*` — T009 (Policy Engine) 用于审批判定；T012/T015 用于 MCP server 注册

---

## 实现步骤

1. 创建 `src/types/cue.ts`：`CueRefSchema = z.object({ cueId, gist, score, pointers })`
2. 创建 `src/events/engine.ts`、`memory.ts`、`system.ts`：各自的 discriminatedUnion schema
3. 创建 `src/mcp/tools-api.ts`：10 个工具的 input schema（zod）+ 通过 `zodToJsonSchema` 导出 JSON Schema
4. 创建 `src/mcp/index.ts`：re-export `ToolsApiSchemas`, `ToolsApiJsonSchemas`
5. 更新 `src/events/index.ts`：re-export 新事件族
6. 更新根 `src/index.ts`：re-export `mcp` namespace
7. 编写单元测试：覆盖每个事件族的合法/非法解析；验证 JSON Schema 格式正确（`$schema` 字段存在）

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/protocol test
# 预期：所有测试通过

pnpm --filter @do-what/protocol exec tsc --noEmit

# 验证 JSON Schema 导出
node -e "
import('@do-what/protocol').then(p => {
  const schema = p.ToolsApiJsonSchemas['tools.shell_exec'];
  console.assert(schema.type === 'object', 'schema.type should be object');
  console.assert(schema.properties.command, 'command field should exist');
  console.log('tools.shell_exec JSON Schema OK');
});
"
```

---

## 风险与降级策略

- **风险：** `zod-to-json-schema` 对某些 zod 特性（如 `.passthrough()`）生成非标准 JSON Schema
  - **降级：** 对 MCP tool schema 不用 `.passthrough()`，手动补 `additionalProperties: true`
- **风险：** Tools API 工具参数在实际 MCP 集成时需要调整
  - **降级：** schema 在 protocol 中定义后，tools 包实现时可通过 `.extend()` 添加服务端专用字段，不破坏 protocol 层定义
