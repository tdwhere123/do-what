# T028 · adapter-layer-cleanup（接入层清理）

**Epic:** v0.1.x Phase 0 — 清理减法
**路线:** A：接入层清理
**依赖:** 无（Phase 0 起点）
**优先级:** P0
**估算改动:** ~200 行删除

---

## 目标

删除 Claude/Codex 接入时遗留的临时 shim、一次性调试脚本、无消费 feature flag、重复桥接层，
使 `packages/engines/claude` 和 `packages/engines/codex` 代码路径清晰无冗余。

---

## 范围

**做什么：**

**Claude 接入层（`packages/engines/claude`）：**
- 扫描并删除所有 `// TODO: remove shim` / `// DEBUG` / `// TEMP` 注释标记的代码块
- 删除在 T011/T012 调试期间加入的临时 `console.log` / `process.stderr.write` 诊断输出
- 删除已无消费方的 feature flag（如 `CLAUDE_LEGACY_HOOK_FORMAT`、`DISABLE_MCP_REROUTE` 等环境变量判断分支）
- 删除 hook-runner 中对 Core HTTP 的直接 `fetch` 调用（应只读 `hook-policy-cache.json`，不直连 Core）
- 检查 `packages/engines/claude/src/bridge/` 目录：若存在与 MCP Server 重复的路由逻辑，合并或删除

**Codex 接入层（`packages/engines/codex`）：**
- 删除 T014/T015 调试期间的事件 dump 文件写入逻辑（如写 `~/.do-what/debug/codex-events.jsonl`）
- 删除重复的事件归一化分支（同一 event_type 有两条处理路径时，保留主路径、删除旧路径）
- 删除无消费的 `codex_legacy_mode` 分支（若存在）
- 检查 `packages/engines/codex/src/` 中的一次性 migration 脚本，确认已执行后删除

**通用：**
- 任何文件中 `// v0.1 临时` / `// shim` / `// workaround` 注释的代码，确认无消费后删除
- 删除后运行全量测试确认无回归

**不做什么：**
- 不修改任何接口/协议/类型定义
- 不重命名任何公开导出符号
- 不合并 engines/claude 和 engines/codex（保持两个独立包）

---

## 假设

- v0.1 遗留的调试代码均有明确注释标记（`TODO: remove`、`DEBUG`、`TEMP`、`shim`）
- 若发现无注释的疑似临时代码，不主动删除，仅记录在 PR 描述中供人工确认
- feature flag 分支的"旧路径"代码可通过 `git log` 确认最后一次被测试覆盖的时间

---

## 文件清单

```
packages/engines/claude/src/hook-runner/          ← 删除 shim + debug 代码
packages/engines/claude/src/bridge/               ← 删除重复桥接层（若存在）
packages/engines/claude/src/mcp-server/           ← 删除无消费 feature flag
packages/engines/codex/src/process/               ← 删除 debug dump 逻辑
packages/engines/codex/src/normalizer/            ← 删除重复归一化分支
packages/engines/codex/src/                       ← 删除一次性 migration 脚本
```

---

## DoD + 验收命令

```bash
# 确认无 shim/debug 标记残留
grep -rn "TODO: remove\|// DEBUG\|// TEMP\|// shim\|// workaround" packages/engines/

# 确认无直接 fetch Core 的代码（hook-runner 必须只读缓存）
grep -rn "fetch.*3847\|localhost:3847" packages/engines/claude/src/hook-runner/

# 全量测试无回归
pnpm -w test

# 类型检查通过
pnpm -w exec tsc --noEmit
```

**DoD 标准：**
- [ ] grep 无任何 shim/debug/temp 标记
- [ ] hook-runner 无直连 Core 的 fetch 调用
- [ ] 全量测试通过（不允许减少测试数量）
- [ ] 删除行数 > 100 行（证明确实做了清理，不是空转）

---

## 风险与降级策略

- **风险：** 删除的"临时 shim"实际上仍在某个测试路径中被使用
  - **降级：** 删除前先注释掉，运行全量测试；若有失败，恢复并标记为"需保留，原因：xxx"
- **风险：** feature flag 的旧路径有某个边缘 case 测试覆盖但无业务调用
  - **降级：** 保留旧路径但加 `@deprecated` 注释，在 T029 事件减法时一并清理
