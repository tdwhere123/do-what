# v0.1 Closure 审计：当前代码 vs 预期

**日期：** 2026-03-14  
**范围：** 当前 `packages/app`、相关文档，以及 `C011-C013` 完成后的 v0.1 封版状态。  
**口径：** 本文只保留当前仍真实存在的残余偏差，并记录本轮已经对齐的关键项。

## 已对齐项

### 1. workspace-first 主路径已成立

- Empty 主 CTA 已固定为 `打开工作区`。
- Sidebar `+` 走真实目录选择与 `workspace.open` 链路。
- `New Run` 只在具体 workspace 上下文内发起，不再通过虚构 workspace fallback 兜底。

### 2. Settings 已回到五域信息架构

- Settings 目前是独立 frame。
- `Engines / Soul / Policies / Environment / Appearance` 各自拥有独立内容区，而不是单一卡片套不同字段节。
- `Engines` 使用 live `modules` 契约显示真实模块状态，并支持刷新读取最新 snapshot。

### 3. Active / Workbench 已绑定当前 run 和当前引擎

- timeline、composer、inspector 会随左栏 run 切换同步更新。
- 发送行为显式受 `workspace + run + engine status + global lock + draft` 约束。
- 当前 run 引擎未 `connected + ready` 时，输入区会给出明确禁用原因。

### 4. C 类占位已完成诚实化

- `Browse History`、Inspector 中未接通的治理/记忆维护动作，当前都以 disabled + `v0.2` 文案保留。
- 这些入口不会继续触发误导性命令、假提交或 desynced overlay。

### 5. 运行时 SVG 资产边界已成立

- 运行时代码当前只引用 `packages/app/src/assets/**`。
- `UI/svg/**` 仅保留为设计源素材库；来源映射见 `packages/app/src/assets/README.md`。
- 全仓未发现第三方图标库残留。

## 当前仍存在的残余项

### 1. Settings 仍不持久化

**标签：** `v0.2 defer`

- 设置写入目前只保存在进程内快照。
- 重启后会恢复默认值。
- 这不阻断 v0.1 主路径，但仍不是完整配置中心。

### 2. 引擎适配器仍需手动接入

**标签：** `v0.2 defer`

- Core 已有模块探测与显式状态语义。
- 但 Claude / Codex 适配器仍需要人工外部启动，Core 不会自动拉起它们。
- 因此 `create-run` 创建的是可解释的 run，不是自动执行闭环。

### 3. 历史浏览仍为占位

**标签：** `v0.2 defer`

- Empty 次动作 `浏览历史` 当前保留为 disabled 入口。
- 这是有意保留的次级路径延期，不阻断 workspace-first 主路径。

### 4. Inspector 的部分治理 / 记忆写动作仍未接通

**标签：** `v0.2 defer`

- `Resolve Drift`
- `Approve Gate`
- `Block Gate`
- `Pin / Edit / Supersede`

这些动作当前仍是可见但 disabled 的占位，等待 v0.2 接通真实写路径。

### 5. 封版材料已入库，但尚无自动化视觉 diff 门禁

**标签：** `report-only`

- `docs/archive/v0.1-closure/sign-off/` 已提交 Active / Empty / Settings 截图。
- 当前仓库还没有把这些截图接入自动化视觉回归门禁。

## 结论

- v0.1 的主路径、状态语义、Settings IA、占位诚实性与 sign-off 材料已经对齐。
- 剩余问题集中在明确延期到 v0.2 的能力，而不是主路径失真。
- 因此本审计不再把 `workspace-first 未成立`、`Settings IA 未完成`、`运行时资产边界未收口` 视为当前偏差项。
