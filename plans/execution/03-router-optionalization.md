# 03 Router Optionalization (v0.6)

## 目标
1. 默认启动不依赖 router。
2. router 保留为显式可选能力。
3. 缺少 router 包/sidecar 不阻塞主链路。

## 变更摘要
- `packages/desktop/scripts/prepare-sidecar.mjs`
  - 默认 `routerEnabled=false`（仅由 `DOWHAT_ROUTER_ENABLED=1` 或 `--with-router` 显式开启）。
  - 显式开启时输出日志提示。
  - 缺少 `packages/opencode-router`、版本异常或构建失败时从硬失败改为 warning，并回退为禁用 router，继续构建其余 sidecar。
- `packages/orchestrator/src/cli.ts`
  - router 默认保持 disabled。
  - 显式启用 router 但无法解析 binary 时：
    - 若 `--opencode-router-required` 为 true：保留失败行为。
    - 否则 warning 后自动降级为 disabled，继续主链路。
- README 同步 router 开关与降级行为。

## 默认主链路组件
默认启动（未显式开启 router）包含：
- opencode
- openwork-server
- openwork-orchestrator

不包含：
- opencode-router

## router 启用方式
- 构建 sidecar：`pnpm --filter @different-ai/openwork run prepare:sidecar -- --with-router`
- 运行时：`DOWHAT_ROUTER_ENABLED=1 openwork start ...`
- 强制 router 必须可用：追加 `--opencode-router-required`

## 验证命令
- `pnpm --filter openwork-orchestrator typecheck`
- `pnpm --filter @different-ai/openwork run prepare:sidecar`
- `DOWHAT_ROUTER_ENABLED=1 pnpm --filter @different-ai/openwork run prepare:sidecar`
