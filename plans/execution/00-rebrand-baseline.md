# Rebrand Baseline (旧标识 -> 新标识)

> 目标：为后续 session 提供“可执行、不误删主链路”的改名基线。当前阶段**不改业务代码**，仅做盘点与边界定义。

## 0. 扫描范围与命令

```bash
rg -n "openwork|@different-ai|OPENWORK_|opencode-router|router" .
for kw in 'openwork' '@different-ai' 'OPENWORK_' 'opencode-router' 'router'; do
  rg -n --no-heading "$kw" . | wc -l
  rg -l "$kw" . | wc -l
 done
```

## 1. 关键词分类统计（基线）

### 1.1 按“命中行数”统计

| 关键词 | 命中行数 |
|---|---:|
| `openwork` | 1548 |
| `@different-ai` | 34 |
| `OPENWORK_` | 235 |
| `opencode-router` | 163 |
| `router` | 330 |

### 1.2 按“命中文件数”统计

| 关键词 | 命中文件数 |
|---|---:|
| `openwork` | 117 |
| `@different-ai` | 9 |
| `OPENWORK_` | 28 |
| `opencode-router` | 22 |
| `router` | 36 |

### 1.3 文件类型分布（用于分批 ownership）

- `openwork`: `.ts(34) .tsx(22) .mjs(18) .rs(18) .json(10) .md(7)`
- `@different-ai`: `.json(4) .md(2) .ps1(1) .ts(1) .mjs(1)`
- `OPENWORK_`: `.ts(12) .rs(6) .mjs(4) .tsx(4)`
- `opencode-router`: `.mjs(7) .md(5) .ts(4) .yaml(2) .rs(2)`
- `router`: `.md(9) .mjs(8) .ts(5) .tsx(4) .rs(4)`

## 2. 标识映射表（旧 -> 新）

> 说明：以下为**建议映射**，用于后续实施批次，不代表本次直接替换。

| 类型 | 旧标识 | 新标识（建议） | 备注 |
|---|---|---|---|
| workspace package | `@different-ai/openwork-workspace` | `@do-what/do-what-workspace` | 根 package 名称 |
| desktop package | `@different-ai/openwork` | `@do-what/desktop` | 桌面壳包 |
| ui package | `@different-ai/openwork-ui` | `@do-what/ui` | 前端 UI 包 |
| orchestrator package | `openwork-orchestrator` | `dowhat-orchestrator` | sidecar/orchestrator |
| server package | `openwork-server` | `dowhat-server` | server sidecar |
| binary name | `openwork` / `openwork.exe` | `dowhat` / `dowhat.exe` | CLI 可执行名 |
| env prefix | `OPENWORK_` | `DOWHAT_` | 需保留兼容期 |
| org/repo slug | `different-ai/openwork` | `do-what/do-what`（或最终仓库 slug） | 发布与链接 |
| optional module name | `opencode-router` | `opencode-router`（暂保留） | v0.6 主链路默认关闭，不建议同步改名 |

## 3. 必须保留功能 / 禁止误删区域

## 3.1 必须保留功能（白名单）

1. session 主链路
2. proto
3. scheduled
4. soul（记忆层）
5. skills
6. extensions（重功能）

## 3.2 禁止误删区域（按仓库结构）

- `packages/app/src/app/pages/session*`（session UI 与交互主链路）
- `packages/server/src/**`（proto / scheduled / soul / skills / extensions 相关实现）
- `packages/app/src/app/features/**` 与 `packages/app/src/app/components/**` 中和 session、skills、extensions 绑定的模块
- `packages/desktop/src-tauri/src/**`（桌面命令桥与 runtime 连接）
- `packages/orchestrator/src/**`（runtime 编排入口）

> 任何“瘦身”操作仅允许下线默认入口，不允许删除上述能力实现与调用契约。

## 4. 风险点列表（后续改名必须单独验证）

1. API path 风险
   - `openwork server API` 字样和可能硬编码 path 前缀需要逐项核对，避免 UI->server 路由失配。
2. env var 风险
   - `OPENWORK_*` 在 server/orchestrator/desktop 多点使用；改名前必须提供双前缀兼容读取窗口。
3. package name 风险
   - `@different-ai/openwork*` 与 `openwork-*` 参与 `pnpm --filter`、workspace linking、发布脚本。
4. script filter 风险
   - 根 `package.json` 大量使用 `pnpm --filter @different-ai/openwork-ui`、`@different-ai/openwork`、`openwork-orchestrator`，改名后若遗漏会直接导致 CI/本地命令失效。
5. optional router 风险
   - `opencode-router` 属于可选遗留模块：v0.6 主链路已默认关闭，后续不要让 router 改名/清理阻塞安装与启动链路。

## 5. 文件所有权建议（给后续 session）

- Batch A（低风险，先做）：
  - `plans/**`、`README.md`、`ARCHITECTURE.md`、`INFRASTRUCTURE.md`
- Batch B（中风险，配置层）：
  - `package.json`、`pnpm-workspace.yaml`、`packages/*/package.json`、发布脚本（`scripts/**`）
- Batch C（高风险，运行时接口）：
  - `packages/server/src/**`、`packages/orchestrator/src/**`、`packages/desktop/src-tauri/src/**`
- Batch D（UI 与回归验证）：
  - `packages/app/src/**` + 全量会话链路回归

建议 ownership：
- Runtime owner：server + orchestrator + desktop tauri
- Frontend owner：app/session + skills/extensions 入口
- Release owner：workspace/package scripts + 发布链接/命名
- QA owner：命令回归 + session/proto/soul/scheduled/skills/extensions 冒烟

## 6. 执行守则（给后续改名 session）

1. 先文档与映射，后配置，最后代码。
2. 每批仅改一层（文档/配置/运行时/UI），避免跨层同时改名。
3. 每批必须跑 CLI 命令回归并记录失败原因。
4. Router 保持“可选且不阻塞主链路”原则，不把它作为验收前置。
