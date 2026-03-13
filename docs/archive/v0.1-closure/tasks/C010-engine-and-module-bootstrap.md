# C010 — 补齐 Core / Engine / Soul 默认接线与状态诚实性

**优先级：** P0（必须，当前模块连通性不成立）
**涉及范围：**
- `packages/core/src/server/`
- `packages/core/src/machines/`
- `packages/app/src/app/`
- `packages/app/src/stores/`
- `packages/app/src/components/sidebar/`
- 如需新增状态字段或事件：`packages/protocol/src/` 与 `docs/INTERFACE_INDEX.md`

---

## 背景

当前产品状态和业务预期不一致：

- engine 默认未实际尝试拉起或接线
- 左下角 Core / Engine / Soul 状态长期显示 `unknown`
- UI 很难区分“模块正在启动”“模块未连接”“模块启动失败”“模块健康正常”

这会导致：

- 用户无法判断系统是否真正在工作
- Create Run 之后也无法确认引擎层是否准备完成
- 收口阶段无法建立可用的默认主路径

---

## 目标

1. 让 Core / Engine / Soul 在默认路径下尝试进入可用态
2. 让状态区反映真实连接情况，而不是停在占位值
3. 即使接线失败，也要诚实展示失败原因和可恢复路径

---

## v0.1 默认接线策略（必须遵守）

- **默认接线引擎：Claude（`packages/engines/claude`）**
- **策略：** 尝试接线；若 `claude` 二进制不在 PATH 或连接失败，Engine 状态降级为 `disconnected`（有具体失败原因），**不阻断 App 启动，不阻断主路径**
- **不支持的行为：** 因引擎不存在而 throw fatal / 停止 bootstrap / 让 App 卡死
- Codex 引擎（`packages/engines/codex`）同理：尝试可选接线，失败则 `disconnected`，不 fatal

## 本任务必须完成

1. 核对并补齐 Core 启动路径中的 engine 接线：
   - 不能只保留 `engine-machine.ts` 和测试实现而不在真实启动路径中使用
   - 默认尝试连接 Claude 引擎适配器（见上方策略）
2. 明确 Core / Engine / Soul 各自的状态模型：
   - `starting`
   - `healthy` / `connected`
   - `idle`
   - `degraded` / `error`
   - `disconnected`
   - 禁止长期以 `unknown` 作为稳定态
3. 前端健康状态显示必须与真实模块状态绑定：
   - 不再只显示硬编码占位值
   - 不再让状态区在核心模块已经失败时看不出问题
4. 引擎默认尝试拉起失败时，UI 必须有诚实反馈，而不是沉默降级
5. 若状态结构、SSE 事件或快照字段需要扩展，必须同步更新 protocol 与接口文档

---

## 本任务不包含

- 不要求一次支持所有未来引擎类型或复杂热插拔能力
- 不要求一次实现完整熔断、恢复、退避和多引擎编排策略
- 不要求把所有高级观测指标都接进 UI

---

## 验收标准（DoD）

1. 默认启动路径下，Core / Engine / Soul 会主动尝试接线
2. 左下角状态不再长期停留在 `unknown`
3. 引擎未能启动或连接时，UI 能明确看出失败或降级状态
4. 成功接线时，状态区能稳定反映真实模块状态
5. 若任务改动了状态 schema / snapshot / SSE 字段，`docs/INTERFACE_INDEX.md` 已同步更新

---

## 人工严苛验收标准

- [ ] 启动后 30 秒内，左下角状态区**不再持续显示 `unknown`**
- [ ] Core 状态稳定显示 `healthy`（或 `degraded`，但不是 `unknown`）
- [ ] Engine 状态：Claude 引擎已启动时显示 `connected/healthy`；未启动时显示 `disconnected` 或具体失败原因，**不得保持 `unknown`**
- [ ] Soul 状态同理，不能长期 `unknown`
- [ ] 人为关掉引擎进程，UI 在 ≤60s 内更新为 `disconnected` 或 `error`
- [ ] `claude` 二进制不在 PATH 时，App 仍可启动并进入 Workbench，Engine 状态显示失败原因而不是崩溃
- [ ] 若新增 SSE 事件或 snapshot 字段，`docs/INTERFACE_INDEX.md` 已同步更新
- [ ] `pnpm -w test` 全通过

## 完成后更新

- [ ] `closure-overview.md` 中 C010 状态改为”已完成”
- [ ] `AGENTS.md` 中收口任务进度同步
- [ ] 若新增接口或状态字段，`docs/INTERFACE_INDEX.md` 追加变更记录

