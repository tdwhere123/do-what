# T020 · Soul: memory_repo Git 初始化 + project_fingerprint

**Epic:** E5 – Soul Write Path
**依赖:** T017（soul.db schema）
**估算改动:** ~300 行

---

## 目标

实现 `memory_repo` 的 Git 仓库初始化与管理，以及项目指纹（`project_fingerprint`）的生成与稳定查找逻辑（主键 + 次键策略）。

---

## 范围

**做什么：**
- `project_fingerprint` 生成：
  - **主键**：`git remote origin URL` + `default branch`（sha256 hex，前 16 字节）
  - **次键**：绝对路径 sha256（用于无 remote 的目录）
  - 稳定性：本地路径变化不影响主键；remote URL 变化需手动重绑
- `MemoryRepoManager`：
  - `getOrInit(fingerprint)` → 确保 `~/.do-what/memory/<fingerprint>/memory_repo/` 存在且是 Git 仓库
  - `initRepo()` → `git init --initial-branch=main` + 初始提交（README）
  - `commit(message, files: {path: string, content: string}[])` → 写文件 + `git add` + `git commit`
  - `getCommitSha(ref)` → 返回 SHA
  - `gc()` → 触发 `git gc --auto`（低优先级，异步）
- SQLite `projects` 表（soul.db 新增）：`{ project_id, primary_key, secondary_key, workspace_path, fingerprint, memory_repo_path, created_at, last_active_at, bootstrapping_phase_days }`
- Windows junction 创建：`~/.do-what/memory/<fp>/` → `.dowhat/memory_repo/`（workspace 内快捷入口，可选）
- **GitOps 队列（memory_repo 专用）**：同一 memory_repo 的 Git 写操作串行化（mutex），防止 index.lock 冲突

**不做什么：**
- 不实现 memory_repo 压缩/GC 策略（留 T027）
- 不实现 workspace 的 worktree 管理（留 T023）

---

## 假设

- `git` 在 PATH 中可用（由 toolchain 断言）
- Git 写操作通过 `child_process.spawn` 调用（不用 libgit2/isomorphic-git，保持简单）
- memory_repo 提交者：`do-what <soul@do-what.local>`
- 多个 workspace 可能对应同一 memory_repo（fork 场景），手动重绑通过 Core API 支持

---

## 文件清单

```
packages/soul/src/repo/project-fingerprint.ts
packages/soul/src/repo/memory-repo-manager.ts
packages/soul/src/repo/git-ops-queue.ts           ← mutex + index.lock 处理
packages/soul/src/repo/junction-creator.ts         ← Windows junction（可选）
packages/soul/src/db/migrations/v2.ts             ← 添加 projects 表到 soul.db
packages/soul/src/__tests__/fingerprint.test.ts
packages/soul/src/__tests__/memory-repo.test.ts
```

---

## 接口与 Schema 引用

- `RunLifecycleEvent`（`@do-what/protocol`）：首次 Run 完成后触发 fingerprint 计算

---

## 实现步骤

1. 创建 `src/repo/project-fingerprint.ts`：
   - `computePrimary(workspacePath)` → spawn `git remote get-url origin` + `git symbolic-ref refs/remotes/origin/HEAD` → sha256
   - `computeSecondary(workspacePath)` → sha256 of absolute path
   - `getFingerprint(workspacePath)` → 尝试 primary，失败则 secondary
2. 创建 `src/repo/git-ops-queue.ts`：per-repoPath mutex（`Map<string, Promise>`），指数退避 + 抖动处理 index.lock
3. 创建 `src/repo/memory-repo-manager.ts`：`getOrInit`, `commit`, `getCommitSha`, `gc` 实现
4. 创建 soul.db 迁移 `v2.ts`：添加 `projects` 表
5. 创建 `src/repo/junction-creator.ts`：Windows `mklink /J` + fallback（仅记录路径，不创建 junction）
6. 编写测试：fingerprint 计算（mock git 命令）；memory-repo init + commit（临时目录）；git-ops-queue mutex 测试

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/soul test -- --testNamePattern "fingerprint|memory-repo"

# 手动验证（在有 git remote 的目录下）
node -e "
import('@do-what/soul').then(async m => {
  const fp = await m.getFingerprint(process.cwd());
  console.log('Fingerprint:', fp);
  // 预期：16字节 hex 字符串
});
"

# 验证 memory_repo 初始化
ls ~/.do-what/memory/
# 预期：存在以 fingerprint 命名的目录

ls ~/.do-what/memory/*/memory_repo/
# 预期：存在 .git 目录

git -C ~/.do-what/memory/*/memory_repo/ log --oneline
# 预期：initial commit
```

---

## 风险与降级策略

- **风险：** `git remote get-url origin` 命令失败（无 remote / git 未初始化）
  - **降级：** 自动回退到 secondary key（绝对路径哈希）；在 UI 显示"使用本地路径作为项目标识（无 remote）"
- **风险：** Windows 创建 junction 需要管理员权限或特殊设置（开发者模式）
  - **降级：** junction 创建失败时仅在 UI 显示 memory_repo 的绝对路径（不创建快捷入口）；不阻塞 Soul 功能
