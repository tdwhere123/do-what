# v0.1 Closure Sign-off

**日期：** 2026-03-14  
**截图入口：**

- `/?transport=mock&mockScenario=active#/`
- `/?transport=mock&mockScenario=empty#/`
- `/?transport=mock&mockScenario=active#/settings`

**截图产物：**

- `active.png`
- `empty.png`
- `settings.png`

## Preview 对照结论

- Active：live workbench 保留了 preview-active 的三栏层级，左栏状态、中央 timeline / composer、右栏 changed files / plan / Git-collaboration 顺序已对齐；运行时有意去掉 preview 的外层舞台包装。
- Empty：live 页面已回到 preview-empty 的空态结构，但主动作按 v0.1 主路径调整为 `打开工作区`，`浏览历史` 改为 disabled 的诚实占位。
- Settings：live 页面保持 preview-settings 的独立 frame 语义，但内容 IA 已替换为更明确的五域结构，不再复刻旧的字段节布局。

## A / B / C / D 交互清单

最终交互分层清单见：`docs/archive/v0.1-closure/ui-interaction-matrix.md`

## SVG 来源说明

- 设计源：`UI/svg/**`
- 运行时资产：`packages/app/src/assets/**`
- 映射与使用说明：`packages/app/src/assets/README.md`

本轮再次核对后，运行时代码未直接引用 `UI/svg/**`。

## 第三方图标检查

- 全仓搜索未发现 `lucide`、`heroicons`、`phosphor`、`fontawesome`、`react-icons`、`@mui/icons-material` 或同类第三方图标库引用。
- 运行时图标继续限定在仓库内 SVG 资产与 raw SVG 组件封装。

## 代码偏差审计摘要

审计正文见：`docs/archive/v0.1-closure/code-vs-expected-audit.md`

当前不再视为偏差的项目：

- workspace-first 主路径
- Settings 五域信息架构
- Active / Workbench 的 run 绑定
- 运行时 SVG 资产边界

当前仍保留的残余项：

- Settings 不持久化
- 引擎适配器需手动接入
- 历史浏览仍为占位
- Inspector 的部分治理 / 记忆写动作仍为占位
- 尚无自动化视觉 diff 门禁

## 仍延期到 v0.2 的清单

- Settings 持久化到 SQLite
- Core 自动拉起 Claude / Codex 适配器
- 完整历史浏览页面
- Inspector 中治理 / 记忆维护动作的真实写路径
- 更完整的主题持久化与外观扩展

这些项目均不阻断 v0.1 的默认开发启动、workspace-first 主路径、run 绑定、状态解释或封版验收。
