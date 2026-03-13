# C004 — Settings 页"不持久化"提示 + 文档标注

**优先级：** P1（应该，封版质量）
**依赖：** 独立，可与 C001/C002 并行执行
**涉及文件：** `packages/app/src/pages/settings/`、`docs/implementation-status-v0.1.md`
**不得改动：** `packages/core`、`packages/protocol`、任何后端包

---

## 背景

`SettingsStore` 当前是进程内内存快照，重启后所有设置恢复默认值。
用户在 Settings 页面修改配置后，可能不知道这不会持久化。
封版前需要在 UI 中明确提示，同时在 implementation-status 文档中标注。

---

## 目标

1. Settings 页顶部加一个 informational banner（黄色/提示风格，不阻断操作）
2. `docs/implementation-status-v0.1.md` 存储层条目补充限制说明

---

## 文件清单（只改这些文件）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/app/src/pages/settings/settings-page-content.tsx` | 修改 | 顶部加 banner |
| `docs/implementation-status-v0.1.md` | 修改 | 存储层条目补充持久化限制说明 |

---

## 实现要点

### Settings 页 banner

在 settings 页面内容区域顶部（不是窗口顶部）加一个 banner：

```tsx
// 位置：<SettingsPageContent> 的 JSX 顶层，在 <form> 或主体内容之前
<div className={styles.settingsBanner} role="note">
  设置当前不会持久化，重启后将恢复默认值。持久化支持将在 v0.2 中引入。
</div>
```

样式要求：
- 背景色使用 design token 中的 warning/info 色调（查看已有 CSS variables）
- 不超过两行文字
- 不使用红色（不是错误，是说明）
- 与页面其他元素风格一致（参考 `WorkbenchEmptyState` 或 approval strip 的提示风格）

### implementation-status-v0.1.md 改动

在"存储层"章节（第 6 节）的"已知缺口 / 限制"中，把现有的：
```
- `SettingsStore` 不在 SQLite 中持久化。
```
更新为更明确的描述：
```
- `SettingsStore` 是进程内内存快照，不持久化到 SQLite。重启后所有 settings 恢复默认值。
  UI 在 Settings 页面顶部已标注此限制。持久化支持在 v0.2 中实现。
```

---

## 验收标准（DoD）

1. Settings 页顶部展示 informational banner，内容包含"不会持久化"和"v0.2"字样
2. Banner 不阻断 Settings 表单的正常操作
3. `docs/implementation-status-v0.1.md` 存储层条目有明确的持久化限制说明
4. `pnpm -w typecheck` 无新增类型错误
5. `pnpm --filter @do-what/app test` 通过

---

## 完成后更新

- [ ] `docs/archive/v0.1-closure/closure-overview.md` 中 C004 状态改为"已完成"
- [ ] `AGENTS.md` 当前阶段任务进度更新
