# GLOSSARY.md — do-what v0.1.x canonical terms

This glossary aligns code comments and docs without renaming public TypeScript symbols, SQLite columns, or API fields.

## Core terms

- `hot_state`: Core 内存中的控制态视图，由 `GET /state` 暴露；包含 Run 状态、审批队列和最近事件。它不是异步 `projection`，也不是 `ledger`。
- `projection`: 基于持久化数据异步聚合出来的只读视图，用于检索、历史聚合或图探索，不参与控制流判定。
- `ledger`: append-only 决策记录。当前专指 `~/.do-what/evidence/user_decisions.jsonl`；其他事件记录统一称 `log`，例如 `event_log`。

## Soul terms

- `canon`: Soul cue 的最高置信级别。只有 `impact_level = 'canon'` 的 cue 可以写入 `memory_repo`；`working` 和 `consolidated` 只写 SQLite。
- `formation_kind`: `memory_cues.formation_kind` 的认知形成方式。合法值：`observation | inference | synthesis | interaction`。
- `dimension`: `memory_cues.dimension` 的语义维度。合法值：`technical | behavioral | contextual | relational`。

## Known naming debt

- `StateStore`、`SoulStateStore`、`getSnapshot()` 和 `snapshots` 表属于历史命名，为了 API 与 schema 稳定性暂不重命名；文档与注释中优先使用 `hot_state`、`db`、`repo` 这些边界更清晰的术语。
- SQL 列名继续保持 `snake_case`，例如 `formation_kind`、`focus_surface`；适配器内部若已存在 camelCase 映射，继续沿用现有导出名，不在 T030 内改动。
