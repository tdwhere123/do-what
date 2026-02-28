# 02-env-compat-migration

## 目标
1. 新增 `DOWHAT_*` 变量读取
2. 保留 `OPENWORK_*` 兼容
3. 优先级：`DOWHAT_* > OPENWORK_*`
4. 使用 `OPENWORK_*` 时打印一次 deprecated 提示（非阻塞）

## 变更范围
- `packages/server/**`（配置读取层）
- `packages/orchestrator/**`（配置读取层）
- `packages/desktop/**`（配置读取层）
- 对应 README 环境变量章节

## 执行记录
- 新增统一兼容读取函数：
  - `packages/server/src/env-compat.ts`
  - `packages/orchestrator/src/env-compat.ts`
  - `packages/desktop/scripts/env-compat.mjs`
- 将读取层中的 `OPENWORK_*` 访问切换为兼容读取函数。
- 保留写入与透传 `OPENWORK_*` 变量，避免影响现有子进程与历史脚本。
- 文档新增兼容策略说明与迁移建议。

## 验收
- 读取优先级符合：`DOWHAT_* > OPENWORK_*`
- 旧变量仍可工作
- 旧变量仅提示一次 deprecated，不阻塞运行
