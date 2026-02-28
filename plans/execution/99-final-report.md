# 99 Final Migration Report（v0.6 收口）

## 1. 改动总览

本次仅执行“仓库整洁化收口 + 维护规则对齐 + 计划回填”，未改动核心业务代码路径。

### 1.1 变更文件

1. `AGENTS.md`
   - 增补统一维护规则：plans/history/README 联动更新。
   - 明确删除治理：删除清单与理由必填；不确定删除转 TODO。
2. `plans/v0.6.md`
   - 新增“仓库整洁化收口”实施记录与风险残留。
3. `plans/v0.6-slimming-spec.md`
   - 增补收口约束（删除治理 + TODO 保留策略）。
4. `plans/history.md`
   - 回填本次“整洁化收口”版本历史。

### 1.2 删除清单与理由

- 删除清单：无。
- 理由：本次目标为规则收口与验证，不做高风险物理删除；对不确定可删项按规范保留并 TODO。

### 1.3 README 同步说明

- README: N/A（本次无模块行为变化，仅治理文档收口）。

## 2. 可执行校验结果

> 说明：遵循“能跑就跑”，按 workspace 实际脚本可用性执行。

1. `pnpm -r typecheck`
2. `pnpm -r lint`（若某 package 未定义 lint，会按 pnpm 输出记录）
3. `pnpm -r test`（若某 package 未定义 test，会按 pnpm 输出记录）

## 3. 风险残留

1. `core/optional` 深度拆分仍未完成（app/server/orchestrator 仍有耦合点）。
2. Router 显式启用链路虽可降级，但缺少完整 e2e 自动化回归。
3. 多平台安装链路（macOS/Linux）仍缺文档与验证闭环。

## 4. 下阶段建议（仅代码层）

1. 先做 `app` 路由与导航层开关化（core 默认、optional 显式开启）。
2. 拆分 orchestrator 启动参数解析与 router 分支，形成独立模块与测试桩。
3. server 侧将 toy-ui/扩展注册改为可插拔模块，核心 API 入口保持最小集。
4. 为 router “显式启用 + binary 缺失 + required 开关”补齐单测/集成测试矩阵。
