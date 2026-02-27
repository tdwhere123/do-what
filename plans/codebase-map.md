# do-what v0.5 代码库导航地图

> 本文件是快速定位代码的索引，改动前先查这里找到目标文件和行号。
> 更新时机：每次大改动后同步更新行号和说明。

---

## 目录

1. [包结构总览](#包结构总览)
2. [前端 UI 组件地图](#前端-ui-组件地图)
3. [session.tsx 分区索引](#sessiontsx-分区索引)
4. [sidebar.tsx 分区索引](#sidebartsx-分区索引)
5. [颜色 Token 速查](#颜色-token-速查)
6. [SVG 素材目录](#svg-素材目录)
7. [状态与数据流](#状态与数据流)
8. [Tauri IPC 命令](#tauri-ipc-命令)
9. [常见改动路径](#常见改动路径)

---

## 包结构总览

```
v0.5/
├── packages/
│   ├── app/                        ← 前端 UI（SolidJS + TailwindCSS 4 + Vite）
│   │   ├── src/app/
│   │   │   ├── app.tsx             ← 根组件（全局状态、引擎初始化、路由）
│   │   │   ├── pages/
│   │   │   │   └── session.tsx     ← 主会话页（3000+ 行，核心页面）
│   │   │   ├── components/
│   │   │   │   ├── session/
│   │   │   │   │   ├── sidebar.tsx         ← 左侧工作区+会话列表（~720行）
│   │   │   │   │   ├── message-list.tsx    ← 消息渲染（步骤/气泡/附件）
│   │   │   │   │   ├── composer.tsx        ← 底部输入框
│   │   │   │   │   └── message-input.tsx   ← 消息输入组件
│   │   │   │   ├── status-bar.tsx          ← 底部状态栏（Engine/Server状态）
│   │   │   │   ├── button.tsx              ← 通用按钮（5种variant）
│   │   │   │   └── openwork-logo.tsx       ← 应用 Logo 组件
│   │   │   ├── styles/
│   │   │   │   └── tokens.css      ← DLS 颜色/阴影 token（只读参考）
│   │   │   ├── index.css           ← 全局样式和动画
│   │   │   ├── lib/
│   │   │   │   ├── openwork-server.ts  ← 后端 API 客户端（工作区/技能/MCP）
│   │   │   │   └── tauri.ts            ← Tauri IPC 封装
│   │   │   ├── context/
│   │   │   │   └── openwork-server.ts  ← 后端服务器 Context
│   │   │   └── types.ts            ← 全局类型定义
│   │   └── public/
│   │       └── svg/                ← 已复制的 SVG 素材（Vite serve 为 /svg/...）
│   ├── desktop/
│   │   └── src-tauri/
│   │       ├── tauri.conf.json     ← 应用名/标识符/图标/sidecar 配置
│   │       └── src/
│   │           └── lib.rs          ← Rust IPC 命令实现
│   ├── server/                     ← 后端配置 API（Bun）
│   │   └── src/                    ← 工作区/技能/MCP/命令 REST API
│   └── orchestrator/               ← CLI 宿主（Bun）
│       └── src/                    ← 衔接 OpenCode + Server
└── plans/
    ├── codebase-map.md             ← 本文件
    ├── ui-style-bible.md           ← UI 设计规范（改 UI 前必读）
    ├── overview.md                 ← 版本路线总规划
    └── v0.X-spec.md / recond.md    ← 各版本规格和执行记录
```

---

## 前端 UI 组件地图

### 核心文件速查

| 文件（相对 packages/app/src/app/） | 行数 | 主要职责 |
|---|---|---|
| `app.tsx` | ~5000 | 根组件：全局信号、引擎初始化、工作区管理、路由 |
| `pages/session.tsx` | ~3100 | 主会话页：消息流、右侧工具栏、空状态、DAG浮层 |
| `components/session/sidebar.tsx` | ~720 | 左侧栏：工作区卡片、会话列表、右键菜单 |
| `components/session/message-list.tsx` | ~750 | 消息渲染：步骤折叠、气泡、附件、推理卡片 |
| `components/session/composer.tsx` | ~400 | 底部输入框：文件上传、引擎选择、发送 |
| `components/status-bar.tsx` | ~244 | 底部状态栏：Engine/Server 状态、ProTips、设置按钮 |
| `components/button.tsx` | ~33 | 通用按钮：primary/secondary/ghost/outline/danger |
| `components/openwork-logo.tsx` | ~20 | 应用 Logo（当前显示 do-what + 螺旋SVG） |
| `styles/tokens.css` | ~80 | DLS token 定义（颜色、阴影、间距） |
| `index.css` | ~160 | 全局动画（command-highlight、progress-shimmer等） |

### button.tsx variant 速查

```
primary   → bg-dls-accent（暖色主按钮）
secondary → bg-[var(--color-border-subtle)]（暖白次要按钮）
ghost     → 透明背景，hover 显示
outline   → 边框按钮
danger    → bg-red-3（危险操作）
```

---

## session.tsx 分区索引

> 文件约 3100 行，按功能分区：

| 行号范围 | 区域 | 内容 |
|---|---|---|
| 1–80 | Imports | Lucide 图标、SolidJS、SDK、组件 |
| 81–200 | Types & Props | SessionViewProps、消息类型定义 |
| 200–600 | 信号与状态 | createSignal/createMemo：消息、滚动、搜索、展开状态 |
| 600–1200 | 引擎逻辑 | 发送消息、流式接收、引擎切换（OpenCode/CC/Codex） |
| 1200–2000 | 工作区操作 | 激活工作区、创建session、DAG操作 |
| 2000–2400 | 面板控制 | openSoul/openSkills/openConfig 等导航函数 |
| 2400–2970 | 消息区渲染 | MessageList 容器、滚动控制、搜索高亮 |
| **~2970–3070** | **空状态** | **无消息时的欢迎界面（花朵SVG + 快速入口卡片）** |
| **~3072–3085** | **Jump浮层** | **"Jump to latest" 悬浮按钮** |
| 3085–3220 | Markdown编辑器 | ArtifactMarkdownEditor 面板（宽520px） |
| **~3214–3296** | **右侧工具栏** | **aside w-16，顶部星星动画，分隔线分三组（自动化/记忆+技能+扩展/设置）** |
| 3310–3400 | DAG浮层 | Session DAG 右上角折叠浮层 |
| 3400–3500 | 搜索面板 | 全文搜索 UI |
| 3500+ | 布局组装 | 三栏布局（左侧栏 + 主区 + 右侧栏） |

### 右侧工具栏按钮（~3223–3310）

```tsx
// 每个按钮结构：
<button class={`w-full h-10 flex items-center gap-3 px-3 rounded-lg ...`}
        onClick={() => { props.setTab("scheduled"); props.setView("dashboard"); }}>
  <img src="/svg/organic/shape/spiral/..." class="w-[18px] h-[18px] opacity-75" />
  Automations
</button>
```

| 按钮 | tab值 | SVG图标 | 特殊处理 |
|------|-------|---------|---------|
| Automations | `"scheduled"` | spiral | — |
| Soul | `"soul"` | heart | `soulNavIconClass()` 动态class需保留 |
| Skills | `"skills"` | flash | — |
| Extensions | `"extensions"` | tree | — |
| Messaging | `"settings"` + settingsTab=`"workspace"` | wave/MessageCircle | — |

---

## sidebar.tsx 分区索引

> 文件约 720 行：

| 行号范围 | 内容 |
|---|---|
| 1–50 | Imports + Types |
| 50–150 | 信号定义（contextMenu、editingWorkspace等） |
| 150–280 | 工作区操作函数（activate、edit、remove） |
| **~284** | **"New task" 按钮** |
| **~296** | **"Workspaces" 标题** |
| **~302** | **空工作区 fallback（花朵SVG）** |
| **~352–357** | **Active workspace 卡片（border-strong + bg-elevated）** |
| **~385–395** | **类型徽章 + 路径标签** |
| **~407** | **"Active"/"Switch" 状态标签** |
| **~417–485** | **Edit/Test/Stop/Remove 操作按钮组** |
| **~490** | **空sessions fallback（叶子SVG）** |
| **~500** | **Project 分组标题** |
| **~511–512** | **Session 选中/默认态** |
| **~535** | **"Quick Chats" 分隔线** |
| **~581** | **"Add new workspace" 按钮** |
| **~591–626** | **下拉菜单（workspace类型选择）** |
| **~634** | **Progress 卡片** |
| **~684–711** | **右键菜单（context menu）** |
| ~712+ | 侧边栏底部螺旋SVG装饰 |

---

## 颜色 Token 速查

> 文件：`packages/app/src/app/styles/tokens.css`
> 规则：**所有颜色必须用 `var(--color-*)` token，禁止用 `gray-*` / `indigo-*`**

### 背景色

| Token | 值 | 用途 |
|---|---|---|
| `--color-bg-base` | `#f5eedf` | 主背景（牛皮纸暖黄褐） |
| `--color-bg-sidebar` | `#ede2cc` | 侧边栏背景 |
| `--color-bg-elevated` | `#ffffff` | 卡片/浮层（白色，提供对比） |
| `--color-bg-overlay` | `rgba(0,0,0,0.04)` | hover 背景 |

### 文字色

| Token | 用途 |
|---|---|
| `--color-text-primary` | 主要文字 |
| `--color-text-secondary` | 次要文字 |
| `--color-text-tertiary` | 辅助/标签文字 |
| `--color-text-disabled` | 禁用/极淡文字 |
| `--color-text-inverse` | 深色背景上的白字 |

### 边框色

| Token | 用途 |
|---|---|
| `--color-border-subtle` | 极淡边框（卡片分隔） |
| `--color-border-default` | 默认边框 |
| `--color-border-strong` | 强调边框（active状态） |

### 状态色

| Token | 用途 |
|---|---|
| `--color-accent-primary` | 主强调色（active边框、选中态） |
| `--color-status-success` | 成功/在线（绿色） |
| `--color-status-warning` | 警告（琥珀色） |

### 阴影

| Token | 用途 |
|---|---|
| `--shadow-sm` | 小阴影（浮层、按钮） |
| `--shadow-md` | 中阴影（下拉菜单、右键菜单） |

---

## SVG 素材目录

### 已复制到 public/svg/（可直接用 `/svg/...` 路径引用）

```
public/svg/organic/shape/
├── flower/
│   └── Elements-organic-shape-flower-nature-splash.svg   ← 空状态主图
├── leaves/
│   └── Elements-organic-shape-leaves-nature-fan.svg      ← 空sessions装饰
├── spiral/
│   └── Elements-organic-shape-spiral.svg                 ← Logo + Automations图标
├── heart/
│   └── Elements-organic-shape-heart.svg                  ← Soul图标（待复制）
├── flash/
│   └── Elements-organic-shape-flash.svg                  ← Skills图标（待复制）
└── tree/
    ├── Elements-organic-shape-tree-body-nuture.svg        ← Extensions图标（待复制）
    └── Elements-organic-shape-tree-pine-nuture.svg
```

### SVG 源文件（UI/svg/，未复制的）

```
UI/svg/
├── geometric/
│   ├── line/       (3个)
│   ├── pattern/    (12个 — 棋盘、点阵、波浪等)
│   ├── shape/      (18种形状)
│   └── texture/    (4个 — 网格、像素、半调、点阵)
└── organic/
    ├── line/       (3个)
    ├── pattern/collection/  (15个)
    ├── shape/      (27种形状 — abstract/bird/bubble/bush/circle/crown/face/
    │               flash/flower/hand/hashtag/heart/leave/leaves/line/moon/
    │               rock/smile/spiral/square/star/sun/trapezoid/tree/
    │               triangle/vase/wave)
    └── texture/    (5个 — 点粒、涂鸦、划痕等)
```

### SVG 使用规范

```tsx
// 装饰性 SVG（不传达信息）
<img src="/svg/organic/shape/spiral/Elements-organic-shape-spiral.svg"
     class="w-6 h-6 opacity-75" alt="" aria-hidden="true" />

// 带动态 class 的图标（如 Soul 按钮）
<img src="/svg/organic/shape/heart/Elements-organic-shape-heart.svg"
     class={`w-[18px] h-[18px] ${soulNavIconClass()}`}
     alt="" aria-hidden="true" />
```

---

## 状态与数据流

### 引擎状态（app.tsx）

```
client (OpenCode SDK)
  └── clientConnected = Boolean(client())
      └── 传给 StatusBar → 显示 "Engine" 状态

openworkServerStatus ("connected" | "limited" | "disconnected")
  └── checkOpenworkServer() 每15秒轮询
      └── 传给 StatusBar → 显示 "Server" 状态
```

### 多引擎架构

| 引擎 | 接入方式 | 状态指示 |
|------|---------|---------|
| OpenCode SDK | HTTP 客户端（通过 Server /opencode 代理） | `clientConnected` |
| Claude Code CLI | Tauri subprocess + stdout 解析 | 无状态指示器 |
| Codex CLI | Tauri subprocess + stdout 解析 | 无状态指示器 |

### 工作区状态流

```
app.tsx
  ├── workspaces[]          ← 工作区列表（从 Server API 获取）
  ├── activeWorkspaceId     ← 当前激活工作区
  └── sessions[]            ← 当前工作区的会话列表
      └── activeSessionId   ← 当前会话
```

### 视图路由（无 URL 路由，用信号控制）

```
view: "session" | "dashboard"
tab:  "scheduled" | "soul" | "skills" | "extensions" | "settings" | ...

view="session"    → 显示 session.tsx 主会话页
view="dashboard"  → 显示 Dashboard，tab 决定显示哪个子页
```

---

## Tauri IPC 命令

> 文件：`packages/app/src/app/lib/tauri.ts`（封装层）
> 实现：`packages/desktop/src-tauri/src/lib.rs`

### 常用命令

| 命令 | 用途 |
|------|------|
| `getOpenCodeRouterStatus` | 获取 Messaging Bridge 状态（Telegram/Slack） |
| `runClaudeCode` | 启动 Claude Code CLI 子进程 |
| `runCodex` | 启动 Codex CLI 子进程 |
| `readFile` / `writeFile` | 本地文件读写 |
| `openPath` | 在系统文件管理器打开路径 |

### tauri.conf.json 关键字段

```json
{
  "productName": "do-what",
  "identifier": "com.personal.do-what",
  "bundle": {
    "externalBin": [
      "sidecars/opencode",
      "sidecars/openwork-server",
      "sidecars/openwork-orchestrator"
    ]
  },
  "plugins": {
    "deep-link": { "desktop": { "schemes": ["openwork"] } }
  }
}
```

---

## 常见改动路径

### 改 UI 颜色/样式
1. 查 `styles/tokens.css` 确认 token 名
2. 在目标组件替换 `gray-*` / `indigo-*` → `var(--color-*)`
3. `pnpm typecheck` 验证

### 改应用品牌/名称
- 窗口标题：`tauri.conf.json` → `productName` / `title`
- Logo 组件：`components/openwork-logo.tsx`
- 状态栏标签：`components/status-bar.tsx` 第 ~200、~212 行
- 字符串：`app.tsx` 搜索 "OpenWork"

### 改右侧工具栏
- 文件：`pages/session.tsx` 约 3223–3310 行
- 注意：Soul 按钮有 `soulNavIconClass()` 动态 class，替换图标时需保留

### 改左侧侧边栏
- 文件：`components/session/sidebar.tsx`
- 工作区卡片：~352 行；会话列表：~490 行

### 改消息渲染
- 文件：`components/session/message-list.tsx`
- 推理卡片：~316 行；步骤折叠：~552 行；消息气泡：~635 行

### 添加新 SVG 装饰
1. 从 `do-what/UI/svg/` 复制到 `v0.5/packages/app/public/svg/`（保持目录结构）
2. 在组件中用 `<img src="/svg/..." alt="" aria-hidden="true" />` 引用
3. 装饰性 SVG 加 `opacity-[0.06~0.75]` 控制强度

### 改背景色
- 文件：`styles/tokens.css`
- 只改 `--color-bg-base` 和 `--color-bg-sidebar`，保持 `--color-bg-elevated` 为白色

---

*最后更新：v0.5 UI 改造轮次（品牌替换 + 牛皮纸背景 + SVG图标）*
