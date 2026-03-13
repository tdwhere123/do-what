# C002 - 修复 bootstrap 错误诚实性

**优先级：** P0  
**依赖：** C001  
**涉及范围：**

- `packages/app/src/app/`
- `packages/app/src/lib/core-http-client/`
- `packages/app/src/stores/`
- 如需状态字段或错误契约调整：`packages/protocol/src/`、`docs/INTERFACE_INDEX.md`

---

## 背景

当前启动失败时，UI 常把不同问题都折叠成同一条 bootstrap 失败文案。  
如果 C002 不先完成，后续涉及 workspace、模块接线、启动编排的任务都只能靠猜。

---

## 目标

1. 让 bootstrap 阶段的真实错误可以被看见。
2. 让失败阶段、真实错误消息和当前模块状态同时可见。
3. 把 `unknown` 限制为短暂初始态，而不是失败后的长期稳定态。

---

## 本任务必须完成

1. 修复 bootstrap 路径的错误归一化逻辑，不再吞掉真实后端错误。
2. 区分至少以下场景：
   - Core 不可达
   - 会话鉴权失败
   - workbench snapshot 请求失败
   - 模块初始化失败
3. bootstrap 失败时，页面必须同时暴露：
   - 失败阶段
   - 真实错误消息
   - 当前模块状态
4. 若离线态与错误态并存，必须明确判定规则。
5. 若新增状态字段、错误字段或接口契约，必须同步更新 protocol 与接口文档。

---

## 本任务不包含

- 不设计完整诊断中心。
- 不实现所有模块的最终接线逻辑。
- 不修改 UI fidelity 或页面结构。

---

## 验收标准（DoD）

1. 停掉 Core 启动 App 时，显示明确的 Core 不可达信息，而不是统一 bootstrap 错误。
2. 人为制造 401、500、snapshot 失败时，UI 能区分不同错误。
3. bootstrap 失败后，模块状态不再长期停在 `unknown`。
4. 后续任务调试时，不再需要依赖模糊通用报错。

---

## 完成后更新

- [ ] `closure-overview.md` 中 C002 状态改为“已完成”
- [ ] `AGENTS.md` 中收口任务进度同步
- [ ] 若接口字段有变化，`docs/INTERFACE_INDEX.md` 追加变更记录
