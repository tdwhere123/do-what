# Project Framework（桌面改造导向）

## 1) 当前仓库目标

仅保留“像 Cowork 一样在桌面端完成完整使用流程”所需核心能力，
作为后续个人习惯改造的基线代码库。

## 2) 保留模块

### A. 体验层
- `packages/app`：主 UI 与会话交互。
- `packages/desktop`：Tauri 桌面宿主（系统接口、窗口、权限能力）。

### B. 执行与控制层
- `packages/orchestrator`：本地运行编排入口。
- `packages/server`：控制 API/事件能力。

### C. 依赖连接层
- `packages/opencode-router`：编排器依赖的连接器能力包。

## 3) 已删除配套层

以下目录已移除，以减少无关维护负担：

- `packages/web`
- `packages/landing`
- `services/*`
- `packaging/*`

以及此前已清理的证据与历史资料目录（`evidence/`、`pr/` 等）。

## 4) 个人改造入口建议

1. **先改 UI 密度与流程**：`packages/app/src`
2. **再改桌面行为**：`packages/desktop/src-tauri`
3. **最后改任务编排和控制**：`packages/orchestrator/src` + `packages/server/src`

## 5) 维护原则（精简版）

- 新增内容优先服务桌面主流程。
- 与桌面主流程无直接关系的模块，默认不引入。
- 保持最小可运行集合，避免再次膨胀为多端并行复杂度。
