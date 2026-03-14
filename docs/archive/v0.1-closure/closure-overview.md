# v0.1 封版收口任务总览

**阶段：** v0.1 封版收口  
**日期：** 2026-03-13  
**原则：** 先建立可调试、可解释、可执行的主路径，再收紧交互边界与 UI 还原，最后做封版验收。

---

## 重置说明

旧的 closure 任务体系已废弃。自 2026-03-13 起，`docs/archive/v0.1-closure/tasks/` 按新的线性实施计划执行：

- 不再沿用旧的并行依赖和旧进度口径。
- 不再把旧任务中的“已完成”记录视为新任务体系的有效完成。
- 仅保留一条基础事实：任务体系已在本次文档重写中完成重置。

---

## 文档真相源

本轮收口相关的真相源优先级固定如下：

1. `UI/preview-active.html`
2. `UI/preview-empty.html`
3. `UI/preview-settings.html`
4. `UI/styles.css`
5. `UI/UI-DESIGN-SPEC.md`
6. `UI/svg/`（设计源素材库）
7. `packages/app/src/assets/`（运行时 SVG 资产落点）
8. `docs/archive/v0.1-closure/tasks/C001-C013`

`docs/archive/v0.1-closure/UI-task-adjustments-v0.1.md` 保留为说明材料，但不再作为并列真相源。

### 运行时资产边界

- `UI/` 是设计源目录，不是运行时资源目录。
- 运行时 UI 只能引用 `packages/app/src/assets/**` 下的 SVG 资产。
- `UI/svg/**` 继续保留为设计源素材库，设计来源必须可追溯，但运行时代码不得直接引用它。

### 本轮审计输出

- 本轮允许直接修改的代码范围以 `AGENTS.md` 为准：凡 v0.1 主路径成立所必需的改动，允许触达 `packages/app`、`packages/core`、启动脚本、必要文档，以及相关 `packages/protocol` schema。
- 其余与预期不符的实现问题，先记录到 `docs/archive/v0.1-closure/code-vs-expected-audit.md`，作为 closure 审计与后续实现依据。
- 产品体验阻断项以代码证据为准，不以历史任务文案或预期口头描述为准。

---

## 线性任务表

| ID | 任务 | 优先级 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| C001 | 重置 closure 基线与文档真相源 | P0 | - | 已完成（任务体系已重置） |
| C002 | 修复 bootstrap 错误诚实性 | P0 | C001 | 已完成 |
| C003 | 建立 workspace-first 主业务契约 | P0 | C002 | 已完成 |
| C004 | 补齐 Core / Engine / Soul 默认接线与状态语义 | P0 | C003 | 已完成 |
| C005 | 收口为单入口启动 | P0 | C004 | 已完成 |
| C006 | 建立 UI 交互分层模型 | P0 | C005 | 已完成 |
| C007 | 恢复 App 壳结构并剥离展示舞台 | P0 | C006 | 已完成 |
| C008 | 恢复 Empty 与 Sidebar 的 workspace-first 体验 | P0 | C007 | 已完成 |
| C009 | 恢复 Active / Workbench 主页面 | P0 | C008 | 已完成 |
| C010 | 重建 Settings 信息架构 | P0 | C009 | 待执行 |
| C011 | 同步 README 与实现边界文档 | P1 | C010 | 待执行 |
| C012 | 硬化占位能力与 UI 诚实性 | P1 | C011 | 待执行 |
| C013 | 最终 UI fidelity 与 closure sign-off | P0 | C012 | 待执行 |

> 任务卡文件名仍沿用历史路径；以正文主题和本表编号为准。

---

## 线性执行顺序

```text
C001 重置 closure 基线与文档真相源
-> C002 修复 bootstrap 错误诚实性
-> C003 建立 workspace-first 主业务契约
-> C004 补齐 Core / Engine / Soul 默认接线与状态语义
-> C005 收口为单入口启动
-> C006 建立 UI 交互分层模型
-> C007 恢复 App 壳结构并剥离展示舞台
-> C008 恢复 Empty 与 Sidebar 的 workspace-first 体验
-> C009 恢复 Active / Workbench 主页面
-> C010 重建 Settings 信息架构
-> C011 同步 README 与实现边界文档
-> C012 硬化占位能力与 UI 诚实性
-> C013 最终 UI fidelity 与 closure sign-off
```

---

## 每个任务的角色

- `C001`：重写总览、任务卡、`AGENTS.md` 和 UI 规范路径，建立新的收口真相源。
- `C002`：先修复 bootstrap 阶段的真实错误透传，确保后续任务具备可调试性。
- `C003`：把“先 workspace，后 run”写成唯一主业务契约，约束 Core/UI/接口的实现方向。
- `C004`：补齐 Core、Engine、Soul 的默认接线与状态语义，消除长期 `unknown`。
- `C005`：实现默认单入口启动，要求等待 Core 就绪且失败可解释。
- `C006`：把 Active、Empty、Settings 的关键交互按 A/B/C/D 分类，先定义哪些该真接线。
- `C007`：恢复 App shell 与页面骨架，剥离 preview 外层展示舞台，固定品牌和图标来源。
- `C008`：恢复 Empty 与 Sidebar 的 workspace-first 体验，包括创建 workspace、树结构、New Run 前置校验。
- `C009`：恢复 Active / Workbench 主页面，打通主输入区、右栏和 run 绑定关系。
- `C010`：重建 Settings 的五域信息架构，让引擎页承担真实状态查看与重新检测。
- `C011`：同步 README、实现边界文档和必要接口索引，使文档重新反映真实主路径。
- `C012`：把未接通能力统一处理为 disabled、tooltip、`v0.2 实现` 或纯展示。
- `C013`：提交 preview 对照、交互清单、SVG 审计与剩余 v0.2 清单，作为最终封版验收。

---

## 仍延期到 v0.2 的事项

以下项目保留在 v0.2，不作为 v0.1 收口阻塞项：

| 能力 | 理由 |
| --- | --- |
| Settings 持久化到 SQLite | 属于可延后的存储增强，不阻断当前主路径 |
| Soul “本次提升 / 忽略”的真实写入 | 不阻断 workspace / run 主链路 |
| 完整历史页面与历史浏览体验 | 属于次级浏览路径，可保留诚实占位 |
| 高级策略编辑器与复杂治理面板 | 属于高级治理能力，不是 v0.1 最小闭环 |
| 环境页安装器与自动修复流程 | 可用检测和状态说明替代 |
| 完整主题持久化与暗色模式 | UI 增强，不阻断主路径 |
| 完整 CI / CD 与测试体系标准化 | 工程治理项，不影响本地封版验收 |

---

## 封版检查清单

### 工程构建

- [ ] `pnpm install` 无错误
- [ ] `pnpm -w build` 无错误
- [ ] `pnpm -w test` 全部通过
- [ ] `pnpm -w typecheck` 无类型错误

### 默认运行路径

- [x] `pnpm dev` 可作为默认启动入口
- [x] Core 启动后可提供 `GET /health`
- [x] App 启动后不再卡在通用 bootstrap 错误
- [x] Core / Engine / Soul 状态在启动后进入可解释状态，不长期停在 `unknown`
- [ ] 用户可先创建 workspace，再在该 workspace 下创建 run
- [ ] Run 创建后，Workbench 的 timeline、右栏和输入区与当前 run 正确绑定

### UI 与交互诚实性

- [ ] 未实现功能被统一处理为 disabled、tooltip、`v0.2 实现` 或纯展示
- [ ] 以上占位能力不再触发误导性命令、假提交或 desynced overlay
- [ ] Active / Empty / Settings 的页面结构明显回到 preview 基线
- [ ] 运行时 SVG 仅来自 `packages/app/src/assets/`，且设计源可追溯到 `UI/svg/`
- [ ] 未引入第三方图标体系
- [ ] 外层展示舞台未被误实现为 App 内部背景

### 文档一致性

- [ ] `AGENTS.md`、`closure-overview.md`、任务卡中的编号、顺序、状态一致
- [ ] 全仓不再引用 `UI/UI-DESIGN-SPEC-v0.1.md`
- [ ] `docs/archive/v0.1-closure/code-vs-expected-audit.md` 已记录当前代码与预期的主要偏差
- [ ] `README.md` 与 `docs/implementation-status-v0.1.md` 反映新的主路径与边界
- [ ] 若接口发生变化，`docs/INTERFACE_INDEX.md` 已同步更新

### 最终 sign-off

- [ ] 已提交 preview 对照截图
- [ ] 已提交 A/B/C/D 交互清单
- [ ] 已提交 SVG 来源与第三方图标残留检查
- [ ] 已提交仍延期到 v0.2 的项目清单

---

## 归档规则

在 `git tag v0.1.0` 之后，才允许评估是否清理历史 archive 文档。  
`docs/archive/v0.1-closure/`、`UI/`、`AGENTS.md`、`README.md` 不在当前重写任务中删除。
