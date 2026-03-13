# C013 — 修复 bootstrap 错误透传与诊断诚实性

**优先级：** P0（必须，当前错误提示无法支持调试和验收）
**涉及范围：**
- `packages/app/src/app/core-services-bootstrap.tsx`
- `packages/app/src/lib/core-http-client/`
- `packages/app/src/lib/contracts/`
- `packages/app/src/stores/hot-state/`

---

## 背景

当前启动失败时，UI 经常只显示：

- `Workbench bootstrap failed`
- `Failed to bootstrap workbench`

但这并不能反映真实原因。当前前端已经暴露出以下问题：

- `/api/workbench/snapshot` 真正失败原因会被通用文案覆盖
- Core / Engine / Soul 状态会长期停在 `unknown`
- 用户和开发者无法区分是鉴权失败、模块未就绪、快照异常还是后端错误

在后续收口任务中，如果不先修复错误透传，所有问题都会继续变成“只能猜”。

---

## 目标

1. 让 bootstrap 阶段的真实错误能够显示出来
2. 让状态区和错误提示共同反映真实阻断点
3. 让 C009 / C010 / C011 的调试和人工验收具备可操作性

---

## 本任务必须完成

1. 修复 bootstrap 路径中的错误归一化逻辑，不能再吞掉 `CoreHttpError` 等真实后端错误
2. `/api/workbench/snapshot`、`/health`、鉴权失败、后端 4xx/5xx 的错误信息必须能区分显示
3. bootstrap 失败时需要让 UI 同时暴露：
   - 失败阶段
   - 真实错误消息
   - 当前模块状态
4. `unknown` 只能作为短暂初始态，不能在失败后继续成为主要反馈
5. 若需要保留离线态与错误态并存，必须有清晰判定规则：
   - Core 不可达
   - Core 可达但模块未就绪
   - Core 可达但 snapshot/鉴权失败

---

## 本任务不包含

- 不要求一次做完整诊断中心或开发者面板
- 不要求一次收集所有遥测信息
- 不要求改变 C010 中的模块状态设计边界

---

## 验收标准（DoD）

1. 人为制造 bootstrap 失败时，UI 不再只显示统一文案
2. 401、404、409、500、Core 不可达等场景能够区分出不同错误
3. 用户能从 UI 看出问题在 Core 不可达、引擎未就绪、鉴权失败还是快照失败
4. 后续执行收口任务时，不再需要依赖猜测或只看控制台模糊报错

---

## 人工严苛验收标准

- [ ] 停掉 Core 进程后启动 App，显示**明确的”Core 不可达”或”连接失败”**，不是通用 “bootstrap failed”
- [ ] 修改 session token 制造 401，App 显示**鉴权失败相关提示**，不是通用文案
- [ ] 让 `/api/workbench/snapshot` 返回 500，App 显示 snapshot 失败，不是通用 bootstrap 错误
- [ ] `unknown` 状态在 bootstrap 失败后**不能持续超过 10 秒**，必须转变为具体失败状态
- [ ] bootstrap 失败时页面同时展示：**失败阶段 + 真实错误消息 + 当前模块状态**（三者缺一不可）
- [ ] `pnpm -w test` 全通过

## 完成后更新

- [ ] `closure-overview.md` 中 C013 状态改为”已完成”
- [ ] `AGENTS.md` 中收口任务进度同步
