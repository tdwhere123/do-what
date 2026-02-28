# Infrastructure

## 1. 基础原则

1. CLI first：所有关键能力都要可命令行运行
2. Local first：默认本地运行，不依赖云端才能用
3. Optional modules：可选能力不能阻塞核心链路
4. Explicit config：用环境变量和配置文件明确行为

## 2. 依赖策略

### 2.1 必需依赖（Windows）

- Node.js
- pnpm
- Bun
- Rust/Cargo
- Visual Studio C++ Build Tools
- WebView2 Runtime

### 2.2 可选依赖

- opencode-router（二进制或本地包）

默认策略：
- `DOWHAT_ROUTER_ENABLED=0`（关闭）
- 只有显式启用才构建和运行 Router

## 3. Sidecar 约束

- sidecar 由 `packages/desktop/scripts/prepare-sidecar.mjs` 准备
- `openwork-server`、`openwork-orchestrator`、`opencode` 为主链路
- `opencode-router` 为可选 sidecar

## 4. 环境自动化

Windows 自动化脚本：
- `scripts/setup/windows/doctor.ps1`
- `scripts/setup/windows/install.ps1`
- `scripts/setup/windows/bootstrap.ps1`

能力边界：
- doctor 负责检测
- install 负责补齐依赖
- bootstrap 负责完整初始化（含依赖安装与 sidecar 准备）

## 5. 观测与排障

- 启动失败优先看：环境、sidecar、runtime 可用性
- 统一参考 `docs/TROUBLESHOOTING.md`
