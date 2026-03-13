# C003 - 建立 workspace-first 主业务契约

**优先级：** P0  
**依赖：** C002  
**涉及范围：**

- `packages/app/src/components/`
- `packages/app/src/pages/`
- `packages/app/src/lib/commands/`
- `packages/core/src/server/`
- 如需新增命令、HTTP 端点或 schema：`packages/protocol/src/`、`docs/INTERFACE_INDEX.md`

---

## 背景

当前实现容易滑向“先创建 run，再补 workspace”的错误业务顺序。  
这会直接影响 Empty 页、左栏树、New Run modal 和列表选中逻辑。

---

## 目标

1. 把“先 workspace，后 run”写成唯一正确的业务顺序。
2. 让 Empty 页、Sidebar、New Run modal 都围绕 workspace-first 语义工作。
3. 停止把 run 当作脱离 workspace 的独立实体。

---

## 本任务必须完成

1. Core 与 UI 的主业务顺序统一为：
   - 进入 App
   - 创建或打开 workspace
   - 在该 workspace 下创建 run
2. Empty 页必须把 `打开工作区` 作为第一动作。
3. 左栏 `新建 Run` 不能绕过 workspace 直接创建孤立 run。
4. New Run modal 可以打开，但提交前必须校验 workspace 条件。
5. 若 `createRun()` 仍保留 workspace upsert，只能作为防御性兜底，不能再作为主路径。
6. 若新增命令、端点或 schema，必须同步 protocol 与接口文档。

---

## 本任务不包含

- 不实现 workspace 的高级管理能力。
- 不做多仓库收藏、排序、重命名等增强功能。
- 不做页面级视觉还原。

---

## 验收标准（DoD）

1. 用户首次进入时，会先看到创建或打开 workspace 的明确入口。
2. 创建 run 的行为只能发生在已存在 workspace 的前提下。
3. 左栏树与空态文案都围绕 workspace-first 语义展开。
4. 若涉及接口变更，`docs/INTERFACE_INDEX.md` 已同步更新。

---

## 完成后更新

- [ ] `closure-overview.md` 中 C003 状态改为“已完成”
- [ ] `AGENTS.md` 中收口任务进度同步
- [ ] 若新增接口，`docs/INTERFACE_INDEX.md` 追加变更记录
