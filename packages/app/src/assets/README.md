# Runtime SVG Assets

`packages/app/src/assets/` 是 `@do-what/app` 的正式运行时 SVG 资产目录。  
`UI/svg/` 只保留为设计源素材库，运行时代码不得直接引用它。

## 边界规则

- 设计源：`UI/svg/**`
- 运行时落点：`packages/app/src/assets/**`
- 页面、组件和图标封装层只从 `packages/app/src/assets/**` 导入 SVG
- 第三方图标库仍然禁止

## 资产来源映射

下表基于当前仓库文件的 hash 对比整理，表示运行时资产与 `UI/svg` 设计源的一一对应关系。

### 当前正在被页面或组件使用的资产

| 运行时文件 | 设计源 | 当前使用位置 |
| --- | --- | --- |
| `decorative/dot-grain.svg` | `UI/svg/organic/texture/Elements-organic-texture-dot-grain.svg` | 目前仅通过 `assets/index.ts` 导出，尚未接入页面 |
| `decorative/wave-line.svg` | `UI/svg/organic/line/Elements-organic-line-wave.svg` | 目前仅通过 `assets/index.ts` 导出，尚未接入页面 |
| `empty/settings-empty.svg` | `UI/svg/organic/shape/sun/Elements-organic-shape-sun.svg` | 目前仅通过 `assets/index.ts` 导出，尚未接入页面 |
| `empty/workbench-empty.svg` | `UI/svg/organic/shape/flower/Elements-organic-shape-flower-nature-splash.svg` | 目前仅通过 `assets/index.ts` 导出，尚未接入页面 |
| `icons/raw/engine-smile.svg` | `UI/svg/organic/shape/smile/Elements-organic-shape-smile-eye.svg` | `components/timeline/timeline-pane.tsx` |
| `icons/raw/settings-sun.svg` | `UI/svg/organic/shape/sun/Elements-organic-shape-sun.svg` | `components/sidebar/workspace-sidebar.tsx` |
| `icons/raw/soul-spiral.svg` | `UI/svg/organic/shape/spiral/Elements-organic-shape-spiral.svg` | `components/sidebar/workspace-sidebar.tsx` |
| `icons/raw/status-running.svg` | `UI/svg/organic/shape/circle/Elements-organic-shape-circle--loading-spin.svg` | `components/sidebar/workspace-sidebar.tsx` |
| `icons/raw/status-success.svg` | `UI/svg/organic/shape/star/Elements-organic-shape-star-wink.svg` | `components/sidebar/workspace-sidebar.tsx` |
| `icons/raw/status-waiting.svg` | `UI/svg/organic/shape/hand/Elements-organic-shape-hand.svg` | `components/sidebar/workspace-sidebar.tsx` |
| `icons/raw/user-face.svg` | `UI/svg/organic/shape/face/Elements-organic-shape-face.svg` | `components/timeline/timeline-pane.tsx` |
| `icons/raw/workbench-flower.svg` | `UI/svg/organic/shape/flower/Elements-organic-shape-flower-nature-splash.svg` | `components/create-run/create-run-modal.tsx`, `components/empty/workbench-empty-state.tsx`, `components/sidebar/workspace-sidebar.tsx`, `app/core-offline-screen.tsx` |

### 已打包但暂未被页面直接使用的资产

| 运行时文件 | 设计源 | 当前状态 |
| --- | --- | --- |
| `icons/raw/soul-canon.svg` | `UI/svg/organic/shape/flower/Elements-organic-shape-flower-nature-cute.svg` | 已由 `components/icons/app-icons.tsx` 导出，但暂无页面调用 |
| `icons/raw/soul-consolidated.svg` | `UI/svg/organic/shape/leaves/Elements-organic-shape-leaves-nature-2.svg` | 已由 `components/icons/app-icons.tsx` 导出，但暂无页面调用 |
| `icons/raw/soul-working.svg` | `UI/svg/organic/shape/leaves/Elements-organic-shape-leaves-nature-twig.svg` | 已由 `components/icons/app-icons.tsx` 导出，但暂无页面调用 |

## 维护要求

- 新增运行时 SVG 时，先确定 `UI/svg` 中的设计源，再迁入 `packages/app/src/assets/**`。
- 如果资产不再有运行时用途，应先移除调用，再清理 `packages/app/src/assets/**` 中的最小集合。
- 如果设计源变化，应同步更新本文件中的来源映射。
