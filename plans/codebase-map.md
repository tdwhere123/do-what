# Codebase Map（v0.6）

## 1. 目录总览

```text
do-what/
  docs/
    INSTALL_WINDOWS.md
    STARTUP_GUIDE.md
    TROUBLESHOOTING.md
    CORE_LOGIC_AND_MODULES.md
    RUNTIME_MATRIX.md
  plans/
    v0.6.md
    history.md
    codebase-map.md
    ui-style-bible.md
  packages/
    app/
      src/app/
        pages/
        components/
        lib/
        context/
        state/
    desktop/
      scripts/
      src-tauri/src/
        commands/
        engine/
        orchestrator/
        workspace/
    orchestrator/
      src/cli.ts
    server/
      src/
  scripts/
    setup/windows/
      doctor.ps1
      install.ps1
      bootstrap.ps1
```

## 2. 模块职责

- `packages/app`
  - UI、路由、会话交互、运行时选择、设置页
- `packages/desktop`
  - Tauri 桥接命令、系统能力、sidecar 生命周期
- `packages/orchestrator`
  - 进程编排、健康检查、沙箱启动
- `packages/server`
  - 工作区配置、文件能力、审批和代理

## 3. 启动链路关键文件

- Root scripts: `package.json`
- Sidecar preparation: `packages/desktop/scripts/prepare-sidecar.mjs`
- Tauri dev bootstrap: `packages/desktop/scripts/tauri-before-dev.mjs`
- Orchestrator entry: `packages/orchestrator/src/cli.ts`
- Server entry: `packages/server/src/cli.ts`
- UI entry: `packages/app/src/app/app.tsx`

## 4. v0.6 新增维护入口

- 环境检测：`scripts/setup/windows/doctor.ps1`
- 环境安装：`scripts/setup/windows/install.ps1`
- 一键引导：`scripts/setup/windows/bootstrap.ps1`

## 5. 注意事项

- Router 默认为可选关闭，不是主链路前置
- 任何结构改动需同步更新 `plans/history.md` 与 `plans/v0.6.md`
