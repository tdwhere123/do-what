# T025 · LocalHeuristics ComputeProvider（diff 熵 + 启发式 cue 草稿）

**Epic:** E7 – Memory Compiler + 自我进化
**依赖:** T022（Soul write path）
**估算改动:** ~350 行

---

## 目标

实现 `LocalHeuristics` ComputeProvider（纯本地、不花 token 的保底计算提供者），能从 git diff 中提取启发式 cue 草稿（detect 格式化变更、新增 export、TODO/接口变更等），为 Memory Compiler 提供 Working 级初始 cue。

---

## 范围

**做什么：**

**ComputeProvider 接口（`packages/soul/src/compute/provider.ts`）：**
```typescript
interface ComputeProvider {
  readonly name: string;
  summarize_diff(input: SummarizeInput, budget: TokenBudget): Promise<SummarizeResult>;
  embed?(texts: string[]): Promise<number[][]>;  // 可选
  rerank?(query: string, candidates: CueRef[]): Promise<CueRef[]>;  // 可选
  cost_estimate(input: SummarizeInput): CostEstimate;
  isAvailable(): boolean;
}

type SummarizeInput = {
  diff: string;          // git diff text
  conversation_summary?: string;  // 可选上下文
  project_id: string;
}

type SummarizeResult = {
  cue_drafts: CueDraft[];
  confidence: number;     // 0-1
  source: 'local_heuristic' | 'llm' | 'hybrid';
}
```

**LocalHeuristics 实现：**
- `isAvailable()` → 始终返回 `true`
- `cost_estimate()` → `{ tokens: 0, dollars: 0 }`
- `summarize_diff(input)` 启发式规则（按信息量排序）：
  1. **格式化/空白变更检测**：diff 中仅有 whitespace/indent 变更 → 跳过（返回空 cue）
  2. **新增 export 检测**：`diff +export (function|class|const|type|interface)` → cue 类型 `fact`，gist：`Added export <name>`
  3. **文件/模块新增**：`diff +++(new file mode)` → cue 类型 `pattern`，gist：`New module: <path>`
  4. **TODO/FIXME/HACK 标记**：`diff +.*TODO|FIXME|HACK` → cue 类型 `risk`
  5. **大量行变更（>50 行同一文件）**：cue 类型 `fact`，gist：`Significant change in <path> (+N/-M lines)`
  6. **接口变更检测**：`interface |type \w+ =` 有修改行 → cue 类型 `pattern`
  7. **机械性重命名**：`+import.*from | -import.*from` 有系统性替换 → 跳过（不产生 cue）
- 所有 cue 进入 Working 级，`confidence` 由规则权重决定（格式化 0.1，export 0.6，TODO 0.7，大变更 0.5）
- 规则按 `anchors` 提取文件名/符号名

**UI 降级提示集成：**
- 当仅 LocalHeuristics 可用时，Soul 在 Core SSE 推送 `SystemHealthEvent`（`soul_mode: 'basic'`）

**不做什么：**
- 不实现语义级总结（无法提炼"认证逻辑从 middleware 抽到 service"这种语义）
- 不实现 OfficialAPI/CustomAPI（留 T026）

---

## 假设

- diff 为标准 `git diff` 输出（unified diff 格式）
- 每次 summarize_diff 处理的 diff 大小 <= 100KB（超过则截断前 100KB）
- cue anchors 从 diff 的文件路径中提取（最多 3 层目录 + 文件名）

---

## 文件清单

```
packages/soul/src/compute/provider.ts              ← ComputeProvider interface
packages/soul/src/compute/local-heuristics.ts
packages/soul/src/compute/registry.ts              ← provider 注册表（优先级管理）
packages/soul/src/compute/index.ts
packages/soul/src/__tests__/local-heuristics.test.ts
```

---

## 接口与 Schema 引用

- `CueDraft`（`@do-what/protocol`，由 T004 的 `cue_draft` 结构定义）
- `SystemHealthEvent`（`@do-what/protocol`）：soul_mode 降级通知

---

## 实现步骤

1. 创建 `src/compute/provider.ts`：`ComputeProvider` interface + `SummarizeInput/Result` + `CostEstimate` 类型
2. 创建 `src/compute/registry.ts`：`ComputeProviderRegistry`，维护优先级列表，`getBestAvailable()` 返回最高优先级可用 provider
3. 创建 `src/compute/local-heuristics.ts`：7 条启发式规则实现，每条规则独立 + 可组合
4. 创建 `src/compute/index.ts`：re-export + 注册 LocalHeuristics 为默认 provider
5. 编写测试：各规则的触发/不触发（用 git diff fixture）；空白变更跳过；混合变更多 cue 输出

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/soul test -- --testNamePattern heuristic

# 手动验证（用真实 git diff）
git diff HEAD~1 HEAD | node -e "
const {LocalHeuristics} = require('./packages/soul/dist/compute/local-heuristics.js');
process.stdin.resume();
let diff = '';
process.stdin.on('data', d => diff += d);
process.stdin.on('end', async () => {
  const h = new LocalHeuristics();
  const result = await h.summarize_diff({diff, project_id: 'test'}, {maxTokens: 1000});
  console.log(JSON.stringify(result, null, 2));
});
"
# 预期：输出 cue_drafts 数组（根据 diff 内容）
```

---

## 风险与降级策略

- **风险：** 启发式规则误报（将正常重构识别为"大量变更" cue，产生噪音）
  - **降级：** Working 级 cue 默认不注入冷启动（方案已规定），误报不影响引擎上下文；通过 `hit_count` + 用户未移除来过滤噪音 cue
- **风险：** diff 处理大文件（>100KB）耗时较长（启发式匹配 100KB 字符串）
  - **降级：** 设置处理时间上限（100ms）；超时后返回已处理完的 cue（部分结果），标注 `truncated: true`
