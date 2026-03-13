# C009 — 修正为“先建 workspace，再建 run”的主业务流

**优先级：** P0（必须，当前主业务逻辑不成立）
**涉及范围：**
- `packages/app/src/components/sidebar/`
- `packages/app/src/pages/workbench/`
- `packages/app/src/lib/commands/`
- `packages/core/src/server/`
- 如需新增命令或接口：`packages/protocol/src/` 与 `docs/INTERFACE_INDEX.md`

---

## 背景

当前实现与产品期望不一致：

- 前端侧边栏只有 `New Run`，没有显式创建 workspace 的入口
- Workbench 当前把 workspace 视为 snapshot 中已有的数据，而不是用户可创建的业务实体
- Core 当前 `createRun()` 会在创建 run 时隐式 upsert workspace

这会导致两个问题：

1. 用户无法按正确业务模型理解产品
2. UI 空态、列表结构、默认选中逻辑都会围绕错误的业务前提构建

---

## 目标

1. 把 v0.1 主业务流改回“先创建 workspace，再在该 workspace 下创建 run”
2. 让 workspace 成为显式可见、可创建、可选择的业务对象
3. 停止依赖 create run 时隐式补全 workspace 的错误语义

---

## 本任务必须完成

1. 前端必须新增创建 workspace 的显式入口：
   - Sidebar 头部 `+`
   - 空态页入口
   - 如设计稿需要，可通过 modal / inline form / sheet 完成
2. Core 必须提供真实的 workspace creation 路径：
   - 不再只靠 create run 时 `WORKSPACE_UPSERT`
   - 若需新增 UI command 或 HTTP endpoint，必须在 protocol / docs 中同步定义
3. create run 的前提必须变为“目标 workspace 已存在”
4. 无 workspace 时的页面要进入正确空态，而不是假设已有 workspace
5. 列表、选中逻辑和新建流程要按 workspace-first 重构：
   - 先选 workspace
   - 再展示该 workspace 下 run 列表
   - 再创建 run
6. 若保留 `createRun()` 中的 workspace upsert，也必须降级为防御性兜底，不能再作为主业务入口

---

## 本任务不包含

- 不要求一次做完整 workspace 重命名、删除、排序、收藏
- 不要求一次做多仓库高级管理
- 不要求把 workspace 配置管理全部做完

---

## 验收标准（DoD）

1. 用户首次进入时，如果没有 workspace，会看到创建 workspace 的明确入口
2. 用户可以显式创建 workspace，并在列表中看到它
3. 用户必须在某个已存在 workspace 下创建 run
4. 不再依赖“创建 run 时顺带生成 workspace”作为主路径
5. 若任务新增了 command / endpoint / schema，`docs/INTERFACE_INDEX.md` 已同步更新

---

## 人工严苛验收标准

- [ ] 进入 App 后，**必须先看到创建 workspace 的明确入口**，不能直接进入 run 列表
- [ ] 可以成功创建 workspace，workspace 出现在侧边列表中
- [ ] 创建 run 的入口**只能在已选定 workspace 之后才显示或激活**，不允许在没有 workspace 时能触发 create run
- [ ] create run 成功后，run 出现在当前 workspace 下，不挂在游离位置
- [ ] 若新增了 HTTP endpoint 或 command，`docs/INTERFACE_INDEX.md` 已同步更新
- [ ] `pnpm -w test` 全通过（core 104/104 不能掉）
- [ ] 若 `createRun()` 仍保留 workspace upsert，已降级为兜底防御，不再作为主路径入口

## 完成后更新

- [ ] `closure-overview.md` 中 C009 状态改为”已完成”
- [ ] `AGENTS.md` 中收口任务进度同步
- [ ] 若新增接口，`docs/INTERFACE_INDEX.md` 追加变更记录

