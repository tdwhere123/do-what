# do-what 版本历史

## 版本路线

| 版本 | 主题 | 状态 |
|------|------|------|
| v0.1–v0.5 | 基线清理、多运行时雏形、UI 重构 | ✅ 已完成 |
| v0.6 | 环境自安装 + 文档重建 + Router 移除 | ✅ 已完成 |
| v0.7 | 双轨重构（视觉 + 核心解耦） | ✅ 已完成 |
| v0.8 | 后端解耦 + UI 视觉交互 + 汉化 | ✅ 已完成 |

---

## v0.6 完成摘要

**目标**：缺失环境自动安装、启动链路稳定化、Router 从主线移除、文档重建。

### 核心成果
- Windows 环境自动化脚本：`doctor.ps1` / `install.ps1` / `bootstrap.ps1`
- Bun 安装增强（winget 多策略 + 官方脚本回退）
- Rust 工具链检测修复 + 自动配置
- Router 从硬依赖 → 可选降级 → 代码路径摘除 → 物理删除
- 瘦身开发模式：`pnpm dev` 默认仅启动 UI
- Windows linker 冲突修复（MSVC `link.exe` 注入）
- 核心文档重写（README、ARCHITECTURE、docs/ 目录）
- env 前缀迁移：`DOWHAT_*` 优先，兼容 `OPENWORK_*`

### 删除清单
- `packages/orchestrator/scripts/build-opencode-router.mjs`
- `packages/orchestrator/scripts/router.mjs`

---

## v0.7 完成摘要

**目标**：双轨并行重构 — Track 1 视觉交互（Antigravity）+ Track 2 核心解耦（Codex）。

### Track 1 视觉（Antigravity）
- CSS Variables / Tailwind 颜色规范提取
- 页面骨架重构（Sidebar + Toolbar + Main Area）
- 图标替换（svg-preview → 新版 SVG）

### Track 2 核心（Codex）
- 桌面端生命周期修复（退出时清理子进程、真实退出码）
- 多助手并行状态模型（`check_assistant_statuses` 等 Tauri 命令）
- Settings Runtime 页统一展示三助手状态
- `DOWHAT_*` 前缀在 desktop/orchestrator 启动路径优先生效
- 数据目录迁移至 `.do-what/do-what-orchestrator`

---

## v0.8 完成摘要

**目标**：后端品牌解耦 + UI 视觉交互完善 + 全面汉化。

### Codex Track（后端）
- ENOENT 修复：orchestrator `opencode-config` NUL 过滤 + 目录创建
- Web 兼容：`isTauri` guard + Tauri invoke fallback
- 品牌解耦：TS 类型名/变量名 `Openwork*` → `DoWhat*`
- Tauri invoke 命令名统一为 `dowhat_*`（同步 Rust）
- Runtime 连接状态：`runtime-connection.ts` + `sendPrompt` 守卫
- 自有 API 模型列表：`provider-models.ts`
- localStorage 迁移：`openwork.* → dowhat.*`

### Antigravity Track（前端）
- 默认浅色主题，暗色改为暖棕方案
- 底栏主题切换按钮（☀️/🌙）+ 汉化
- do-what-logo + 星星闪烁动画
- `theme.ts` key 迁移至 `dowhat.themePref`
- 系统通知文本全部汉化
- `status-bar.tsx` import 路径更新
- 删除遗留 `openwork-logo.tsx`

### 已知保留项（后续版本处理）
- `openwork-server.ts` 内部类型名（通过 `dowhat-server.ts` re-export）
- `skills.tsx`、`publisher.ts` 中的 openwork 业务引用
- i18n key 名称中的 openwork 前缀

---

## 维护规则

每次功能改动后必须同步：
1. `plans/history.md`
2. 受影响模块 README
3. `AGENTS.md`（如涉及维护规则变更）


## v0.10 (2026-03-01)
- Fixed Windows runtime launch path to avoid program-not-found for Codex/Claude (.cmd aware resolution).
- Fixed UI issues: composer placeholder -> do-what, broken dashboard Tailwind class repaired, Skills branding cleanup.
- Cleared default hub source (no built-in openwork-hub). Hub now relies on optional DOWHAT_HUB_* config or external install flows.
- Hard-cut compatibility: removed OPENWORK_* mapping branches, unified env/header/flag prefixes to DOWHAT_* / X-DoWhat-* / --dowhat-*.
- Follow-up hotfix:
  - removed session branch/DAG UI and project-parent-session linking logic from app state;
  - OpenAI OAuth flow fallback improved and modal flow stabilized;
  - workspace bootstrap no longer injects enterprise skills/default plugins/default chrome MCP;
  - runtime availability probing now supports Windows `.cmd/.bat` in status checks too;
  - do-what logo switched to circle style (desktop icon + UI logo).
- Detailed record: plans/v0.10-record.md.
