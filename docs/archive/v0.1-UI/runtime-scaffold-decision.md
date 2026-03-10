# v0.1-UI Runtime / Scaffold 前置决策文档

> 状态：Accepted / locked by T001A
>
> 作用：本文件记录 `T001A-runtime-scaffold-decision` 的已拍板结果，
> 不进入业务实现，不改动既有任务卡的功能范围。
>
> 已确定前提：
> - Electron + React + TypeScript 方向已确定
> - Core / UI 分离，通过本地 HTTP + SSE 通信
> - 本文中的 runtime/scaffold 细节已拍板，不再作为待确认项悬空

---

## 1. 文档目的

本文件回答六个 runtime/scaffold 级问题：

1. bundler 选什么
2. Electron dev runner 选什么
3. packaging 方案选什么
4. 路由方案与路由模式选什么
5. 状态库落点怎么定
6. 样式系统载体怎么定

这些决策属于 `T001A` 的完成结果，并作为 `T001B` 及其后续任务的前置条件。

---

## 2. bundler 候选方案对比

| 方案 | 适用性 | 优点 | 风险 / 缺点 | 推荐度 |
|------|--------|------|-------------|--------|
| Vite | 高 | React 生态成熟、冷启动快、开发体验轻、适合 renderer 优先推进 | Electron main/preload 的组织方式需要再选配套方案 | 推荐 |
| Rsbuild / Rspack | 中 | 构建性能强、对大型前端项目扩展性好 | 当前仓库前端仍在起步期，额外心智成本偏高 | 可选 |
| Webpack 系方案 | 低-中 | 生态成熟、打包能力稳定 | 配置重量大、与本轮轻量 scaffold 目标不匹配 | 不优先 |

### 最终决定

**Vite**

### 理由

- 本轮首先要让 `packages/app` 从空壳进入“可开发、可验证”的状态。
- `UI/` 参考稿以静态 HTML/CSS/SVG 为主，迁移到 React 时更适合轻量、快速反馈的 bundler。
- 后续如需扩展 main/preload 构建策略，仍可在不推翻 renderer bundler 的前提下调整。

### 影响范围

- 直接影响：`T001B`
- 间接影响：`T003`、`T004`、`T005`、`T013-T029`、`T033-T034`

---

## 3. Electron dev runner 候选方案对比

| 方案 | 适用性 | 优点 | 风险 / 缺点 | 推荐度 |
|------|--------|------|-------------|--------|
| Electron Forge + Vite 插件 | 高 | 官方路径清晰、dev / package 流程一致、便于后续 makers | 需要接受 Forge 目录约定与生命周期 | 推荐 |
| electron-vite | 高 | Electron + Vite 一体化体验好、上手快 | 工具链收口较强，后续若要换 packaging 需要重新评估 | 可选 |
| 自定义 concurrently + wait-on + electron 启动脚本 | 中 | 灵活、最少框架约束 | 容易把 T001B 做成长期维护脚本工地 | 不优先 |

### 最终决定

**Electron Forge + Vite 插件**

### 理由

- 能把 dev runner 与 packaging 方案尽量统一，减少后续二次迁移。
- 对本轮 UI 任务最重要的是稳定、清晰的运行链路，而不是极限自定义。
- 与 `T001B` 的“先有正式 runtime/scaffold”目标最匹配。

### 影响范围

- 直接影响：`T001B`
- 间接影响：`T013`、`T028`、`T033`、`T034`

---

## 4. packaging 方案候选

| 方案 | 适用性 | 优点 | 风险 / 缺点 | 推荐度 |
|------|--------|------|-------------|--------|
| Electron Forge makers | 高 | 与 dev runner 一致、配置收口、适合本轮起步 | 个别深度定制场景能力不如独立 builder 丰富 | 推荐 |
| Electron Builder | 中-高 | 打包功能强、分发能力成熟 | 若 dev runner 不是 Builder 体系，会形成两套心智模型 | 可选 |
| 自定义 packager 流程 | 低 | 灵活 | 维护成本高，不适合当前阶段 | 不推荐 |

### 最终决定

**Electron Forge makers**

### 理由

- 若 dev runner 采用 Forge，则 packaging 同样放在 Forge 下最一致。
- 当前重点是先把 UI 工程落地并稳定迭代，不需要提前引入更复杂的分发体系。

### 影响范围

- 直接影响：`T001B`
- 间接影响：`T033`、`T034`

---

## 5. 路由方案候选

### 5.1 路由库候选

| 方案 | 适用性 | 优点 | 风险 / 缺点 | 推荐度 |
|------|--------|------|-------------|--------|
| React Router | 高 | Workbench / Settings 页面边界清晰、社区成熟、后续扩页成本低 | 仍需明确 Electron 下采用的路由模式 | 推荐 |
| 自定义本地 route state | 中 | 简单、无额外依赖 | 初期看似轻，后续页面增长时容易散落为 if/else | 不优先 |
| TanStack Router | 中 | 类型体验好、扩展性强 | 对当前页面规模偏重 | 可选 |

### 5.2 路由模式候选（Electron 环境）

| 模式 | 适用性 | 优点 | 风险 / 缺点 | 推荐度 |
|------|--------|------|-------------|--------|
| HashRouter | 高 | 对 Electron 本地资源加载最稳，不依赖 server fallback，避免 history 路径解析问题 | URL 形式较传统 Web 略“旧” | 推荐 |
| BrowserRouter | 中 | URL 更干净 | 在 Electron file/custom protocol 下需要额外处理 history fallback 与深链接 | 不优先 |
| MemoryRouter | 中 | 实现简单、不暴露 URL 结构 | 不适合作为正式页面导航骨架，页面切换与可观察性较弱 | 不优先 |

### 最终决定

**React Router + HashRouter**

### 理由

- 当前已知页面至少有 `Workbench` 与 `Settings`，需要正式页面路由而不是手写状态切换。
- 在 Electron 下，`HashRouter` 比 `BrowserRouter` 更稳，不依赖额外的 server/history fallback。
- 这符合“默认按 HashRouter 处理”的要求，也最适合当前仓库从零起步的稳定性目标。

### 影响范围

- 直接影响：`T001B`
- 间接影响：`T013`、`T015`、`T028`、`T033`、`T034`

---

## 6. 状态库落点建议

| 方案 | 适用性 | 优点 | 风险 / 缺点 | 推荐度 |
|------|--------|------|-------------|--------|
| TanStack Query + Zustand | 高 | 与文档中的 Query / Store 分层天然吻合，适合 hot/projection/pending/ui 多 store 结构 | 需要团队接受“双轨状态”心智 | 推荐 |
| Redux Toolkit + RTK Query | 中 | 工具齐全、规范强 | 对当前任务拆分显得偏重，样板较多 | 可选 |
| 纯自研 store + 自研 query cache | 低-中 | 最灵活 | 很容易把 T001B/T008-T012 做成基础设施工程 | 不推荐 |

### 最终决定

**TanStack Query + Zustand**

### 理由

- 真相源文档已经把状态明确拆成 Hot State、Projection、Pending Command、Ack Overlay、UI Local、Settings Bridge。
- 这些切面更接近“多个专用 store”而不是“单树大一统 store”。
- Settings 文档也明确偏向 Query-first，只在治理租约打断场景加 bridge。

### 影响范围

- 直接影响：`T001B`
- 间接影响：`T006-T012`、`T013-T029`、`T033`

---

## 7. 样式系统载体建议

| 方案 | 适用性 | 优点 | 风险 / 缺点 | 推荐度 |
|------|--------|------|-------------|--------|
| 全局 design token + CSS Modules | 高 | 与现有 `UI/styles.css` / design token 迁移路径最顺、边界清晰、无需额外运行时 | 需要先定义全局 token 与组件样式分层规则 | 推荐 |
| Tailwind | 中 | 迭代快 | 会把现有设计源的 token / 手工样式体系重写成另一套表达 | 不优先 |
| CSS-in-TS | 中 | 类型体验好、封装强 | 对当前从静态设计稿迁移的阶段增加额外复杂度 | 可选 |

### 最终决定

**全局 design token + CSS Modules**

### 理由

- 当前已经有明确的颜色、字体、按钮、卡片、SVG 风格规范，最适合先把 token 固化为全局层，再把组件局部样式放到模块样式里。
- 这样既不会把样式全部塞回一个大 CSS 文件，也不会引入新的样式 DSL。
- 与 `T004`、`T005`、`T013-T029` 的迁移路径最一致。

### 影响范围

- 直接影响：`T001B`
- 间接影响：`T004`、`T005`、`T013-T029`、`T034`

---

## 8. 最终拍板组合

- bundler：**Vite**
- Electron dev runner：**Electron Forge + Vite 插件**
- packaging：**Electron Forge makers**
- routing：**React Router + HashRouter**
- state：**TanStack Query + Zustand**
- styling：**全局 design token + CSS Modules**

---

## 9. 决策影响映射

### 一旦 T001A / T001B 锁定，会直接影响的任务卡

- `T001B`：正式骨架任务直接按这组决策落地
- `T002`：contract 落点会受 `packages/app` 目录与基础依赖形态影响
- `T003`：mock / fixture / dev 运行方式依赖 bundler 与 runner 组织
- `T004-T005`：样式载体与资产目录直接依赖 scaffold 结构
- `T006-T007`：client 初始化方式受 renderer 入口与 provider 结构影响
- `T008-T012`：状态库选型直接决定 store / query bridge 的实现落点
- `T013`：Workbench shell 直接依赖 React 入口、HashRouter 与 provider 挂载点
- `T014-T029`：页面组件持续消费路由、状态库、样式系统、资产目录决策
- `T033-T034`：真实集成测试、视觉验收、设计源清理依赖最终 runtime/scaffold 形态

### 影响最强的决策点

- **状态库落点**：直接影响 `T006-T012` 以及后续所有组件任务
- **样式系统载体**：直接影响 `T004-T005` 以及 `T013-T029`
- **路由模式（HashRouter）**：直接影响 `T001B`、`T013`、`T028` 与页面级测试
- **dev runner / packaging**：直接影响 `T001B` 与 `T033-T034`

---

## 10. 一句话结论

`T001A` 已经完成，后续不再讨论“要不要 Electron + React + TypeScript”，
也不再把 runtime/scaffold 细节保持为悬空项。

后续 `T001B` 只负责把以下结果落实为正式工程骨架：

- Vite
- Electron Forge + Vite 插件
- Electron Forge makers
- React Router + HashRouter
- TanStack Query + Zustand
- 全局 design token + CSS Modules

