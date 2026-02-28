# packages/app

`packages/app` 是 do-what 的业务前端（SolidJS + Vite）。

## 默认开发

```bash
pnpm --filter @different-ai/openwork-ui dev
```

根命令 `pnpm dev` 会调用这里的开发服务。

## 关键脚本

- `dev`：本地开发
- `build`：生产构建
- `typecheck`：TypeScript 检查
- `test:health` / `test:sessions` / `test:e2e`：业务脚本测试

## 核心功能区块映射

- `session`：会话页与消息流
- `proto`：前端协议结构与事件消费
- `scheduled`：调度任务视图
- `soul`：记忆与上下文资产
- `skills`：技能管理页面
- `extensions`：扩展配置与管理

## 注意事项

- 本包是业务主链路入口，不依赖 router 才能运行。
- router 属于 extensions 范畴的可选能力。
