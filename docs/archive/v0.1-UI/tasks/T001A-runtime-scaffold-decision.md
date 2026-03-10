# T001A · runtime-scaffold-decision（Runtime / Scaffold 决策已拍板）

**Epic:** v0.1-UI  
**分组:** Foundation  
**依赖:** 无  
**可并行:** 否  
**状态:** 已完成 / 已拍板  

---

## 目标

冻结 `packages/app` 的 runtime / scaffold 关键决策，避免后续任务继续围绕基础栈反复讨论。

---

## 涉及文件/目录

```text
docs/archive/v0.1-UI/runtime-scaffold-decision.md
docs/archive/v0.1-UI/task-breakdown.md
docs/archive/v0.1-UI/tasks/T001B-packages-app-bootstrap.md
```

---

## 实现要点

- 确认并锁定 bundler：Vite。
- 确认并锁定 Electron dev runner：Electron Forge + Vite 插件。
- 确认并锁定 packaging：Electron Forge makers。
- 确认并锁定 routing：React Router + HashRouter。
- 确认并锁定 state：TanStack Query + Zustand。
- 确认并锁定 styling：全局 design token + CSS Modules。

---

## 验收标准

- [x] Electron + React + TypeScript 不再被视为待确认项
- [x] routing 已明确到 `React Router + HashRouter`
- [x] runtime/scaffold 细节已在独立文档中拍板
- [x] 后续任务可以以本决策为前提继续推进

---

## 风险 / 注意事项

- 若未来需要调整这些基础决策，必须显式更新 `runtime-scaffold-decision.md`，不能在任务实施中隐式漂移。
- T001A 只记录决策，不代替 T001B 的实际骨架落地。
