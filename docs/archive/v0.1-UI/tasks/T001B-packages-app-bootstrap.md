# T001B · packages-app-bootstrap（`packages/app` 工程骨架任务）

**Epic:** v0.1-UI  
**分组:** Foundation  
**依赖:** T001A  
**可并行:** 否  
**状态:** 待开始  

---

## 目标

把 T001A 已拍板的 runtime/scaffold 决策落实为 `packages/app` 的可执行工程骨架，
让后续 UI、store、client、测试任务都有稳定落点。

---

## 涉及文件/目录

```text
packages/app/
packages/app/package.json
packages/app/src/
packages/app/src/main/
packages/app/src/preload/
packages/app/src/renderer/
packages/app/src/app/
packages/app/src/styles/
packages/app/src/stores/
```

---

## 实现要点

- 按已拍板方案落地：Vite + Electron Forge + Vite 插件 + Electron Forge makers。
- 建立 Electron `main / preload / renderer` 清晰边界。
- 建立 React renderer 入口与应用根组件挂载点。
- 建立 `React Router + HashRouter` 的路由骨架，至少承载 Workbench / Settings 页面壳层。
- 建立 TanStack Query 的 query client 挂载点与 Zustand store provider / 接入点。
- 建立全局 design token 与 CSS Modules 的样式挂载点。

---

## 验收标准

- [ ] `packages/app` 可启动
- [ ] Electron `main / preload / renderer` 边界建立
- [ ] React 入口建立
- [ ] `HashRouter` 路由骨架建立
- [ ] Query client / Zustand store 挂载点建立
- [ ] 全局 token 与 CSS Modules 基础样式挂载点建立
- [ ] 后续 UI 任务可以在这个骨架上继续推进

---

## 风险 / 注意事项

- T001B 不再讨论技术选型，只负责落实 T001A 已拍板结果。
- 若实现时发现仓库约束与 T001A 决策冲突，需要显式回写决策文档，而不是在骨架任务里临时改口。
