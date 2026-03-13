# C001 - 重置 closure 基线与文档真相源

**优先级：** P0  
**依赖：** 无  
**当前状态：** 已完成（2026-03-13，任务体系已重置）  
**涉及范围：**

- `docs/archive/v0.1-closure/closure-overview.md`
- `docs/archive/v0.1-closure/tasks/C001-C013`
- `AGENTS.md`
- `UI/UI-DESIGN-SPEC.md`

---

## 背景

旧的 closure 文档体系已经失效，存在以下问题：

1. 任务卡沿用旧的并行思路，与当前收口主线冲突。
2. `closure-overview.md` 和 `AGENTS.md` 含有损坏字符，无法继续作为可靠入口。
3. UI 规范路径分裂为历史路径和版本化路径，真相源不唯一。

如果不先重置文档真相源，后续所有任务都会继续引用错误边界。

---

## 目标

1. 用新的线性任务体系替换旧的 closure 任务体系。
2. 统一 UI 规范真相源为 `UI/UI-DESIGN-SPEC.md`。
3. 清洗 `closure-overview.md` 与 `AGENTS.md` 的损坏编码。

---

## 本任务必须完成

1. 重写 `closure-overview.md`，明确旧任务体系已废弃，并建立新的线性任务表。
2. 覆盖 `tasks/C001-C013` 的旧正文，保留文件名与编号，但全部按新线性主线重写。
3. 重写 `AGENTS.md` 的当前阶段、任务进度、执行顺序和 UI 基线引用。
4. 将 UI 规范路径统一为 `UI/UI-DESIGN-SPEC.md`。
5. 清理 `closure-overview.md` 与 `AGENTS.md` 中的损坏字符。

---

## 本任务不包含

- 不实现任何运行时代码变更。
- 不更新 README、实现状态文档或接口索引的业务结论。
- 不保留旧任务正文的 legacy 目录副本。

---

## 验收标准（DoD）

1. `closure-overview.md` 明确声明旧任务体系已废弃。
2. `AGENTS.md`、`closure-overview.md`、任务卡中的编号、顺序与状态一致。
3. UI 规范的 canonical 路径为 `UI/UI-DESIGN-SPEC.md`。
4. `closure-overview.md` 与 `AGENTS.md` 不再含损坏字符。
5. C001 在新的任务表中标记为已完成，C002-C013 标记为待执行。

---

## 完成后更新

- [x] `closure-overview.md` 已切换到新任务体系
- [x] `AGENTS.md` 已同步
- [x] `UI/UI-DESIGN-SPEC.md` 已成为唯一 UI 规范路径
