# Codebase Map（v0.8）

## 1. 目录总览

```text
do-what/
  plans/
    history.md          # 版本历史
    codebase-map.md     # 本文件
    ui-style-bible.md   # UI 设计规范
  packages/
    app/                # 业务 UI（SolidJS + Vite）
      src/app/
        pages/          # 页面组件
        components/     # 通用组件
        lib/            # 核心库（tauri桥接、server客户端、provider模型等）
        context/        # SolidJS Context 提供者
        state/          # 全局状态（runtime-connection 等）
        styles/         # 设计 token
    desktop/            # Tauri 桌面壳 + 系统桥接
      scripts/
      src-tauri/src/
        commands/       # Tauri invoke 命令
        engine/         # 引擎管理
        orchestrator/   # 编排器桥接
        workspace/      # 工作区管理
    orchestrator/       # 本地编排器（进程管理、健康检查）
      src/cli.ts
    server/             # 本地服务层（配置、文件、API）
      src/
  scripts/
    setup/windows/
      doctor.ps1        # 环境检测
      install.ps1       # 依赖安装
      bootstrap.ps1     # 一键引导
```

## 2. 模块职责

- `packages/app`：UI、路由、会话交互、运行时选择、设置页
- `packages/desktop`：Tauri 桥接命令、系统能力、进程生命周期
- `packages/orchestrator`：进程编排、健康检查、沙箱启动
- `packages/server`：工作区配置、文件能力、审批和代理

## 3. 启动链路关键文件

- Root scripts: `package.json`
- Sidecar preparation: `packages/desktop/scripts/prepare-sidecar.mjs`
- Tauri dev bootstrap: `packages/desktop/scripts/tauri-before-dev.mjs`
- Orchestrator entry: `packages/orchestrator/src/cli.ts`
- Server entry: `packages/server/src/cli.ts`
- UI entry: `packages/app/src/app/app.tsx`

## 4. 常用命令

```bash
pnpm dev                    # 业务 UI 开发（默认）
pnpm dev:desktop            # Tauri 桌面开发
pnpm typecheck              # TypeScript 类型检查
pnpm doctor:windows         # Windows 环境检测
pnpm setup:windows          # Windows 依赖安装
```

## 5. 注意事项

- Router 已从主线摘除，不参与启动链路
- 品牌标识以 `dowhat` / `do-what` 为准
- 环境变量前缀：`DOWHAT_*`（优先），兼容 `OPENWORK_*`
- 任何结构改动需同步更新 `plans/history.md` 与受影响 README
