# T041 · memory-repo-demotion（memory_repo 降格典藏层）

**Epic:** v0.1.x Phase 2 — Core 四层分离
**路线:** I：memory_repo 降格，仅 Canon 级写入
**依赖:** T031（soul 概念统一，Canon 级定义明确），T036（EvidenceCapsule 已处理 Canon 级写入）
**优先级:** P2
**估算改动:** ~200 行（逻辑删除 + 门控添加）

---

## 目标

修改 Soul 包，确保 `memory_repo`（git）只接受 Canon 级 cue 的写入；
Working 和 Consolidated 级 cue 只写 SQLite；
消除现有代码中对 memory_repo 的过度写入。

---

## 范围

**做什么：**

**三级写入策略（`packages/soul/src/memory-tier.ts`）：**
```typescript
type MemoryTier = 'working' | 'consolidated' | 'canon';

// 写入规则（明确的策略对象）：
const WRITE_POLICY: Record<MemoryTier, { sqlite: boolean; memory_repo: boolean }> = {
  working:      { sqlite: true,  memory_repo: false },
  consolidated: { sqlite: true,  memory_repo: false },
  canon:        { sqlite: true,  memory_repo: true  },
};
```

**memory_repo 写入门控（`packages/soul/src/memory/repo-writer.ts`）：**
```typescript
async function writeToRepo(cue: MemoryCue): Promise<void> {
  if (cue.level !== 'canon') {
    logger.warn('memory-repo-demotion: skip non-canon write', { cue_id: cue.id, level: cue.level });
    return;  // 静默跳过，不 throw
  }
  // 原有的 git commit 逻辑...
}
```
- 在现有 `packages/soul/src/memory/repo-writer.ts`（或等效文件）中添加 canon 门控
- 门控在 DatabaseWorker 线程内执行（不在主线程）

**存量数据清理（可选，建议）：**
- 扫描 `memory_repo` 中的 Working/Consolidated 级提交（通过 git log + grep cue level）
- 生成清理报告（不自动删除，人工确认后清理）
- 报告写入 `~/.do-what/evidence/memory-repo-audit.jsonl`

**现有代码路径审查：**
- 扫描 `packages/soul/src/` 中所有调用 `git.add()` / `git.commit()` 的位置
- 确认每个调用点都经过 `writeToRepo()` 门控
- 若发现绕过门控的直接 git 调用，重构为经过 `writeToRepo()`

**不做什么：**
- 不删除 `memory_repo` 中已存在的 Working/Consolidated 级提交（仅停止新写入）
- 不修改 Canon 级 cue 的升级逻辑（T033 ClaimForm 已处理）
- 不修改 `memory_repo` 的 Git 仓库结构

---

## 假设

- `memory_cue.level` 枚举已在 T031 中明确定义（`'working' | 'consolidated' | 'canon'`）
- 现有 `memory_repo` 写入逻辑集中在 `packages/soul/src/memory/` 目录
- `memory_repo` 是标准 git 仓库（`simple-git` 操作）

---

## 文件清单

```
packages/soul/src/memory-tier.ts                  ← 新建：三级写入策略常量
packages/soul/src/memory/repo-writer.ts           ← 添加 canon 门控
packages/soul/src/__tests__/memory-tier.test.ts   ← 新建测试
```

---

## DoD + 验收命令

```bash
# 测试门控：非 canon 级 cue 不触发 git 写入
pnpm --filter @do-what/soul test -- --testNamePattern "memory-tier"

# 验证 working/consolidated 写入被 warn + 跳过
pnpm --filter @do-what/soul test -- --testNamePattern "repo-write-guard"

# 确认无绕过门控的直接 git 调用
grep -rn "git\.add\|git\.commit\|simpleGit" packages/soul/src/ | grep -v "repo-writer\|\.test\."

# 全量 soul 测试
pnpm --filter @do-what/soul test
```

**DoD 标准：**
- [ ] Working/Consolidated 级 cue 触发写入时产生 warn 日志，不写 git
- [ ] Canon 级 cue 正常写入 memory_repo（现有行为不变）
- [ ] 所有 git 调用均经过 `repo-writer.ts` 门控（grep 验证）
- [ ] soul 包全量测试通过

---

## 风险与降级策略

- **风险：** 存量代码中有多处直接 git 调用，难以全部迁移
  - **降级：** 第一步只在入口函数添加门控（不逐个迁移），确保主路径安全；遗漏的调用点在 PR review 中人工核查
- **风险：** Canon 级 cue 频繁晋升导致 memory_repo 提交频率过高（影响 git 性能）
  - **降级：** 积累机制：Canon 写入不立即 commit，而是攒够 10 条或 30min 后批量 commit（T022 已有类似机制，确认是否复用）
