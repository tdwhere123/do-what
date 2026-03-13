# do-what UI 设计规范 v0.2

> 来源：`do-what-proposal-v0.1.md` §16 + `UI/风格参考/` + `UI/svg/`
> 适用范围：`packages/app`（Electron + React）
> v0.2 变更：Soul 融入对话气泡角标 / 对话+CLI 合一时间线 / 右侧多模式面板 / Settings 归并

---

## 1. 设计哲学

**暖纸质感 + 有机 SVG 装饰 + 严格的功能区分离**

- 整体基调：温暖的羊皮纸/米白底，不冷漠、不科技感，像一张有纹路的工作桌面
- 装饰元素来自 `UI/svg/`，有机形（organic）用于导航与记忆区，几何形（geometric）用于状态指示与数据区
- 手写体（Kalam）严格限于导航标签和装饰文字，所有信息密集区用系统无衬线或等宽字体
- 动画节制：只有装饰性星星等闲置动画，操作中自动暂停，支持 `prefers-reduced-motion`
- Soul 以「幽灵浮现」方式存在：越确定的记忆颜色越深，最淡的几乎感知不到

---

## 2. 色彩系统

### 2.1 基础色票

| Token | 值 | 用途 |
|-------|----|------|
| `--bg` | `#F3EFEA` | 应用主背景（灰石米色，复古纸质感） |
| `--surface` | `#FAF8F5` | 面板/卡片背景（旧书页浅色） |
| `--surface-raised` | `#FFFFFF` | 悬浮弹窗、模态框 |
| `--border` | `#E6DCD1` | 分割线、边框（温和奶咖边线） |
| `--border-strong` | `#D1C7BB` | 强调边框 |
| `--text-primary` | `#2D2520` | 主文字（深咖，柔和的碳黑色）|
| `--text-secondary` | `#8F8176` | 次要文字（复古灰褐） |
| `--text-muted` | `#B3A89F` | 弱化文字、占位符 |

### 2.2 强调色

| Token | 值 | 用途 |
|-------|----|------|
| `--accent-primary` | `#654E40` | 主强调色（深摩卡棕，稳重人文）|
| `--accent-primary-light` | `#826859` | hover/active 状态 |
| `--accent-warm` | `#C48A7E` | 暖强调（灰调黏土橘，植物生命感）|
| `--accent-warm-light` | `#DFAB9F` | 暖强调 hover |
| `--accent-gold` | `#C99B4A` | 高亮/晋升标记（Canon 级记忆）|

### 2.3 状态色

| Token | 值 | 语义 |
|-------|----|------|
| `--status-running` | `#3D7A5E` | 运行中（深绿） |
| `--status-success` | `#2D6B4A` | 完成 |
| `--status-waiting` | `#8B6B35` | 等待审批（琥珀） |
| `--status-error` | `#B54040` | 失败/错误 |
| `--status-interrupted` | `#7A5E7A` | 被中断（灰紫） |
| `--status-idle` | `#9A9282` | 空闲/未连接 |

### 2.4 Soul 层专用色（幽灵三级）

| Token | 值 | 气泡角标点色 | Tooltip 字色 |
|-------|----|------------|------------|
| `--soul-working` | `rgba(28,26,20,0.18)` | 极淡灰 | 极淡灰斜体 11px |
| `--soul-consolidated` | `rgba(168,94,45,0.45)` | 中等暖棕 | 中等暖色斜体 12px |
| `--soul-canon` | `#C99B4A` | 金色实心 | 金色 12px，左 2px 金线 |
| `--soul-trial` | `rgba(122,138,122,0.35)` | 虚线边框灰绿 | 灰绿 |

---

## 3. 字体系统

```css
/* 装饰性手写体：导航标签、章节装饰文字 */
--font-display: 'Kalam', cursive;

/* 功能性 UI 文字：所有信息密集区 */
--font-ui: 'Inter', system-ui, -apple-system, sans-serif;

/* 代码/diff/日志/cue 内容/命令输出 */
--font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
```

### 字号阶梯

| 用途 | 大小 | 字体 | 备注 |
|------|------|------|------|
| 导航标签 | 13px | Kalam | weight 400，字间距 0.02em |
| 装饰标题 | 18–24px | Kalam | 仅用于空状态/欢迎页 |
| UI 正文 | 13px | Inter | weight 400 |
| UI 小字 | 11px | Inter | weight 400，--text-secondary |
| 代码/日志 | 12px | Mono | |
| Cue gist | 12px | Mono | 始终等宽 |
| 状态文字 | 11px | Inter | weight 500，大写 |
| 按钮标签 | 12px | Inter | weight 500 |

---

## 4. SVG 图标规范

> 所有图标来自 `UI/svg/`，**不引入第三方图标库**。

### 4.1 使用规则

- SVG 作为 React 组件内联（`<SvgIcon />`），不用 `<img>`，便于 CSS 控制 fill/stroke
- 默认颜色：`currentColor`（将 SVG 中的硬编码颜色替换为 `currentColor`）
- 图标尺寸规格：`16px`（小）/ `20px`（标准）/ `24px`（大）/ `32px`（装饰性）
- 装饰性大图标（48px+）保留原始颜色，不替换为 `currentColor`

### 4.2 导航/状态/Soul 图标映射

| 用途 | SVG 路径 | 颜色 |
|------|----------|------|
| Automations（导航） | `organic/shape/flower/Elements-organic-shape-flower-nature-splash.svg` | `--accent-primary` |
| Soul（导航） | `organic/shape/spiral/Elements-organic-shape-spiral.svg` | `--accent-warm` |
| Settings（导航底部） | `organic/shape/sun/Elements-organic-shape-sun.svg` | `--text-secondary` |
| 运行中（旋转） | `organic/shape/circle/Elements-organic-shape-circle--loading-spin.svg` | `--status-running` |
| 完成 | `organic/shape/star/Elements-organic-shape-star-wink.svg` | `--status-success` |
| 等待审批 | `organic/shape/hand/Elements-organic-shape-hand.svg` | `--status-waiting` |
| 失败 | `organic/shape/abstract/Elements-organic-shape-abstract-comet.svg` | `--status-error` |
| 发送/Run | `organic/shape/abstract/Elements-organic-shape-abstract-sparkle-dash.svg` | `--accent-warm` |
| 用户头像 | `organic/shape/face/Elements-organic-shape-face.svg` | `--text-secondary` |
| 引擎头像 | `organic/shape/smile/Elements-organic-shape-smile-eye.svg` | `--accent-primary` |
| Soul cue Working | `organic/shape/leaves/Elements-organic-shape-leaves-nature-twig.svg` | `--soul-working` (不透明度 20%) |
| Soul cue Consolidated | `organic/shape/leaves/Elements-organic-shape-leaves-nature-2.svg` | `--soul-consolidated` (不透明度 60%) |
| Soul cue Canon | `organic/shape/flower/Elements-organic-shape-flower-nature-cute.svg` | `--soul-canon` (不透明度 100%) |
| Checkpoint | `organic/shape/abstract/Elements-organic-shape-abstract-footprint-tulip.svg` | `--accent-warm` |
| 提案/Proposal | `organic/shape/abstract/Elements-organic-shape-abstract-sparkle-dash.svg` | `--accent-gold` |
| 闲置星星（装饰） | `geometric/shape/star/Elements-geometric-shape-star-sparkle.svg` | `--accent-primary @0.35` |

---

## 5. 主窗口布局

### 5.1 三栏结构

```
┌──────────────────────────────────────────────────────────────────┐
│  顶栏（40px）：[do-what] [工作区名] [Claude|Codex] [+ New Run] [⚙]  │
├──────────────────┬───────────────────────────────┬───────────────┤
│ 左：Run 列表      │  中：对话时间线（fluid）          │ 右：多模式纵向栏│
│ （200px）        │                               │ （260px）     │
│                  │  ┌──────────────────────────┐ │ ┌───────────┐ │
│ [● Run #1]       │  │ [face] 你          21:30 │ │ │ ▼ 概览     │ │
│ [◎ Run #2]       │  │        帮我分析错误...     │ │ │  (未选中)  │ │
│ [○ Run #3]       │  │                          │ │ ├───────────┤ │
│ ──────────────── │  │ [smile] do-what [Cl]21:31│ │ │ ▼ 历史     │ │
│ + New Run        │  │         好的，我看看...    │ │ └───────────┘ │
│                  │  │                          │ │  或 (选中态): │
│                  │  │         → [▶ shell_exe]  │ │ ┌───────────┐ │
│                  │  └──────────────────────────┘ │ │ ▼ Files     │ │
│                  │                               │ ├───────────┤ │
│                  │  [输入框 ─────────────── 发送] │ │ ▼ Tasks     │ │
│                  │                               │ ├───────────┤ │
│                  │                               │ │ ▼ CLI/Git ⟷ │ │
│                  │                               │ └───────────┘ │
├──────────────────┴───────────────────────────────┴───────────────┤
│  状态栏（28px）：Core ● | Claude ● | 网络 ● | Soul: 完整            │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 顶栏（40px）

- 背景 `--surface`，底边 1px `--border`
- 左：`do-what` 用 Kalam 16px + 工作区名 Inter 13px `--text-secondary`
- 中：引擎 Pill（Claude / Codex），选中态 `--accent-primary` 填充
- 右：`[+ New Run]` 主按钮 + `[⚙]` Ghost 按钮（点击进入 Settings 页）

### 5.3 左侧 Run 列表（200px）

- 背景 `--bg`，右边 1px `--border`
- 每个 Run：状态图标（16px）+ RunId mono 字体 + 引擎名小字 + 相对时间
- 运行中：`circle--loading-spin.svg` 旋转
- 完成：`star-sparkle-wink.svg` 静态
- 等待审批：`hand.svg` 轻微脉冲
- 激活项：左侧 2px `--accent-primary` 实线 + 背景 `--surface`
- 底部：`[+ New Run]` Ghost 按钮

### 5.4 状态栏（28px，底部固定）

- 背景 `--accent-primary`，文字 `rgba(255,255,255,0.85)`，Inter 11px weight 500
- 分段：`Core ●` · `Claude ●` · `Codex ●` · `网络 ●` · `Soul: 完整`
- 异常时对应段变 `--status-error`（保持 mocha 底色不变）

---

## 6. 中间对话时间线

**对话与 CLI 工具调用共用同一条时间线**，不再分割为独立区域。

### 6.1 消息区文档流排版

不再使用气泡，改为文档型排版，用头像区分发言人：

- 头像：20px 有机 SVG，`face.svg`（用户） / `smile-eye.svg`（引擎），置于消息块左侧
- 发言人标签：Inter 12px `--text-secondary`，头像右侧
- 时间戳：最右侧，Inter 11px `--text-muted`
- 消息正文：头像右方，与发言人标签同容器向下延展，`--text-primary` 13px
- 代码块：深色背景（`#1C1A14`），JetBrains Mono 12px，圆角 8px
- 消息间距：消息块之间用垂直间距（16px）自然区分，不需要气泡框与水平分割线

### 6.2 Soul 边注系统（左侧）

取消原有的气泡角标，改为在整个时间线左侧预留 16px 的边注通道：

- **图标通过形态和透明度（颜色深浅）区分显影程度：**
  - **Working**：`organic/shape/leaves/Elements-organic-shape-leaves-nature-twig.svg`（单枝桠），不透明度 `20%`
  - **Consolidated**：`organic/shape/leaves/Elements-organic-shape-leaves-nature-2.svg`（双叶），不透明度 `60%`
  - **Canon**：`organic/shape/flower/Elements-organic-shape-flower-nature-cute.svg`（开花），不透明度 `100%`，带 `--accent-gold` 点缀
- Hover：展开 tooltip（Mono 11px），点击进入 Soul 详情
- 无 cue 时：通道为空白，不显示任何占位元素

### 6.3 工具调用内联卡片

工具调用作为时间线中的独立行（非气泡），样式：
```
[▶ file_write] packages/core/src/db.ts  ✓ 23ms
[▶ shell_exec] pnpm test --filter core  ⟳ running...
[▶ git_commit] "feat: add policy engine" ✓ 12ms
```
- 左侧工具图标（对应 SVG 16px）+ 工具名 Mono 12px
- 右侧状态徽章（running/success/error）+ 耗时
- 点击展开参数/输出详情（折叠）
- 背景：`--bg`（与主体区分层次）

### 6.4 审批与 Ask 操作区

当引擎处于 WaitingApproval 或 Ask 状态时，**在输入框正上方弹出 CLI 风格操作区**：

```
┌───────────────────────────┐
│ ⚠ Claude 请求执行：shell_exec  │
│ ❯ 允许一次                  │
│   本次会话允许              │
│   查看详情 ↗                │
│   拒绝                      │
└───────────────────────────┘
```

- 背景 `--surface-raised`，风格极致收敛，贴近代码终端体验
- 使用上下方向键或鼠标悬浮高亮当前选项（`❯` 前缀，行内高亮背景色）
- 选项纵向排列，最新审批在最前

---

## 7. 右侧多模式纵向栏（260px）

不再使用横向 Tab 切换，改为纵向堆叠的区块布局，所有信息一览无余。内容区背景使用 `--bg`，overflow-y 滚动。

### 7.1 空闲状态（无活跃 Run 时）

固定分为上下两栏：

- **概览 (Overview)**：引擎状态、Soul 模式、工具链健康摘要等全局指标。
- **历史记录 (History)**：所有历史 Run 的精简列表。

### 7.2 活跃状态（有一项及以上活跃 Run 时）

固定分为竖向三个区块：

1. **文件 (Files)**（顶部）：
   - 当前 Run 影响到的文件列表。
   - 每行展示 `文件路径（mono 12px）` + `+N`（绿）`-M`（红）增删量。
   - 点击查看统一的 Diff 预览区。
   - 空状态："No files changed yet"。

2. **任务 (Tasks)**（中部）：
   - 对话中产生的当前 Todo 清单。
   - 每行前置 checkbox 复选框，已完成条目使用删除线并置灰（`--text-muted`）。
   - 空状态："Nothing to do"。

3. **CLI Cluster / Git Tree**（底部）：
   - 提供区块右上角 toggle 图标，在这两项视图中来回切换。
   - **CLI Cluster**：DAG 节点连线视图，展示当前 Worktree 并行状态，反映 Proposal / Integrator 并发执行情况。
   - **Git 树**：代码版本树状结构。
   - 空状态："No parallel runs"。

---

## 8. Settings 页

点击顶栏 ⚙ 进入，独立页面（不是模态框），点击任意 Run 或 X 返回。

**分组卡片布局：**

### 8.1 引擎配置
- Claude / Codex 各一张卡片
- 内容：路径、API Key（masked）、模式切换、健康检查指标
- 外部管理时显示只读横幅

### 8.2 Soul 高级设置
- ComputeProvider 选择
- 预算/频率上限滑块
- 自动 Checkpoint 开关

### 8.3 Policy / 审批规则
- 工具审批策略列表（auto-allow / require-approval / block）
- 可编辑 JSON 规则

### 8.4 工具链状态
- Git / Node / pnpm / ripgrep 各一行
- 已安装（绿）/ 缺失（红）/ 版本低（琥珀）
- `[安装]` 或 `[升级]` 操作按钮

### 8.5 主题/动画偏好
- 减少动画开关（同步 `prefers-reduced-motion`）
- 暗色模式预留开关（v0.2 不实现，占位）

---

## 9. Checkpoint Modal（记忆审阅）

居中模态框（max-width 720px），来源：左侧 Run 列表出现审批图标时触发。

- 标题：`[sparkle-dash.svg] 记忆提案待审阅`（Kalam 18px）
- 左栏：当前 cue（旧版）/ 右栏：提案（新版），两列 diff 对比
- 底部操作：`[Reject]` `[Hint Only]` `[Edit]` `[Accept]`（从左到右优先级升序）

---

## 10. 组件规范

### 10.1 按钮

```
Primary:   bg --accent-primary, text white, border-radius 8px, px 16 py 8
Secondary: bg transparent, border 1px --border, text --text-primary
Danger:    bg transparent, border 1px --status-error, text --status-error
Ghost:     bg transparent, no border, text --text-secondary, hover bg --border@0.4
```

- hover 变亮 8%，active 变暗 8%，transition 80ms ease
- 禁用态 opacity 0.4，pointer-events none

### 10.2 状态徽章

```
[图标 12px] [文字 11px Inter weight 500 uppercase]
圆角 4px，padding 2px 8px
```

### 10.3 卡片

- 背景 `--surface`，border 1px `--border`，border-radius 12px，padding 16px
- 悬浮卡片：`--surface-raised` + shadow `0 4px 16px rgba(44,40,20,0.08)`

---

## 11. 动画规范

### 11.1 星星闪烁（装饰性，左栏顶部）

```css
@keyframes sparkle-blink {
  0%, 100% { opacity: 0; transform: scale(0.6) rotate(0deg); }
  50%       { opacity: 1; transform: scale(1)   rotate(15deg); }
}
.sparkle { animation: sparkle-blink 2.8s ease-in-out infinite; }
```

- 多颗错开 delay（0s / 0.9s / 1.8s）
- 交互期间 `animation-play-state: paused`，交互结束 3s 后恢复

### 11.2 加载旋转

```css
@keyframes spin { to { transform: rotate(360deg); } }
.loading-spin { animation: spin 1.2s linear infinite; }
```

### 11.3 减少动画

```css
@media (prefers-reduced-motion: reduce) {
  .sparkle, .decorative-anim { animation: none; opacity: 0.6; }
}
```

### 11.4 其他过渡

- 抽屉/面板：transform + opacity，200ms ease-out
- 模态框：scale(0.96→1) + opacity，150ms ease-out
- 页面切换：opacity，120ms

---

## 12. 空状态设计

每个空状态：装饰 SVG（48–80px，居中）+ Kalam 18px 主文 + Inter 13px 次要说明。

| 区域 | SVG | 主文 |
|------|-----|------|
| 无 Run | `organic/shape/abstract/Elements-organic-shape-abstract-wave.svg` | No runs yet |
| Soul 无记忆 | `organic/shape/spiral/Elements-organic-shape-spiral-circle.svg` | Memory is blank |
| Files 无改动 | `organic/shape/leaves/Elements-organic-shape-leaves-nature-twig.svg` | No files changed |
| CLI 无并行 | `organic/shape/bush/Elements-organic-shape-bush-curly-nature.svg` | No parallel runs |
| Tasks 空 | `organic/shape/leaves/Elements-organic-shape-leaves-nature-vine.svg` | Nothing to do |

---

## 13. SVG 组件目录约定

```
packages/app/src/assets/icons/
  nav/          ← flower-nature-splash, spiral, sun
  status/       ← circle-loading, star-wink, hand, comet
  actions/      ← sparkle-dash, face, smile-eye
  soul/         ← leaves-nature-twig, leaves-nature-2, flower-nature-cute
  empty/        ← wave, spiral-circle, leaves-nature-twig, bush-curly-nature, leaves-nature-vine
```

每个 SVG 封装为 React 组件，接受 `size?: number` 和 `className?: string`。
颜色通过 CSS `color` 或 `fill` 控制。
