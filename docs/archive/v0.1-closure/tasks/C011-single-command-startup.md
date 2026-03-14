# C011 - 同步 README 与实现边界文档

**优先级：** P1  
**依赖：** C010  
**涉及范围：**

- `README.md`
- `docs/implementation-status-v0.1.md`
- 如有接口变化：`docs/INTERFACE_INDEX.md`

---

## 背景

到 C010 完成时，代码主路径、状态语义、Settings 边界和 UI 结构都已经发生变化。  
如果文档不跟上，仓库入口又会回到“代码一套、文档另一套”的失真状态。

---

## 目标

1. 让 README 回到新的默认启动路径与真实限制。
2. 让 `implementation-status-v0.1.md` 反映新的模块边界与已知限制。
3. 让接口索引只记录真实已落地的契约变化。
4. 只在代码已经满足时更新 README，不把目标态写成现状。

---

## 本任务必须完成

1. 仅当代码已经满足时，README 的默认启动说明才改为新的主路径。
2. README 的已知限制只写当前真实存在的限制，不提前把未完成能力写成已完成。
3. `docs/implementation-status-v0.1.md` 同步模块连接、Settings 状态、占位能力与延期边界。
4. 若前序任务修改了 protocol、HTTP、状态字段或设置快照，必须同步 `docs/INTERFACE_INDEX.md`。

---

## 本任务不包含

- 不再修改任务体系本身。
- 不补写与当前代码无关的目标态文档。
- 不把尚未实现的能力写成已完成。

---

## 验收标准（DoD）

1. README 只陈述当前代码已经满足的启动路径与已知限制。
2. `docs/implementation-status-v0.1.md` 能准确描述新的实现边界。
3. 若接口有变化，`docs/INTERFACE_INDEX.md` 已同步。
4. 文档与当前代码行为一致，不再互相冲突。

---

## 完成记录（2026-03-14）

- README 已同步默认 `pnpm dev`、workspace-first 主路径、五域 Settings 和当前真实限制。
- `docs/implementation-status-v0.1.md` 已移除过时的 workspace-first / Settings IA 偏差，并改为当前延期边界。
- 本轮未新增 protocol 或 Core HTTP 契约，因此 `docs/INTERFACE_INDEX.md` 无需追加变更记录。

## 完成后更新

- [x] `closure-overview.md` 中 C011 状态改为“已完成”
- [x] `AGENTS.md` 中收口任务进度同步
- [x] 若新增接口，`docs/INTERFACE_INDEX.md` 追加变更记录
