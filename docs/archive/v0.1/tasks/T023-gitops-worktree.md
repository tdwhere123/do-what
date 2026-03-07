# T023 · GitOps 队列 + Worktree 分配 + Run 隔离

**Epic:** E6 – Worktree 并行 + Integrator
**依赖:** T012（Claude 适配器）、T015（Codex 适配器）、T008（RunMachine）
**估算改动:** ~400 行

---

## 目标

实现 Core 的 GitOps 队列（同 repo 的 git 写操作串行化）、Worktree 分配器（每个 Run 分配独立 git worktree + 分支），以及 Run 级别的工作区隔离（引擎在独立 worktree 中产出 patch，不直接写主工作区）。

---

## 范围

**做什么：**

**GitOpsQueue（packages/tools 中实现，Core 使用）：**
- 每个 repo 根路径一个 mutex（`Map<repoPath, Promise>`）
- `enqueue(repoPath, operation: () => Promise<T>): Promise<T>` → 串行执行
- index.lock 检测：遇到 `EEXIST (.git/index.lock)` → 指数退避（100ms, 200ms, 400ms）+ 随机抖动（0-50ms）→ 最多 5 次，超过则抛 `GitLockError`
- 抖动重试后仍失败 → 强制删除 index.lock（仅在超过 60 秒未更新时）+ 记录 warn

**WorktreeManager（packages/tools 中实现）：**
- `allocate(repoPath, runId)` → `git worktree add ~/.do-what/worktrees/<runId> -b wt-<runId>` → 返回 worktree 路径
- `release(runId)` → `git worktree remove ~/.do-what/worktrees/<runId> --force` + 删除分支
- `list()` → `git worktree list --porcelain` + 解析
- 自动清理：Core 启动时扫描 `~/.do-what/worktrees/`，释放孤立 worktree（对应 Run 已结束的）

**Run 隔离：**
- RunMachine 启动时分配 worktree（`WorktreeManager.allocate`）
- 引擎（Claude/Codex）在此 worktree 中执行（`tools.shell_exec` 的 `cwd` 设为 worktree 路径）
- 引擎完成后，worktree 中的变更生成 patch（`git diff HEAD`），保存到 `runs.metadata`
- Run 完成/失败/取消后，worktree 自动释放

**不做什么：**
- 不实现 Integrator 合入流程（留 T024）
- 不实现两阶段并行（Proposal 阶段/Integration 阶段的完整调度，留 T024）

---

## 假设

- worktree 路径：`~/.do-what/worktrees/<runId>/`
- worktree 分支命名：`wt-<runId>` (前 8 字节)
- 最大并发 worktree 数：8（可配置），超过则等待
- worktree 的 Git repo 与 workspace 共享同一 `.git` 目录（标准 git worktree 特性）

---

## 文件清单

```
packages/tools/src/git/gitops-queue.ts
packages/tools/src/git/worktree-manager.ts
packages/tools/src/git/index.ts
packages/core/src/run/worktree-lifecycle.ts       ← 与 RunMachine 集成
packages/tools/src/__tests__/gitops-queue.test.ts
packages/tools/src/__tests__/worktree-manager.test.ts
```

---

## 接口与 Schema 引用

- `RunLifecycleEvent`（`@do-what/protocol`）：worktree 分配/释放时机

---

## 实现步骤

1. 创建 `src/git/gitops-queue.ts`：mutex Map + 指数退避 + index.lock 强制清理
2. 创建 `src/git/worktree-manager.ts`：allocate/release/list + 孤立 worktree 清理
3. 创建 `packages/core/src/run/worktree-lifecycle.ts`：
   - 订阅 RunMachine `started` → 分配 worktree → 更新 RunContext
   - 订阅 RunMachine terminal 状态 → 提取 patch → 释放 worktree
4. 编写测试：mock git 命令；mutex 并发测试（2 个操作同一 repo，验证串行执行）；index.lock 重试测试

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/tools test -- --testNamePattern "gitops|worktree"

# 端到端验证（在一个 git repo 目录下）
TOKEN=$(cat ~/.do-what/run/session_token)

# 触发两个并行 Run（临时 dev endpoint）
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -d '{"engine":"claude","prompt":"list files"}' \
  http://127.0.0.1:3847/_dev/start-run &
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -d '{"engine":"claude","prompt":"show git status"}' \
  http://127.0.0.1:3847/_dev/start-run &

sleep 2

# 验证 worktree 已分配
git worktree list
# 预期：列出 2 个额外 worktree（wt-...）

# 等待 Run 完成后验证 worktree 已释放
sleep 5
git worktree list
# 预期：额外 worktree 已移除
```

---

## 风险与降级策略

- **风险：** `git worktree add` 在 Windows 上对网络驱动器或某些路径失败
  - **降级：** 失败时降级为本地拷贝目录模式（非标准 worktree，直接 `git clone --local`），标记为 `isolated_copy` 模式；UI 显示"并行模式降级"
- **风险：** 孤立 worktree 积累（Core 异常退出，自动清理未执行）
  - **降级：** Core 启动时强制扫描 + 清理所有 `wt-*` 分支中对应 Run 状态为 terminal 的 worktree；提供 CLI 命令 `do-what cleanup worktrees`
