# do-what 版本历史

## 版本路线

| 版本 | 主题 | 状态 |
|---|---|---|
| v0.1-v0.5 | 基线清理、多运行时雏形、UI 重构 | 已完成（历史） |
| v0.6 | 环境自安装 + 文档重建 + Router 可选化 | 进行中 |

## v0.6 目标

1. 缺失环境自动安装（Windows / winget）
2. 安装与启动链路稳定化
3. Router 从硬依赖改为可选能力
4. 删除历史 PR 文档噪音
5. 强制维护 `AGENTS.md` 与 `plans/`

## v0.6 已落地

- 新增 `scripts/setup/windows/doctor.ps1`
- 新增 `scripts/setup/windows/install.ps1`
- 新增 `scripts/setup/windows/bootstrap.ps1`
- 根 `package.json` 新增：
  - `doctor:windows`
  - `setup:windows`
  - `bootstrap:windows`
- `install.ps1` 增强 Bun 安装逻辑：
  - `winget` 多策略重试
  - `winget` 失败后自动回退 Bun 官方安装脚本（覆盖 `exit=-1978335189` 场景）
- `doctor.ps1` 修复 Rust 检查误判：新增 `rust-toolchain` 检测
- `install.ps1` 增加 Rust 默认工具链自动配置：`rustup default stable`
- `prepare-sidecar.mjs` 支持 Router 默认关闭，不再强依赖本地 `packages/opencode-router`
- `packages/orchestrator/src/cli.ts`：Router 默认值改为关闭，可由环境变量启用
- `packages/desktop/src-tauri/src/commands/orchestrator.rs`：沙箱启动遵循 Router 开关
- 新增瘦身开发模式：
  - `pnpm dev` 默认仅 UI（`dev:lite`）
  - `pnpm run dev:desktop` 才走 Tauri 桌面链路
- 修复 Windows linker 冲突：
  - `packages/desktop/scripts/dev.mjs` 自动注入 MSVC `link.exe` 路径，规避 Git `link.exe`
- 重写核心文档与包 README
- 新增真瘦身专项规格：
  - `plans/v0.6-slimming-spec.md`
  - 明确业务优先启动、core/optional 分层、桌面壳后置策略
- 打通 runtime 实际执行链路：
  - `composer` 选择 `claude-code/codex` 后，`sendPrompt` 走 Tauri `agent_run_start`
  - Session 页新增 `Local Runtime Output` 展示
- 下线 router 默认活跃链路：
  - StatusBar 移除 router 轮询
  - 桌面 sandbox 启动固定 `--no-opencode-router`
  - `prepare-sidecar` 忽略 router 构建请求
- 新增仓库瘦身脚本：
  - `pnpm run clean:artifacts`
  - 完整 `.gitignore`（忽略 `target/sidecars` 等构建产物）
- 新增 package README：
  - `packages/app/README.md`
  - `packages/desktop/README.md`
- 命名与脚本统一（package/script migration）：
  - workspace/package 名称改为 `@do-what/*` 体系
  - 根脚本统一为 `dev:business` / `dev:desktop` / `dev:ui`
  - `dev:lite` 保留为 deprecated 过渡别名

## v0.6 待完成

1. 落地 `dev:business` 作为默认业务链路
2. 完成 app/server/orchestrator 的 core/optional 切分
3. 补齐仓库构建产物清理与 `.gitignore` 完善
4. 补充更多平台安装文档（macOS / Linux）

## v0.6 本次增量（2026-02-28）

- 新增 rebrand 基线执行文档：`plans/execution/00-rebrand-baseline.md`
  - 产出旧标识 -> 新标识映射草案
  - 产出必须保留功能与禁止误删区域清单
  - 产出 API path/env/package/filter 风险点与后续 ownership 建议
