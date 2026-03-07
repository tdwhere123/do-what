# T042 · focus-surface-baseline-lock（FocusSurface + BaselineLock 精确漂移判定）

**Epic:** v0.1.x Phase 3 — 编排与治理
**路线:** F：精确漂移判定（第一步）
**依赖:** T040（AckOverlay 路径切分），T041（memory_repo 降格）
**优先级:** P3
**估算改动:** ~400 行

---

## 目标

实现 `FocusSurface`（描述并行分支的工作范围）和 `BaselineLock`（分支启动时的快照锁），
为 T043 的三类漂移判定提供精确的比较基准。

---

## 范围

**做什么：**

**FocusSurface 类型（`packages/protocol/src/core/focus-surface.ts`）：**
```typescript
type FocusSurface = {
  surface_id: string;           // UUID
  workspace_id: string;
  package_scope: string[];      // 受影响包列表（如 ['@do-what/core', '@do-what/soul']）
  path_globs: string[];         // 文件路径 glob（如 ['src/state/**', 'src/db/**']）
  artifact_kind: ArtifactKind[]; // 产物类型
  baseline_fingerprint: string; // 分支启动时的 BaselineLock 指纹
  created_at: string;
}

type ArtifactKind =
  | 'source_file'
  | 'test_file'
  | 'schema_type'
  | 'migration'
  | 'config';
```

**BaselineLock 类型（`packages/protocol/src/core/baseline-lock.ts`）：**
```typescript
type BaselineLock = {
  lock_id: string;              // UUID
  run_id: string;               // 关联的并行 Run
  surface_id: string;           // 关联的 FocusSurface
  baseline_fingerprint: string; // SHA256(所有 surface 内文件的 git tree hash 拼接)
  locked_at: string;            // 分支启动时间
  files_snapshot: FileSnapshot[]; // 文件列表快照（路径 + hash）
}

type FileSnapshot = {
  path: string;
  git_hash: string;             // 文件内容的 git object hash
  size_bytes: number;
}
```

**FocusSurface 注册（`packages/core/src/governance/focus-surface-registry.ts`）：**
- 每个并行 Run 启动时，由编排层（Orchestrator）注册 `FocusSurface`
- 注册时同步计算并锁定 `BaselineLock`
- 使用 `packages/tools` 中的 git 工具读取文件 hash（`git ls-files --with-tree`）

**BaselineLock 计算（`packages/core/src/governance/baseline-calculator.ts`）：**
```typescript
async function computeBaselineLock(
  surface: FocusSurface,
  run_id: string
): Promise<BaselineLock> {
  // 1. 展开 path_globs，获取匹配的文件列表
  // 2. 对每个文件，使用 git hash-object 获取内容 hash
  // 3. 计算 baseline_fingerprint = SHA256(排序后的 path:hash 列表)
  // 4. 返回 BaselineLock
}
```
- 计算应在 Run 启动时（`run_started` 事件）触发
- 计算超时上限：5s（文件数量 <= 1000 时应远低于此）

**BaselineLock 存储：**
- 写入 `state.db` 新表 `baseline_locks`（`packages/core/src/db/migrations/007_baseline_lock.sql`）
- 同时在 `CoreHotState` 中缓存（active run 的 lock）

**不做什么：**
- 不实现漂移判定逻辑（交由 T043 IntegrationGate）
- 不实现 FocusSurface 的自动推断（由编排层显式注册）
- 不处理 glob 展开的边缘情况（空 glob → 视为"所有文件"）

---

## 假设

- `packages/tools` 已提供 git hash 查询工具（T023 GitOpsQueue 中）
- 并行 Run 的编排层（Orchestrator）已在 T024 中实现（Integrator/FastGate）
- `baseline_locks` 表编号为 007（state.db 当前到 006，来自 T029 migration）

---

## 文件清单

```
packages/protocol/src/core/focus-surface.ts           ← FocusSurface + BaselineLock 类型
packages/protocol/src/core/baseline-lock.ts           ← 同上（或合并到 focus-surface.ts）
packages/core/src/governance/focus-surface-registry.ts← FocusSurface 注册
packages/core/src/governance/baseline-calculator.ts   ← BaselineLock 计算
packages/core/src/db/migrations/007_baseline_lock.sql ← DDL migration
packages/core/src/__tests__/focus-surface.test.ts
packages/core/src/__tests__/baseline-lock.test.ts
```

---

## DoD + 验收命令

```bash
# 测试 FocusSurface 注册
pnpm --filter @do-what/core test -- --testNamePattern "focus-surface"

# 测试 BaselineLock 计算（使用 fixtures 目录中的文件）
pnpm --filter @do-what/core test -- --testNamePattern "baseline-lock"

# 验证 fingerprint 幂等性（相同文件集合 → 相同 fingerprint）
pnpm --filter @do-what/core test -- --testNamePattern "baseline-fingerprint-idempotent"

# 运行 migration 007
pnpm --filter @do-what/core exec ts-node src/db/run-migrations.ts
```

**DoD 标准：**
- [ ] `FocusSurface` 注册后，`BaselineLock` 在 5s 内完成计算
- [ ] `baseline_fingerprint` 为幂等函数（相同输入 → 相同 hash）
- [ ] `baseline_locks` 表 migration 007 幂等（多次运行安全）
- [ ] `BaselineLock.files_snapshot` 只包含 `path_globs` 匹配的文件

---

## 风险与降级策略

- **风险：** `path_globs` 过于宽泛（如 `**/*`），匹配文件数量超过 1000，计算超时
  - **降级：** 超过 1000 文件时截断（只取前 1000 个），fingerprint 标注 `truncated: true`；漂移判定降级为"未知"而非精确判定
- **风险：** git hash 查询在 Windows 路径下返回不一致（CRLF 问题）
  - **降级：** 使用 `git hash-object --stdin < file` 而非 `git ls-files`；统一使用 Unix 路径分隔符
