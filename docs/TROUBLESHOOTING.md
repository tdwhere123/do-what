# do-what 排错手册

## 1) `pnpm dev` 失败

检查：

```bash
pnpm install --frozen-lockfile
pnpm --filter @different-ai/openwork-ui dev
```

若第二条可运行，说明问题在根脚本调用链或工作区上下文。

## 2) `pnpm run dev:desktop` 失败

先执行：

```powershell
pnpm run doctor:windows
pnpm run setup:windows
```

常见原因：

- Rust/Cargo 缺失
- C++ Build Tools 缺失
- WebView2 缺失
- Bun 未安装

## 3) sidecar 相关报错

建议手动执行：

```bash
pnpm --filter @different-ai/openwork prepare:sidecar
```

如果报错涉及 router，请确认是否误将 router 当成主链路依赖。v0.6 默认 router 为可选。

## 4) typecheck 失败

```bash
pnpm typecheck
```

该命令仅检查 UI（`@different-ai/openwork-ui`）类型，需先确保依赖已安装。

## 5) 什么时候提交 issue

请附带以下信息：

1. 执行命令
2. 完整报错日志
3. 操作系统与版本
4. `pnpm run doctor:windows` 输出（Windows）
