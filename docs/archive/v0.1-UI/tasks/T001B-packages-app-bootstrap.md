# T001B · packages-app-bootstrap（`packages/app` 工程骨架任务）

**Epic:** v0.1-UI  
**分组:** Foundation  
**依赖:** T001A  
**可并行:** 否  
**状态:** 已完成  

---

## 目标

把 T001A 已拍板的 runtime/scaffold 决策落实为 `packages/app` 的可执行工程骨架，
让后续 UI、store、client、测试任务都有稳定落点。

---

## 涉及文件/目录

```text
packages/app/
packages/app/package.json
packages/app/forge.config.js
packages/app/vite.main.config.ts
packages/app/vite.preload.config.ts
packages/app/vite.renderer.config.ts
packages/app/src/main/main.ts
packages/app/src/preload/preload.ts
packages/app/src/renderer/index.html
packages/app/src/renderer/index.tsx
packages/app/src/app/app-root.tsx
packages/app/src/app/App.tsx
packages/app/src/app/routes/workbench-page.tsx
packages/app/src/app/routes/settings-page.tsx
packages/app/src/styles/tokens.css
packages/app/src/styles/global.css
packages/app/src/stores/ui-shell-store.ts
packages/app/src/vendor/
packages/app/src/app/app-root.test.tsx
packages/app/src/preload/preload.test.ts
packages/app/src/stores/ui-shell-store.test.ts
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

- [x] `packages/app` 可启动
- [x] Electron `main / preload / renderer` 边界建立
- [x] React 入口建立
- [x] `HashRouter` 路由骨架建立
- [x] Query client / Zustand store 挂载点建立
- [x] 全局 token 与 CSS Modules 基础样式挂载点建立
- [x] 后续 UI 任务可以在这个骨架上继续推进

---

## 验收记录

- `pnpm --filter @do-what/app exec tsc --noEmit`
- `pnpm --filter @do-what/app test`
- `pnpm --filter @do-what/app build`
- `pnpm --filter @do-what/app start`
- 手动验收通过：默认 Workbench 正常渲染，`#/settings` 可切换，`window.doWhatRuntime` 可读，`typeof window.require === 'undefined'`

---

## 风险 / 注意事项

- T001B 不再讨论技术选型，只负责落实 T001A 已拍板结果。
- 若实现时发现仓库约束与 T001A 决策冲突，需要显式回写决策文档，而不是在骨架任务里临时改口。
