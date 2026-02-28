# 01 package/script migration

## 目标
1. 统一 workspace 与 package 命名，移除 `@different-ai` 命名叙事。
2. 统一根脚本为 `dev:business` / `dev:desktop` / `dev:ui`。
3. 保持业务逻辑、API 路径、UI 样式不变。

## 实施结果

### 1) package 命名
- root: `@do-what/workspace`
- app: `@do-what/ui`
- desktop: `@do-what/desktop`
- orchestrator: `@do-what/orchestrator`
- server: `@do-what/server`

### 2) 根脚本调整
- `dev` 从 `dev:lite` 改为 `dev:business`。
- `dev:business` 指向 `pnpm --filter @do-what/ui dev`。
- `dev:desktop` 保留桌面链路，改为 `@do-what/desktop` 过滤名。
- `dev:ui` 保留并指向 `@do-what/ui`。
- `dev:lite` 保留为过渡别名：输出 deprecated 提示后转发到 `dev:business`。

### 3) filter 名称替换
- 根 `package.json` 中所有 `pnpm --filter` 已由旧包名切换为新包名。

## 最小校验
- `pnpm -r list --depth -1`
- `pnpm run dev:business --help`（若命令不支持 `--help`，记录实际行为与失败原因）
