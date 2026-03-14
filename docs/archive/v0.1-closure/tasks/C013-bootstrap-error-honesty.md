# C013 - 最终 UI fidelity 与 closure sign-off

**优先级：** P0  
**依赖：** C012  
**涉及范围：**

- `docs/archive/v0.1-closure/`
- `UI/preview-active.html`
- `UI/preview-empty.html`
- `UI/preview-settings.html`
- `UI/UI-DESIGN-SPEC.md`
- 已完成的 App 实现

---

## 背景

到 C012 结束时，主路径、状态语义、交互边界和主要页面都应已稳定。  
最后一步不是继续改范围，而是做一次可交付的封版 sign-off，防止“看起来差不多”被当成完成。

---

## 目标

1. 对照 preview 与 `UI/UI-DESIGN-SPEC.md` 做最终 UI fidelity 审查。
2. 交付一套可复核的 sign-off 材料。
3. 明确哪些项目仍延期到 v0.2，但不会阻断 v0.1 封版。
4. 将代码偏差审计摘要纳入最终 sign-off，而不是只交视觉材料。

---

## 本任务必须完成

1. 提交 preview 对照截图：
   - Active
   - Empty
   - Settings
2. 提交 A / B / C / D 交互清单的最终版本。
3. 提交 SVG 来源说明，明确设计源位于 `UI/svg/`，运行时引用位于 `packages/app/src/assets/`。
4. 提交第三方图标残留检查。
5. 提交代码偏差审计摘要，说明哪些问题仍只记录未修。
6. 提交剩余 v0.2 清单，说明其为何不阻断 v0.1 封版。
7. 以人可审阅的方式记录最终偏差项，而不是口头说明。

---

## 本任务不包含

- 不新增新的产品能力。
- 不继续扩张 v0.1 范围。
- 不用“整体看起来差不多”替代对照材料。

---

## 验收标准（DoD）

1. 存在完整的 preview 对照截图和说明。
2. 存在完整的 A / B / C / D 交互清单。
3. 已说明 SVG 设计源与运行时资产落点，且确认未残留第三方图标体系。
4. 已包含代码偏差审计摘要。
5. 已列出仍延期到 v0.2 的事项及理由。
6. 封版评审可以基于材料复核，而不是基于主观印象。

---

## 完成记录（2026-03-14）

- 已提交 `docs/archive/v0.1-closure/sign-off/active.png`、`empty.png`、`settings.png`。
- 已提交 `docs/archive/v0.1-closure/sign-off/sign-off.md`，包含 preview 对照、A/B/C/D 引用、SVG 来源、第三方图标检查、代码偏差摘要与 v0.2 清单。
- `docs/archive/v0.1-closure/code-vs-expected-audit.md` 已改为只保留当前真实残余项。

## 完成后更新

- [x] `closure-overview.md` 中 C013 状态改为“已完成”
- [x] `AGENTS.md` 中收口任务进度同步
