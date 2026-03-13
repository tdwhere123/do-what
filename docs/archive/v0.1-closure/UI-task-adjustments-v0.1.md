# do-what v0.1 UI 收口任务调整报告

> 目的：根据新版 `UI-DESIGN-SPEC.md`，标记当前 closure 任务中需要同步收紧或重写的部分。  
> 这不是重新发明任务体系，而是避免原任务描述继续给实现方过大的自由发挥空间。

---

## 1. 结论

当前 closure 任务里，和 UI 直接相关的任务并不是没有，而是约束粒度不够细，尤其缺少三件事：

1. **没有把 preview 设成视觉第一真相。**
2. **没有把按钮分层写死。**
3. **没有把“展示舞台 ≠ App 本体”写成禁令。**

因此，现有任务需要保留，但要补上新的 UI 约束，否则任务即使完成，也可能继续出现“结构大概对、细节全漂、按钮乱接、图标乱用”的问题。

---

## 2. 需要重点修订的任务

## 2.1 C008 — restore-ui-to-design-baseline

### 当前问题

C008 目前的标题方向是对的，但粒度不够。它没有明确：

- 以 preview HTML + styles.css 为第一真相
- 不允许自由再设计
- 不允许把外层灰棕展示背景做进 App
- 不允许引入第三方图标
- 不允许默认把所有按钮都实现成真实功能

### 建议补充到任务正文的硬约束

1. `UI/preview-active.html`、`preview-empty.html`、`preview-settings.html` 和 `styles.css` 为视觉第一真相。
2. `UI-DESIGN-SPEC.md` 主要用于交互语义与按钮分层补充。
3. 必须剥离展示舞台和 App 本体。
4. 品牌保持 `do-what` 纯文字，不新增 logo。
5. 图标只允许使用 `UI/svg/`。
6. 必须提交“按钮分层表”和“preview 对照截图”。

### 建议改写后的验收重点

- 不是“骨架大致相似”，而是“细节明显回到 preview”。
- 不是“界面能打开”，而是“图标、配色、留白、信息密度、区域关系都对齐”。

---

## 2.2 C002 — disable-unsupported-buttons

### 当前问题

C002 的方向是对的，但现在应该升级成“交互分层任务”，而不只是“关掉几个按钮”。

### 建议补充

要求实现方把所有按钮和可点击元素分为：

- A：v0.1 必须真实可用
- B：可仅为本地 UI 交互
- C：占位，必须标 `v0.2 实现`
- D：纯展示，不应接业务语义

### 建议改名

可改为：

`C002 — classify-and-harden-ui-interactions`

如果不改标题，正文里也必须补上这个分层模型。

---

## 2.3 C012 — fix-settings-information-architecture

### 当前问题

C012 主要在修 Settings 分域重复，但现在还缺：

- 哪些 Settings 交互需要真实接线
- 哪些只是本地 UI
- 哪些应该直接标 `v0.2 实现`
- 引擎 tab 在 v0.1 中是最高优先域

### 建议补充

1. 引擎 tab 必须承担真实状态查看与重新检测。
2. API key、复杂 provider 配置在未接通时允许占位，但必须诚实。
3. Soul / 策略 / 环境 / 外观 tab 可有本地 UI 交互，但不能伪装为已持久化。
4. 每个 tab 需要一张按钮分层表。

---

## 2.4 C009 — workspace-first-flow

### 当前问题

C009 的主方向没错，但应进一步绑定 UI 空态与左栏行为。

### 建议补充

1. Empty 页面 `打开工作区` 是第一优先动作。
2. 左栏 `新建 Run` 在没有 workspace 时不得绕过约束直接创建孤立 run。
3. 新建 Run modal 可以打开，但提交前必须校验 workspace。
4. 左栏 workspace tree 是业务语义，不是装饰树。

---

## 2.5 C010 — engine-and-module-bootstrap

### 当前问题

C010 关注接线和状态诚实性，但没有把“这些状态如何体现在 UI 上”写细。

### 建议补充

1. 左下状态区和 Settings / 引擎页必须共享同一套引擎语义。
2. 至少区分：已连接、未连接、未安装、检测失败、认证失败、禁用。
3. 无引擎时 App 仍进入 Empty / Active 正常界面。
4. 发送按钮、开始 Run 按钮与引擎状态联动，不允许假提交。

---

## 2.6 C011 — single-command-startup

### 当前问题

C011 解决的是启动命令，但还可以再明确：

- 单命令启动后，UI 不能出现“虽然起了，但状态仍全 unknown”的假完成
- 启动主路径必须包含 UI 上的真实可解释反馈

### 建议补充

1. `pnpm dev` 成功后，UI 必须在合理时间内进入可解释状态。
2. Core / Engine / Soul 中任何一项失败，都要在 UI 里能看出来。
3. 单命令启动不只是脚本存在，而是要支持产品级体验。

---

## 3. 建议新增一个子任务或补充条目

如果你不想新增任务，可以把下面内容并入 C008 / C002。
如果你愿意加一个小任务，我建议新增：

### C008A — UI interaction classification and preview fidelity report

目标：

1. 列出 Active / Empty / Settings 所有按钮与点击点。
2. 标记每项属于 A/B/C/D 哪一类。
3. 给出 preview 对照截图。
4. 标记所有使用到的 SVG 来源。
5. 确认是否存在第三方图标残留。

交付物：

- 一份 UI 交互分层表
- 一份 preview vs 实现对照报告

这个任务很值，因为它能防止“表面完成 C008，实际继续乱搞”。

---

## 4. 推荐执行顺序（UI 相关部分）

如果前面基础任务做完，后续 UI 相关建议按这个顺序推进：

1. C009 workspace-first-flow
2. C010 engine-and-module-bootstrap
3. C011 single-command-startup
4. C012 fix-settings-information-architecture
5. C002 classify-and-harden-ui-interactions
6. C008 restore-ui-to-design-baseline
7. C008A preview fidelity report（若新增）

说明：

- 先把业务语义和状态诚实性立住
- 再做按钮分层
- 最后做精确 UI 还原与报告

否则容易再次出现：界面看起来更像了，但主路径依然是假的。

---

## 5. 最终建议

你可以把新版 `UI-DESIGN-SPEC.md` 直接替换掉旧文件。

然后把这份任务调整报告发给实现方，明确：

- 现有 UI 相关任务继续有效
- 但必须按新版 spec 收紧
- 完成后必须交“按钮分层表 + preview 对照截图 + SVG 来源说明”

这样它就很难再以“我理解成这样”继续自由发挥了。
