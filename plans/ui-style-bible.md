# UI Style Bible — do-what

> 本文档是 do-what 的 UI 设计规范，所有 UI 改动以此为准。
> Codex 实施 v0.5 时必须先阅读本文档。

---

## 1. 设计哲学

**极简 + 必要信息可见**
- 不显示"有了更好"的元素，只显示"当前任务需要"的元素
- 信息密度适中：不空旷、不拥挤
- 状态变化用细微动效传达，不用弹窗/提示音

**暖调、低刺激**
- 长时间使用不疲惫
- 主色调是暖白 / 米色，不是纯白 (#ffffff)
- 强调色是深灰而非蓝色，减少"网页感"

**层级清晰**
- 三层视觉权重：主要内容 / 次要信息 / 背景/装饰
- 深色 = 重要，浅色 = 辅助

---

## 2. 色彩 Token

### 2.1 基础色（Primitive Tokens）

使用 Radix UI 色系作为原始值，不直接在组件中引用，只通过语义 token 使用。

```css
/* 暖灰系（主色调） */
--primitive-sand-1:  #fdfdfc;
--primitive-sand-2:  #f9f9f7;
--primitive-sand-3:  #f3f2ef;
--primitive-sand-4:  #eceae6;
--primitive-sand-5:  #e4e2dc;
--primitive-sand-6:  #dad8d0;
--primitive-sand-7:  #c8c5ba;
--primitive-sand-8:  #b0aca0;
--primitive-sand-9:  #8a8578;
--primitive-sand-10: #7c7770;
--primitive-sand-11: #5e5b54;
--primitive-sand-12: #211f1c;

/* 状态色（沿用 Radix） */
--primitive-green-9:  #30a46c;
--primitive-amber-9:  #f59f00;
--primitive-red-9:    #e5484d;
--primitive-blue-9:   #0090ff;  /* 仅用于链接/外部 */
```

### 2.2 语义 Token（Semantic Tokens）

```css
/* ─── 背景 ─── */
--color-bg-base:      var(--primitive-sand-1);   /* 主背景 #fdfdfc */
--color-bg-subtle:    var(--primitive-sand-2);   /* 轻微凹陷背景 */
--color-bg-sidebar:   var(--primitive-sand-3);   /* 左侧边栏 */
--color-bg-raised:    #ffffff;                   /* 浮层/卡片（纯白略高于基底） */
--color-bg-overlay:   rgba(33, 31, 28, 0.4);     /* 遮罩层 */

/* ─── 边框 ─── */
--color-border-default: var(--primitive-sand-5); /* 常规分割线 */
--color-border-subtle:  var(--primitive-sand-4); /* 极淡边框 */
--color-border-strong:  var(--primitive-sand-7); /* 强调边框 */

/* ─── 文字 ─── */
--color-text-primary:   var(--primitive-sand-12); /* 主要文字 #211f1c */
--color-text-secondary: var(--primitive-sand-11); /* 辅助文字 */
--color-text-tertiary:  var(--primitive-sand-9);  /* 占位符/标签 */
--color-text-disabled:  var(--primitive-sand-7);  /* 禁用状态 */
--color-text-inverse:   var(--primitive-sand-1);  /* 深色背景上的文字 */

/* ─── 交互 ─── */
--color-interactive-hover:  var(--primitive-sand-4);
--color-interactive-active: var(--primitive-sand-5);
--color-interactive-focus:  var(--primitive-sand-12); /* 焦点环 */

/* ─── 状态色 ─── */
--color-status-success: var(--primitive-green-9);
--color-status-warning: var(--primitive-amber-9);
--color-status-error:   var(--primitive-red-9);
--color-status-info:    var(--primitive-blue-9);

/* ─── 引擎品牌色（节点 badge 用） ─── */
--color-engine-opencode:     #7c5cfc;  /* 紫色 */
--color-engine-claude-code:  #d97706;  /* 琥珀橙，Anthropic 感 */
--color-engine-codex:        #10b981;  /* 绿色，OpenAI 感 */
```

### 2.3 暗色模式（data-theme="dark"）

```css
[data-theme="dark"] {
  --color-bg-base:      #141412;
  --color-bg-subtle:    #1a1917;
  --color-bg-sidebar:   #1e1c1a;
  --color-bg-raised:    #232120;
  --color-border-default: #2e2c29;
  --color-border-subtle:  #252320;
  --color-border-strong:  #3d3a36;
  --color-text-primary:   #ebebea;
  --color-text-secondary: #a8a49e;
  --color-text-tertiary:  #706c66;
  --color-text-disabled:  #504d49;
}
```

---

## 3. 字体 Token

```css
/* ─── 字族 ─── */
--font-sans:  "Inter", "PingFang SC", "Helvetica Neue", system-ui, sans-serif;
--font-mono:  "JetBrains Mono", "Fira Code", "SF Mono", monospace;

/* ─── 字号 ─── */
--text-xs:   11px;  /* 标签、badge、时间戳 */
--text-sm:   12px;  /* 次要信息、元数据 */
--text-base: 13px;  /* 正文（UI 标准，稍小于 web） */
--text-md:   14px;  /* 强调正文、按钮 */
--text-lg:   16px;  /* 标题 */
--text-xl:   20px;  /* 页面标题 */
--text-2xl:  24px;  /* 大标题（慎用） */

/* ─── 行高 ─── */
--leading-tight:  1.3;
--leading-normal: 1.5;
--leading-loose:  1.7;  /* 长文本 */

/* ─── 字重 ─── */
--font-regular:  400;
--font-medium:   500;
--font-semibold: 600;
```

---

## 4. 间距 Token

基准 4px，倍数递增：

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

---

## 5. 圆角 Token

```css
--radius-sm:   4px;   /* 标签、小 badge */
--radius-md:   6px;   /* 按钮、输入框 */
--radius-lg:   10px;  /* 卡片 */
--radius-xl:   16px;  /* 浮层、模态框 */
--radius-full: 9999px; /* pill badge */
```

---

## 6. 阴影 Token

```css
--shadow-sm:  0 1px 2px rgba(33, 31, 28, 0.06);
--shadow-md:  0 4px 12px rgba(33, 31, 28, 0.08), 0 1px 3px rgba(33, 31, 28, 0.04);
--shadow-lg:  0 8px 24px rgba(33, 31, 28, 0.10), 0 2px 6px rgba(33, 31, 28, 0.05);
--shadow-overlay: 0 20px 60px rgba(33, 31, 28, 0.15);
```

---

## 7. 布局规范

### 7.1 三栏结构

```
┌──────────────────────────────────────────────────────┐
│  titlebar (Tauri, 32px, 隐藏时 = 0)                  │
├──────────┬───────────────────────────────┬────────────┤
│          │  topbar (40px)    [DAG 缩略图]│            │
│  sidebar │───────────────────────────────│  context   │
│  240px   │                               │  panel     │
│  (min)   │       main content            │  280px     │
│          │                               │  (可折叠)  │
│          │                               │            │
├──────────┴───────────────────────────────┴────────────┤
│  statusbar (24px)                                     │
└──────────────────────────────────────────────────────┘
```

### 7.2 左侧边栏

- 宽度：240px（固定，不可拖动，可折叠为 52px 图标模式）
- 背景：`--color-bg-sidebar`
- 分区：
  1. 顶部操作区（New Session / New Task，约 48px）
  2. 引擎状态区（每个引擎一行，约 36px/条）
  3. Session 列表区（剩余高度，可滚动）
  4. 底部：当前项目名 + Settings 入口

### 7.3 右侧上下文面板

- 宽度：280px（默认展开，可折叠为 0）
- 分区：TASKS / FILES（精简，移除 AGENTS）
- 背景同主区域，左侧有细分割线

### 7.4 Session DAG 浮层（右上角）

- 触发：topbar 右侧的 `◆ N` 图标按钮
- 展开尺寸：280×180px 浮层，`box-shadow: var(--shadow-overlay)`
- 位置：`position: fixed; top: 40px; right: 280px;`（右侧面板展开时）
- 背景：`--color-bg-raised`，`border-radius: var(--radius-xl)`

---

## 8. 核心组件规范

### 8.1 按钮

```
Primary:   bg=#211f1c  text=#fdfdfc  hover:opacity-90  radius=--radius-md
Secondary: bg=transparent  border=--color-border-default  hover:bg=--color-interactive-hover
Ghost:     bg=transparent  hover:bg=--color-interactive-hover
Danger:    bg=transparent  text=--color-status-error  hover:bg=red-3/20
```

高度：32px（标准）/ 28px（紧凑）/ 36px（大型）

### 8.2 输入框（Composer）

- 背景：`--color-bg-base`
- 边框：`--color-border-default`，focus 时：`--color-interactive-focus`（1px 深色边框）
- 字号：`--text-base`（13px）
- 最小高度：40px，最大：无限（自动扩展）
- 底部工具栏：引擎选择器 + slash 命令 + 附件

### 8.3 Session 列表项

```
height: 40px
padding: var(--space-2) var(--space-3)
active: bg=--color-interactive-active, text=--color-text-primary
idle: text=--color-text-secondary
engine badge: 右侧小点，颜色 = --color-engine-{type}
```

### 8.4 引擎状态行（左侧边栏）

```
height: 36px
左：状态点（8px 圆，颜色 = 运行状态）+ 引擎名
右：session 数量（小数字）
hover: 展开/折叠 session 列表
```

### 8.5 消息气泡

- 用户消息：右对齐，`bg=--color-bg-subtle`，圆角 `--radius-lg`
- AI 消息：无气泡，直接文字排列，左侧小引擎 badge 标注来源
- Tool call 步骤：`bg=--color-bg-subtle`，左侧 2px 竖线（颜色 = 引擎品牌色）
- 代码块：`bg=--color-bg-sidebar`，`font=--font-mono`，`font-size=--text-sm`

### 8.6 Modal / 浮层

- 遮罩：`--color-bg-overlay`
- 内容区：`bg=--color-bg-raised`，`border-radius=--radius-xl`，`shadow=--shadow-overlay`
- 标题：`--text-lg`，`--font-semibold`
- 分割线：`--color-border-subtle`

---

## 9. 动效规范

**原则：快速、克制、有意义**

```css
/* 标准过渡 */
--transition-fast:   80ms ease-out;    /* hover 状态变化 */
--transition-base:  150ms ease-out;   /* 展开/折叠，颜色变化 */
--transition-slow:  250ms ease-out;   /* 面板滑入，模态出现 */

/* 缓动 */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);  /* 有弹性的弹出 */
```

规则：
- 颜色/背景变化：`--transition-fast`
- 尺寸变化（展开/折叠）：`--transition-base`
- 页面级过渡：`--transition-slow`
- 禁用：`prefers-reduced-motion` 时全部 = 0ms

---

## 10. Soul / 记忆 UI 特别规范

Soul 页面是情感重心，需要有"日记/档案"感：

- 字体略大：`--text-md`（14px）正文
- 行高：`--leading-loose`（1.7）
- 进化计数器：大号数字 + 小标签，类似里程碑感
- 待确认进化候选：用淡黄（amber-3/40）背景行，不用弹窗
- Core Memory 字段：可直接 inline 编辑（点击进入编辑态），不跳新页面

---

## 11. Session DAG 节点规范

节点尺寸：约 80×32px
连线：1px 实线，颜色 = `--color-border-strong`，带箭头
节点内容：
- 左：6px 圆点（引擎品牌色）
- 文字：session 名截断（max 10字），`--text-xs`
- 右：状态点（active/idle/error）

汇合节点（多入一出）：稍加粗边框，表示"merge"
并行节点组：同级水平排列，共用一条入线（分叉）

---

## 12. 废弃规则（迁移说明）

从 v0.5 开始，以下旧 token 停用，必须替换：

| 旧 token | 新 token |
|----------|----------|
| `--dls-surface` | `--color-bg-base` |
| `--dls-sidebar` | `--color-bg-sidebar` |
| `--dls-border` | `--color-border-default` |
| `--dls-accent` | `--color-text-primary`（强调用深色） |
| `--dls-text-primary` | `--color-text-primary` |
| `--dls-text-secondary` | `--color-text-secondary` |
| `--dls-hover` | `--color-interactive-hover` |
| `--dls-active` | `--color-interactive-active` |
| `--dls-radius` | `--radius-md` |
| `--dls-radius-lg` | `--radius-lg` |
