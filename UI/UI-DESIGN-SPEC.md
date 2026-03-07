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
| `--bg` | `#F5F0E8` | 应用主背景（暖纸） |
| `--surface` | `#FAF6EF` | 面板/卡片背景 |
| `--surface-raised` | `#FFFFFF` | 悬浮弹窗、模态框 |
| `--border` | `#E2DAC8` | 分割线、边框 |
| `--border-strong` | `#C8BDA6` | 强调边框 |
| `--text-primary` | `#1C1A14` | 主文字（暖黑，非纯黑）|
| `--text-secondary` | `#7A6E5A` | 次要文字 |
| `--text-muted` | `#B5A890` | 弱化文字、占位符 |

### 2.2 强调色

| Token | 值 | 用途 |
|-------|----|------|
| `--accent-indigo` | `#2F2965` | 主强调色（来源：geometric sparkle SVG）|
| `--accent-indigo-light` | `#4A4490` | hover/active 状态 |
| `--accent-warm` | `#A85E2D` | 暖强调（来源：organic star SVG）|
| `--accent-warm-light` | `#D4936A` | 暖强调 hover |
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
| Automations（导航） | `geometric/shape/star/Elements-geometric-shape-star-sparkle.svg` | `--accent-indigo` |
| Soul（导航） | `organic/shape/spiral/Elements-organic-shape-spiral.svg` | `--accent-warm` |
| Skills（导航） | `organic/shape/flower/Elements-organic-shape-flower-nature-cute.svg` | `--accent-warm` |
| Extensions（导航） | `geometric/shape/hexagon/Elements-geometric-shape-hexagon.svg` | `--text-secondary` |
| Settings | `geometric/shape/square/Elements-geometric-shape-square-corner.svg` | `--text-secondary` |
| 运行中（旋转） | `organic/shape/circle/Elements-organic-shape-circle--loading-spin.svg` | `--status-running` |
| 完成 | `geometric/shape/star/Elements-geometric-shape-star-sparkle-wink.svg` | `--status-success` |
| 等待审批 | `organic/shape/hand/Elements-organic-shape-hand.svg` | `--status-waiting` |
| 失败 | `organic/shape/abstract/Elements-organic-shape-abstract-comet.svg` | `--status-error` |
| 发送/Run | `geometric/shape/abstract/Elements-geometric-shape-abstract-rocket.svg` | `--accent-warm` |
| 对话 | `geometric/shape/abstract/Elements-geometric-shape-abstract-bubble-comment-ballon.svg` | `--text-secondary` |
| Agent | `organic/shape/abstract/Elements-organic-shape-abstract-m-bird.svg` | `--accent-indigo` |
| Soul cue Working | `organic/shape/moon/Elements-organic-shape-moon.svg` | `--soul-working` |
| Soul cue Consolidated | `organic/shape/star/Elements-organic-shape-star.svg` | `--soul-consolidated` |
| Soul cue Canon | `organic/shape/star/Elements-organic-shape-star-sharp.svg` | `--soul-canon` |
| Checkpoint | `organic/shape/abstract/Elements-organic-shape-abstract-footprint-tulip.svg` | `--accent-warm` |
| 提案/Proposal | `organic/shape/abstract/Elements-organic-shape-abstract-sparkle-dash.svg` | `--accent-gold` |
| 闲置星星（装饰） | `geometric/shape/star/Elements-geometric-shape-star-sparkle.svg` | `--accent-indigo @0.35` |

---

## 5. 主窗口布局

### 5.1 三栏结构

```
┌─────────────────────────────────────────────────────────────────┐
│  顶栏（40px）：[do-what] [工作区名] [Claude|Codex] [+ New Run] [⚙] │
├──────────────────┬───────────────────────────────┬──────────────┤
│ 左：Run 列表      │  中：对话时间线（fluid）          │ 右：多模式面板│
│ （200px）        │                               │ （260px）    │
│                  │  ┌──────────────────────────┐ │              │
│ [● Run #1]       │  │ 用户消息                  │ │ [Files][CTX] │
│ [◎ Run #2]       │  │              [Soul: ●●○] │ │ [CLI][Tasks] │
│ [○ Run #3]       │  └──────────────────────────┘ │              │
│ ──────────────── │                               │ （面板内容随  │
│ + New Run        │  [tool: file_write ✓ 23ms]    │  Tab 切换）   │
│                  │                               │              │
│                  │  ┌──────────────────────────┐ │              │
│                  │  │ 引擎回复                  │ │              │
│                  │  │              [Soul: ●○○] │ │              │
│                  │  └──────────────────────────┘ │              │
│                  │                               │              │
│                  │  [输入框 ─────────────── 发送] │              │
├──────────────────┴───────────────────────────────┴──────────────┤
│  状态栏（28px）：Core ● | Claude ● | 网络 ● | Soul: 完整           │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 顶栏（40px）

- 背景 `--surface`，底边 1px `--border`
- 左：`do-what` 用 Kalam 16px + 工作区名 Inter 13px `--text-secondary`
- 中：引擎 Pill（Claude / Codex），选中态 `--accent-indigo` 填充
- 右：`[+ New Run]` 主按钮 + `[⚙]` Ghost 按钮（点击进入 Settings 页）

### 5.3 左侧 Run 列表（200px）

- 背景 `--bg`，右边 1px `--border`
- 每个 Run：状态图标（16px）+ RunId mono 字体 + 引擎名小字 + 相对时间
- 运行中：`circle--loading-spin.svg` 旋转
- 完成：`star-sparkle-wink.svg` 静态
- 等待审批：`hand.svg` 轻微脉冲
- 激活项：左侧 2px `--accent-indigo` 实线 + 背景 `--surface`
- 底部：`[+ New Run]` Ghost 按钮

### 5.4 状态栏（28px，底部固定）

- 背景 `--accent-indigo`，文字 `rgba(255,255,255,0.85)`，Inter 11px weight 500
- 分段：`Core ●` · `Claude ●` · `Codex ●` · `网络 ●` · `Soul: 完整`
- 异常时对应段变 `--status-error`（保持 indigo 底色不变）

---

## 6. 中间对话时间线

**对话与 CLI 工具调用共用同一条时间线**，不再分割为独立区域。

### 6.1 消息气泡

- 用户消息：右对齐，`--surface-raised` 背景，圆角 12px，最大宽 72%
- 引擎消息：左对齐，`--surface` 背景，圆角 12px，最大宽 80%
- 代码块：深色背景（`#1C1A14`），JetBrains Mono 12px，圆角 8px
- Diff 块：增行绿色 tint / 删行红色 tint / 变行琥珀 tint

### 6.2 Soul 气泡角标（右上角）

每条消息气泡右上角有微型 Soul 指示区：

```html
<div class="soul-badge">
  <span class="soul-dot canon"></span>    <!-- 金色实心，rgba透明度最高 -->
  <span class="soul-dot consolidated"></span> <!-- 暖棕，中等透明 -->
  <span class="soul-dot working"></span>   <!-- 极淡，几乎隐形 -->
</div>
```

- 每个点 = 一条 active cue（同级别多条则叠加一个点）
- 点径：5px，间距 3px，横排排列
- **Hover** 气泡：展开 tooltip 显示 cue gist 列表（Mono 11px，按级别渲染字色）
- **点击** 角标：展开完整证据 Pointer 详情（模态框）
- 无 cue 时：不显示角标（不占空间）

| 级别 | 点色 | Tooltip 字色 |
|------|------|------------|
| Working | `rgba(28,26,20,0.18)` | 极淡灰斜体 11px |
| Consolidated | `rgba(168,94,45,0.45)` | 中等暖色斜体 12px |
| Canon | `#C99B4A` | 金色 12px，左 2px 金线 |

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
- 背景：`--bg`（略深于气泡，区分层次）

---

## 7. 右侧多模式面板（260px）

顶部 4 个 Tab：`[Files] [Context] [CLI] [Tasks]`

- Tab 栏背景 `--surface`，底边 1px `--border`
- 激活 Tab：`--accent-indigo` 底边 2px + 文字加粗
- 面板内容区：`--bg` 背景，overflow-y scroll

### 7.1 Tab — Files（改动文件）

- 当前 Run 影响到的文件列表
- 每行：`文件路径（mono 12px）` + `+N`（绿）`-M`（红）diff 统计
- 点击 → 展开统一 diff 预览（+行绿 tint，-行红 tint）
- 空状态：`wave.svg` + "No files changed yet"

### 7.2 Tab — Context（Soul 上下文）

- 当前活跃 Soul cues，按确定程度降序排列
- 每条：级别徽章（7×7 点图标）+ gist（Mono 12px）+ Pointer 来源文件路径
- 操作行：`[降权] [归档] [查看证据]`
- 空状态：`spiral-circle.svg` + "Memory is blank"

### 7.3 Tab — CLI Cluster（并行集群）

对应 v0.1 §3.2 Worktree 并行 + Integrator 流程：

```
Proposal 阶段（可并行）
  ├─ Run #1 [Claude]  auth-module    ✓ patch ready
  ├─ Run #2 [Codex]   db-layer       ⟳ running
  └─ Run #3 [Claude]  tests          ✓ patch ready

Integrator（串行合入）
  [✓ Run#1 merged] → [Run#3 queued] → [Fast Gate ⟳]
```

- DAG 节点连线用内联 SVG
- Integrator 队列顺序可视化
- Fast Gate 结果（pass 绿/fail 红）
- 空状态：`m-bird.svg` + "No parallel runs"

### 7.4 Tab — Tasks（任务清单）

- 当前对话中提取/生成的 Todo 列表
- 每条：`[checkbox] 描述文字（Inter 13px）` + 关联 Run 编号小标
- 支持手动添加任务（底部输入行）
- 已完成条目：strike-through + `--text-muted`

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
Primary:   bg --accent-indigo, text white, border-radius 8px, px 16 py 8
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
| 无 Run | `organic/abstract/wave.svg` | No runs yet |
| Soul 无记忆 | `organic/spiral/spiral-circle.svg` | Memory is blank |
| Files 无改动 | `geometric/abstract/wave.svg` | No files changed |
| CLI 无并行 | `organic/abstract/m-bird.svg` | No parallel runs |
| Tasks 空 | `organic/hand/hand.svg` | Nothing to do |

---

## 13. SVG 组件目录约定

```
packages/app/src/assets/icons/
  nav/          ← sparkle, spiral, flower, hexagon, square-corner
  status/       ← circle-loading, star-wink, hand, comet, cloud
  actions/      ← rocket, bubble, stamp, filter-funnel, target
  soul/         ← moon, star-sharp, footprint-tulip, sparkle-dash
  decorative/   ← line-curly, wave, dot-grain, star-sparkle-wink
```

每个 SVG 封装为 React 组件，接受 `size?: number` 和 `className?: string`。
颜色通过 CSS `color` 或 `fill` 控制。
