# UI Style Bible — do-what 设计规范

> 版本：v0.1（Claude 起草，Codex 按此实施 v0.5）
> 定位：暖米色调极简桌面 AI 控制台，三栏布局，引擎状态可见。

---

## 一、核心设计原则

1. **信息密度适中** — 不过度留白，不过度堆叠，每个元素都有存在意义。
2. **暖色而非冷色** — 背景用暖白/暖米，避免纯白 `#FFFFFF` 的刺眼感。
3. **极简强调** — 强调色用极深灰 `#1A1A1A` 而非蓝色；需要状态色时用 Radix green/amber/red。
4. **清晰的层级** — 背景 → 侧边栏 → 卡片 → 悬浮层，每层有明确视觉分离。
5. **引擎可见** — 每个 session/run 都要让用户一眼看出是哪个引擎在跑。

---

## 二、色彩系统

### 背景层级

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-bg-base` | `#FAF8F5` | 主背景、内容区 |
| `--color-bg-sidebar` | `#F2EFE9` | 左侧边栏、右侧面板 |
| `--color-bg-elevated` | `#FFFFFF` | 卡片、输入框、弹出层 |
| `--color-bg-overlay` | `rgba(0,0,0,0.04)` | hover 状态遮罩 |

### 边框

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-border-subtle` | `#E5E0D8` | 细分割线 |
| `--color-border-default` | `#D4CFC6` | 默认边框 |
| `--color-border-strong` | `#B8B2A8` | 强调边框、focus ring |

### 文字

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-text-primary` | `#1A1A1A` | 主要内容 |
| `--color-text-secondary` | `#5C5750` | 次要说明、label |
| `--color-text-tertiary` | `#8C887F` | 辅助标注、placeholder |
| `--color-text-disabled` | `#B8B2A8` | 禁用状态 |
| `--color-text-inverse` | `#FFFFFF` | 深色背景上的文字 |

### 强调色

| Token | 色值 | 用途 |
|-------|------|------|
| `--color-accent-primary` | `#1A1A1A` | 按钮、active 状态、focus |
| `--color-accent-secondary` | `#3D3A35` | hover 深色 |

### 引擎 Badge（Runtime Indicator）

| 引擎 | 背景 Token | 文字 Token | 标签 |
|------|-----------|-----------|------|
| Claude Code | `--color-runtime-cc-bg: #FFF3E0` | `--color-runtime-cc-text: #E65100` | `CC` |
| Codex | `--color-runtime-cx-bg: #E8F5E9` | `--color-runtime-cx-text: #1B5E20` | `CX` |
| OpenCode | `--color-runtime-oc-bg: #EDE7F6` | `--color-runtime-oc-text: #4527A0` | `OC` |

### 状态色（沿用 Radix Colors）

- **Success** — `var(--green-9)` 前景 / `var(--green-3)` 背景
- **Warning** — `var(--amber-9)` 前景 / `var(--amber-3)` 背景
- **Error** — `var(--red-9)` 前景 / `var(--red-3)` 背景
- **Running** — `var(--amber-9)` 闪烁点（CSS animation: pulse）

---

## 三、布局规范

### 整体三栏结构

```
┌──────────────────────────────────────────────────────────┐
│  Titlebar (32px) — macOS: traffic lights / Win: controls │
├──────────┬───────────────────────────┬───────────────────┤
│          │                           │                   │
│  Left    │    Main Content           │  Right Panel      │
│  Sidebar │    flex-1, min-w: 0       │  280px            │
│  240px   │                           │  (可隐藏)         │
│          │                           │                   │
├──────────┴───────────────────────────┴───────────────────┤
│  Status Bar (24px)                                       │
└──────────────────────────────────────────────────────────┘
```

### 左侧边栏内部结构（240px）

```
┌─────────────────────────┐
│ [Logo] do-what     [+]  │  32px — app header
├─────────────────────────┤
│  搜索框（可选）          │  36px
├─────────────────────────┤
│ ▼ Project A             │  ← 可折叠 project 分组
│   ● [CC] session 1      │  ← 状态点 + badge + 标题
│   ○ [CX] session 2      │
│   ✗ [OC] session 3      │
├─────────────────────────┤
│ ▼ Quick Chats           │
│   ○ chat 1              │
│   ○ chat 2              │
├─────────────────────────┤
│  (弹性空白)              │
├─────────────────────────┤
│ [🗓] [💾] [⚙] [⚡]      │  底部 nav icons — 对应 scheduled/soul/settings/skills
└─────────────────────────┘
```

### 右侧面板（280px）

v0.5 只保留两个子面板：
- **Tasks** — 当前 session 的 todo 列表
- **Files** — 当前 session 的工作文件列表

移除原有的 **Agents** 子面板（功能合并进 extensions）。

### 主内容区

- **Session（OpenCode）**：消息列表居中，`max-w: 760px`，两侧自动留白
- **AgentRun（CC/CX）**：事件卡片全宽流式输出
- **Dashboard**：`grid grid-cols-1`，各 tab 内容各自布局

---

## 四、组件规范

### Session Item（侧边栏单条目）

```
● [CC] session title truncated...    12:34
│  │    └── title: text-sm, truncate  └── text-xs, text-tertiary
│  └── runtime badge: 10px font, 2px padding
└── status dot: 8px circle
```

尺寸规范：
- 高度：`36px`
- Padding：`8px 12px`
- Hover：`background: var(--color-bg-overlay)`
- Active：`background: var(--color-border-subtle)` + 左边框 `2px solid var(--color-accent-primary)`
- Status dot 颜色：running=amber pulse / done=gray / error=red

### Runtime Badge

```tsx
// 用法示例
<span class="runtime-badge runtime-badge--cc">CC</span>
<span class="runtime-badge runtime-badge--cx">CX</span>
<span class="runtime-badge runtime-badge--oc">OC</span>
```

CSS：
```css
.runtime-badge {
  font-size: 10px;
  font-family: var(--font-mono);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.runtime-badge--cc { background: var(--color-runtime-cc-bg); color: var(--color-runtime-cc-text); }
.runtime-badge--cx { background: var(--color-runtime-cx-bg); color: var(--color-runtime-cx-text); }
.runtime-badge--oc { background: var(--color-runtime-oc-bg); color: var(--color-runtime-oc-text); }
```

### Agent Run 事件卡片

**text-card**
- 背景：透明
- 文字：`var(--color-text-primary)`，14px，1.6 line-height
- 渲染：`marked` markdown

**bash-card**
```
┌──────────────────────────────────┐
│ $ npm install                    │  ← 命令行：amber 色 $，白色命令
│ > Installing dependencies...     │  ← stdout：灰色
│ ✓ Done in 2.3s                   │
└──────────────────────────────────┘
```
- 背景：`#1A1A1A`，圆角 `var(--radius-md)`
- 字体：monospace 13px，`#E0E0E0`
- `$` 符号：`var(--amber-9)`

**tool-call-card**
- 默认折叠，`▶ tool_name(arg1, arg2)` 单行
- 展开后：参数 JSON + 结果，可滚动，最大高度 200px

**file-write-card**
- header：`📝 path/to/file.ts`，`var(--color-text-secondary)`
- diff 内容：`+` 行绿色背景，`-` 行红色背景，monospace

**done-banner**
```
✓ Done in 12.4s                     [exit 0]   ← 绿色左边框
✗ Failed                            [exit 1]   ← 红色左边框
```

### Composer 工具栏扩展行

仅当选了非 OpenCode 引擎时，在原工具栏**上方**多显示一行：

```
[Runtime: Claude Code ▼]   [Workdir: ~/projects/foo  ✎]
```

- 高度：`28px`
- 背景：`var(--color-bg-sidebar)`
- 字号：`12px`，`var(--color-text-secondary)`
- 边框：底部 `1px solid var(--color-border-subtle)`

---

## 五、Session DAG 组件规范

位置：主内容区顶部右上角，`position: absolute; top: 8px; right: 8px`。

**折叠态（默认）**：
```
◆ 4 sessions
```
- `height: 28px`，`background: var(--color-bg-elevated)`
- `border: 1px solid var(--color-border-subtle)`
- `border-radius: var(--radius-md)`
- `padding: 0 8px`
- `font-size: 12px`，`color: var(--color-text-secondary)`

**展开态（浮层卡片）**：
```
┌──────────────────────────────┐
│ Session Flow            [×]  │  ← header
├──────────────────────────────┤
│ ● [CC] 架构设计              │
│   └─→ ● [CX] 功能A实现       │
│        └─→ ○ [CC] 集成       │
│ ○ [OC] 测试设计              │
└──────────────────────────────┘
```
- `width: 280px`，`max-height: 200px`，`overflow-y: auto`
- `box-shadow: var(--shadow-md)`
- v0.5 实现：简单的缩进列表（`parentSessionIds` 对应 indent level），不画箭头
- v0.6+ 再升级为 dagre 有向图

---

## 六、字体规范

```css
:root {
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
  --text-xs:   11px;
  --text-sm:   13px;
  --text-base: 14px;
  --text-lg:   16px;
  --text-xl:   18px;
}
body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.5;
}
```

---

## 七、间距与圆角

```css
:root {
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;
  --space-4: 16px;  --space-5: 20px;  --space-6: 24px;
  --space-8: 32px;  --space-10: 40px;

  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-full: 9999px;
}
```

---

## 八、暗色模式

v0.5 **不实现**暗色模式，但 token 命名为扩展预留：

```css
/* 未来只需覆盖这段即可 */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-base:    #1C1A17;
    --color-bg-sidebar: #211F1B;
    /* ...其余 token... */
  }
}
```

---

## 九、实施顺序（供 Codex 执行 v0.5 时参考）

1. 创建 `packages/app/src/app/styles/tokens.css`，写入上述所有 token
2. 在 `packages/app/src/app/index.css` 顶部 `@import "./styles/tokens.css"`
3. `body` 背景改为 `var(--color-bg-base)`
4. 侧边栏容器改为 `var(--color-bg-sidebar)`
5. 所有边框从灰色系改为 `var(--color-border-*)` 系列
6. 实现 `.runtime-badge` CSS 类
7. 实现 `session-dag.tsx` 组件（见 `v0.5-spec.md`）
8. 添加 `--dls-*` → 新 token 的兼容映射，避免旧代码报错
9. `pnpm typecheck && pnpm dev:ui` 视觉验证
