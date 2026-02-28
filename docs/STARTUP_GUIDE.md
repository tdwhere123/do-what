# do-what 启动指南

## 1. 默认开发命令

```bash
pnpm dev
```

这是默认业务启动链路（`dev -> dev:lite`），只启动 UI。

## 2. 桌面启动命令

```bash
pnpm run dev:desktop
```

此命令启动 Tauri 桌面链路，需要预先满足桌面依赖。

## 3. 推荐启动顺序

1. `pnpm install --frozen-lockfile`
2. `pnpm dev`（确认业务链路）
3. `pnpm run dev:desktop`（确认桌面链路）

## 4. 业务链路 vs 桌面链路

- 业务链路：快、依赖少、用于日常功能开发。
- 桌面链路：完整、覆盖系统集成、用于桌面验收。

## 5. router 定位

- `opencode-router` 是 extensions 中的可选能力。
- 默认启动不要求 router 可用。
