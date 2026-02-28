# Architecture

## 1. 总体架构

`do-what` 是四层结构：
1. UI (`packages/app`)
2. Desktop Bridge (`packages/desktop`)
3. Orchestrator (`packages/orchestrator`)
4. Server (`packages/server`)

运行时采用并列模型：
- OpenCode
- Claude Code
- Codex

## 2. 核心逻辑（端到端）

### 2.1 启动链路

1. Desktop 启动 Tauri
2. Tauri 根据设置拉起 orchestrator / engine
3. orchestrator 启动 OpenCode 与 openwork-server（以及可选 router）
4. UI 通过 SDK 与 server API 建立连接，订阅事件流

### 2.2 会话执行链路

1. 用户在 Composer 发起任务
2. UI 根据所选 runtime 路由执行
3. Desktop 命令层发起进程调用或 API 请求
4. 执行事件回流 UI（消息、工具调用、错误、完成态）

### 2.3 配置与文件链路

1. UI 请求工作区配置变更
2. server 执行文件读写与审批
3. 必要时触发 engine reload
4. UI 刷新状态与能力面板

## 3. 功能区块说明

### 3.1 Sessions

- 主会话页面：消息流、工具卡片、上下文面板、附件面板
- 支持多 runtime 的发送与回放

### 3.2 Scheduled

- 调度任务列表、刷新、删除
- 依赖 scheduler 能力与工作区配置

### 3.3 Soul

- 项目/系统记忆管理与心跳数据展示
- 面向长期上下文维护

### 3.4 Skills

- 本地技能读取、编辑、安装、卸载
- 支持模板与导入流程

### 3.5 Extensions

- 插件与 MCP 配置管理
- Router 属于扩展能力，不是基础启动依赖

### 3.6 Settings

- 引擎源、运行时、主题、开发者模式、修复工具
- 环境诊断与重连入口

## 4. Router 定位

- Router 仅用于消息通道桥接（Telegram/Slack/WhatsApp 等）
- 默认关闭
- 显式启用后才参与 sidecar 构建和运行

## 5. 设计原则

1. 默认可运行：缺少可选能力不应阻塞主链路
2. 显式优先：关键开关由环境变量或配置决定
3. 文档与行为一致：命令、前置条件、排错路径可复现
