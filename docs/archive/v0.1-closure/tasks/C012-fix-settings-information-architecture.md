# C012 — 修复 Settings 信息架构与标签内容重复

**优先级：** P1（应该，影响产品完整度与可理解性）
**涉及范围：**
- `packages/app/src/pages/settings/`
- `packages/app/src/stores/settings-bridge/`
- 如需调整 snapshot 结构：`packages/core/src/server/`、`packages/protocol/src/`、`docs/INTERFACE_INDEX.md`
- `UI/preview-settings.html`

---

## 背景

当前 Settings 页面存在两个层面的失真：

1. 多个标签切换后内容看起来几乎相同
2. 页面虽然有 tab，但信息架构没有真正按配置域拆开

这不是纯样式问题，而是页面没有正确承载设置域：

- Engines
- Soul
- Policies
- Environment
- Appearance

`UI/preview-settings.html` 已给出了更合理的结构基线。

---

## 目标

1. 让每个 Settings 标签真正对应一个配置域
2. 消除多个标签内容重复或高度同质化的问题
3. 让 Settings 回到“可理解的配置中心”，而不是同一套字段卡片的切页壳子

---

## 本任务必须完成

1. 以 `UI/preview-settings.html` 为基线，重建标签与内容域的映射
2. 每个标签必须有明显不同的主内容：
   - Engines：引擎连接、健康、默认模型或认证模式
   - Soul：记忆、预算、checkpoint、存储等
   - Policies：审批规则、自动批准模式等
   - Environment：工具链、worktree、运行环境健康
   - Appearance：主题、动效、排版等
3. 将跨标签共享但不应重复刷新的卡片重新安置：
   - 例如 runtime、lease locks、overlay 信息，不应让多个 tab 看起来像同一页面
4. 若当前 Settings snapshot 结构不足以支撑分域，允许调整后端快照结构，但必须同步 protocol 和接口文档
5. 保留 C004 的“不持久化”提示，不得在修复信息架构时丢失

---

## 本任务不包含

- 不要求实现 Settings 持久化到 SQLite
- 不要求一次补齐所有高级表单交互
- 不要求一次做完整外观主题系统

---

## 验收标准（DoD）

1. 任意切换三个以上标签，不会再出现“内容几乎一样”的情况
2. Settings 各标签能明显对应不同配置域
3. 页面结构与 `UI/preview-settings.html` 的主分区一致
4. 若修改了 settings snapshot 结构，`docs/INTERFACE_INDEX.md` 已同步更新

---

## 人工严苛验收标准

- [ ] 任意切换三个以上标签，内容**明显不同**，不出现高度同质化
- [ ] Engines / Soul / Policies / Environment / Appearance 各 tab 主内容对应正确配置域
- [ ] 不出现 Appearance 里显示 Policies 内容、多个 tab 刷新同一套字段卡片等情况
- [ ] C004 的”设置不持久化”提示仍存在，未被删除
- [ ] 若 settings snapshot 结构调整，`docs/INTERFACE_INDEX.md` 已同步更新
- [ ] `pnpm -w test` 全通过

## 完成后更新

- [ ] `closure-overview.md` 中 C012 状态改为”已完成”
- [ ] `AGENTS.md` 中收口任务进度同步
- [ ] 若新增接口或字段，`docs/INTERFACE_INDEX.md` 追加变更记录

