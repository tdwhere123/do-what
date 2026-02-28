# 执行记录：04-docs-rebuild

## 目标

1. 全部文档改为 do-what 叙事。
2. 明确业务启动链路与桌面链路。
3. 提供可复现安装/启动/排错步骤。

## 本次输出文件

- README.md
- ARCHITECTURE.md
- PROJECT_FRAMEWORK.md
- INFRASTRUCTURE.md
- packages/app/README.md
- packages/desktop/README.md
- packages/orchestrator/README.md
- packages/server/README.md
- docs/INSTALL_WINDOWS.md
- docs/STARTUP_GUIDE.md
- docs/TROUBLESHOOTING.md
- docs/CORE_LOGIC_AND_MODULES.md
- docs/RUNTIME_MATRIX.md

## 一致性约束

- 未修改 `.ts/.tsx/.rs/.mjs/.ps1` 代码。
- 未进行 UI 改造。
- 文档命令与现有脚本保持一致（以 `package.json` 为准）。

## 验证命令

- `pnpm run`
- `pnpm --filter @different-ai/openwork-ui run`
- `pnpm --filter @different-ai/openwork run`
- `pnpm --filter openwork-orchestrator run`
- `pnpm --filter openwork-server run`
