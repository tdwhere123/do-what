# C004 - 补齐 Core / Engine / Soul 默认接线与状态语义

**优先级：** P0  
**依赖：** C003  
**涉及范围：**

- `packages/core/src/`
- `packages/app/src/app/`
- `packages/app/src/stores/`
- `packages/app/src/components/sidebar/`
- 如需状态字段扩展：`packages/protocol/src/`、`docs/INTERFACE_INDEX.md`

---

## 背景

当前产品最致命的问题之一，不是单个按钮没接，而是模块状态缺乏诚实性：

- Engine 默认未接线或未探测
- Core / Engine / Soul 容易长期停在 `unknown`
- UI 无法区分正在启动、未安装、探测失败、认证失败和已连接

---

## 目标

1. 让 Core、Engine、Soul 默认进入“尝试接线并诚实反馈”的路径。
2. 定义一套可解释的状态集合，替代长期 `unknown`。
3. 让左下状态区与后续 Settings 引擎页共享同一套状态语义。

---

## 本任务必须完成

1. 明确 Core、Engine、Soul 的状态集合及转移规则。
2. 至少区分以下引擎状态：
   - `connected`
   - `disconnected`
   - `not_installed`
   - `probe_failed`
   - `auth_failed`
   - `disabled`
3. 默认路径下主动尝试探测本地引擎，但失败不能阻断 App 启动。
4. 状态区必须反映真实模块状态，而不是硬编码占位。
5. 若状态结构、快照字段或 SSE 契约变化，必须同步 protocol 与接口文档。

---

## 本任务不包含

- 不实现未来的多引擎编排。
- 不做完整熔断、退避和高级观测体系。
- 不要求一次打通所有引擎类型。

---

## 验收标准（DoD）

1. 启动后，Core / Engine / Soul 状态在合理时间内进入可解释状态。
2. 无引擎或引擎异常时，App 仍可进入主界面，但状态诚实可见。
3. 左下状态区不再长期显示 `unknown`。
4. 若接口字段变化，`docs/INTERFACE_INDEX.md` 已同步更新。

---

## 完成后更新

- [x] `closure-overview.md` 中 C004 状态改为“已完成”
- [x] `AGENTS.md` 中收口任务进度同步
- [x] 若新增接口或状态字段，`docs/INTERFACE_INDEX.md` 追加变更记录
