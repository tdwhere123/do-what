# Project Framework（v0.6）

## 1) 项目目标

以桌面端为主线，提供一个可持续迭代的多运行时 AI 工作台。

v0.6 的核心目标：
- 缺环境可自动安装
- 安装/启动链路可复现
- 文档与代码行为一致
- Router 改为可选能力

## 2) 模块分层

### A. 体验层
- `packages/app`：会话、任务、技能、扩展、设置等 UI。

### B. 桌面桥接层
- `packages/desktop`：Tauri 命令、窗口能力、进程生命周期管理。

### C. 编排层
- `packages/orchestrator`：启动 OpenCode/OpenWork Server，管理本地运行栈与沙箱。

### D. 服务层
- `packages/server`：工作区配置、文件操作、审批、代理能力。

## 3) 运行时策略

- 一等公民运行时：`opencode` / `claude-code` / `codex`
- Router：可选插件能力，默认关闭

## 4) 改造优先级

1. 保证安装和启动稳定
2. 优化会话与工作流体验
3. 扩展可插拔能力（技能、MCP、Router）
4. 清理历史噪音与旧叙事

## 5) 非目标

- 不在 v0.6 做全量品牌重命名
- 不在 v0.6 引入新的云端控制面实现
