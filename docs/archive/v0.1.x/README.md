# v0.1.x Archive

归档时间：2026-03-09

这个目录保存 v0.1.x 收敛阶段的定稿方案、任务卡与完成记录，便于追溯，不再作为当前默认 backlog。

## 摘要

- [`do-what-v0.1.x.md`](./do-what-v0.1.x.md)：v0.1.x 收敛/清理方案定稿，定义 Phase 0–3 的目标、约束与实施边界。
- [`tasks/`](./tasks/)：T028–T045 的详细任务卡，保留目标、范围、文件清单、DoD 与验收命令。

## 阶段完成情况

v0.1 主线（E0–E7，T001–T027，40 个 soul 测试）已全部交付。
v0.1.x 是收敛/清理/补魂阶段：不引入颠覆性架构变化，只做减法、补全和精化。Phase 0（T028–T030）、Phase 1（T031–T037）、Phase 2（T038–T041）与 Phase 3（T042–T045）现已全部完成。

---

## Phase 结构

| Phase | ID 范围 | 主题 | 优先级 |
|-------|---------|------|--------|
| Phase 0 | T028–T030 | 清理减法 | P0 |
| Phase 1 | T031–T037 | SOUL 补全 | P1 |
| Phase 2 | T038–T041 | Core 四层分离 | P2 |
| Phase 3 | T042–T045 | 编排与治理 | P3 |

---

## Phase 0 — 清理减法（T028–T030）

删除 v0.1 遗留临时 shim、合并同义事件、统一文档命名边界。
不改变任何接口语义，只做减法。

| ID | 名称 | 路线 | 状态 |
|----|------|------|------|
| T028 | adapter-layer-cleanup | A：接入层清理 | 完成 |
| T029 | event-state-reduction | B：事件/状态减法 | 完成 |
| T030 | doc-naming-cleanup | K：文档命名收边 | 完成 |

---

## Phase 1 — SOUL 补全（T031–T037）

激活 `memory_cues` 表中 dormant 字段（`formation_kind`/`dimension`/`focus_surface`/`claim_*`），
补全 ContextLens 组装、Claim Form 写入门控、记忆动力学、有界图回忆、证据胶囊、用户决策 ledger。

| ID | 名称 | 路线 | 状态 |
|----|------|------|------|
| T031 | soul-concept-unification | H：概念减法+命名统一 | 完成 |
| T032 | context-lens | 6.12 章 | 完成 |
| T033 | claim-form-memory-slot | 6.4–6.5 章 | 完成 |
| T034 | memory-dynamics | 6.9 章 | 完成 |
| T035 | graph-recall-bounded | 6.8 章 | 完成 |
| T036 | evidence-capsule | 7.1 章 | 完成 |
| T037 | user-ledger | 7.2 章 | 完成 |

---

## Phase 2 — Core 四层分离（T038–T041）

从 EventLog 快照提取 `CoreHotState` 内存对象；建立 `Projection` 异步读模型；
引入 `Ack Overlay`；`memory_repo` 降格为仅 Canon 级写入。

| ID | 名称 | 路线 | 状态 |
|----|------|------|------|
| T038 | core-hot-state | C：控制态与 Projection 分离 | 完成 |
| T039 | projection-layer | C（续）+ D：异步读模型 | 完成 |
| T040 | ack-overlay-sync-async | C/D：Ack Overlay + 路径硬切分 | 完成 |
| T041 | memory-repo-demotion | I：memory_repo 降格典藏层 | 完成 |

---

## Phase 3 — 编排与治理（T042–T045）

精确漂移判定（FocusSurface + BaselineLock）、三类漂移 IntegrationGate、
GovernanceLease 预飞行治理、编排拓扑约束（仅允许 4 种合法拓扑）。

| ID | 名称 | 路线 | 状态 |
|----|------|------|------|
| T042 | focus-surface-baseline-lock | F：精确漂移判定 | 完成 |
| T043 | integration-gate | F（续）：三类漂移 + 防活锁 | 完成 |
| T044 | governance-lease | G：预飞行治理 + 原生表面报告 | 完成 |
| T045 | orchestration-template-constraints | E：编排减法 + 四种允许拓扑 | 完成 |

---

## 依赖关系

```
T028 → T029 → T030          # Phase 0 串行（减法先于命名整理）
T031 → T032 → T033 → T034   # Phase 1 主链
T031 → T035                  # 图回忆依赖概念统一
T033 → T036 → T037           # 证据胶囊依赖 Claim Form
T029 → T038 → T039 → T040   # Phase 2 主链（状态减法先于分层）
T031 → T041                  # memory_repo 降格依赖概念统一
T040 → T042 → T043           # Phase 3 主链
T044 ← T042, T043            # GovernanceLease 依赖漂移判定
T045 独立（可与 T042 并行）
```

---

## 关键约束（v0.1.x 新增）

1. **dormant 字段启用**：`formation_kind`/`dimension`/`focus_surface`/`claim_*` 必须经 migration v6 激活，不允许在 v5 schema 上直接写入。
2. **Claim 写入门控**：`claim_draft` 只能经 checkpoint 事件写入 `claim_*` 字段，不允许引擎直接写。
3. **memory_repo 降格**：Working/Consolidated 级 cue 只写 SQLite；只有 Canon 级才写 memory_repo。
4. **编排拓扑约束**：仅允许 4 种合法拓扑（线性/单层并发汇聚/受控 revise loop/有界 fan-out），禁止任意自由 DAG。
