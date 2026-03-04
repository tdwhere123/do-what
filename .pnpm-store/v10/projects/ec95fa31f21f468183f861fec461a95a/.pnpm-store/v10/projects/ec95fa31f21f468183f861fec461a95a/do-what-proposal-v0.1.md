# do-what 重构完整方案（Claude Code + Codex，Core + Soul，本地单机工作台）

> 版本：v0.1（定稿）
>
> 适用范围：**单机个人**，Windows 为主开发/运行平台；允许 WSL2/Docker。
>
> 目标：把 do-what 重构为一个可普适安装的独立 AI 开发工作台：
> - **统一 UI 入口**：对话多个引擎、可并行跑任务（像工作流一样看状态）
> - **多 Agent 协作**：并行只读/隔离并行写、可交接
> - **Soul 记忆外挂**：模糊层（线索/抽象）+ 证据层（原文），渐进显影与遗忘，自我进化
> - **强权限与审计**：危险动作收口、Checkpoint 记忆审阅、可回放
>
> 约束：本版**只支持 Claude Code + Codex** 两个引擎，且明确：
> - **不解析 TTY**（不靠 ANSI/进度条/交互 prompt）
> - Claude 走 **Hooks 事件协议**；Codex 走 **App Server 双向协议**
>
> 开发模式：**单人 + AI 辅助**，AI 作为主要编码力量。
> 因此方案文档本身就是"施工图纸"——精确度直接决定 AI 的产出质量。

---

## 0. 核心概念与"Core"定义

### 0.1 Core 是什么
**Core** 是 do-what 的"控制平面/内核服务（daemon）"，是唯一真相源：
- 常驻本地后台
- 统一管理：Workspace、Run、Agent、引擎实例、工具执行、权限仲裁、审计、Soul 记忆

UI、Claude Code、Codex 都是客户端/外设：
- UI 只连 Core
- 引擎只通过 Core 进行权限与记忆交互

### 0.2 四条承重墙（不可破坏）
1) **单一真相源**：状态只在 Core（可恢复、可回放）。
2) **危险动作收口**：文件/命令/网络/凭证/记忆写入 → 必须经 Core 仲裁。
3) **证据可溯源**：结论可引用原文证据；证据不常驻上下文，只能按需拉取。
4) **Token 预算契约**：注入预算写死；超预算本地熔断并降级。

---

## 1. 产品目标、用户旅程与边界

### 1.1 目标用户旅程（首日可用）
- 用户安装 do-what → 打开 UI → 选择一个工作区（git repo 或目录）
- UI 自动检测本机 Claude Code/Codex 是否安装、是否已登录/有 API Key
- 若缺失：UI 进入"引擎设置向导"（下载/登录/填 key）
- 用户开始对话或下达任务 → Core 调度引擎与工具 → UI 展示事件流
- Soul 在后台维护：线索注入、证据按需展开、Checkpoint 审阅、记忆编译与归档

### 1.2 非目标（暂不承诺）
- 多人实时协作/云同步
- 插件市场（高供应链风险，本版只做本地可信链）

---

## 2. 技术栈与工程基础设施

### 2.1 技术栈选型（全栈 TypeScript）

本项目采用**全栈 TypeScript**，一套语言、一套构建链、一套类型系统贯穿所有模块。

**Core daemon → Node.js + TypeScript**
- Claude Code 本身是 Node.js/TypeScript 生态，Codex CLI 围绕 npm，引擎适配器与目标 CLI 天然同运行时，IPC/子进程管理无需跨语言桥接。
- SQLite：`better-sqlite3`（同步 API，WAL 模式下读写分离）。**注意：同步 API 会阻塞调用线程的 event loop。** 因此所有 DB 写入/FTS 批量更新/embedding 插入必须在 **专用 `worker_threads` 线程**中串行处理，主线程仅做轻量读查询（读连接）。具体实现：Core 启动一个 `DatabaseWorker`（`worker_threads`），通过 `MessagePort` 接收写请求并返回结果，主线程的 SSE 推送/审批队列/Event Bus 不受 DB 写操作阻塞。详见附录 K。
- Windows 进程管理：Job Object 通过 `windows-process-tree` 或 FFI 绑定实现。

> **不选 Rust 的理由**：单人维护 Rust daemon + TypeScript UI + IPC 序列化层的成本过高；AI 辅助编码对 TypeScript 支持质量显著优于 Rust。
> **不选 Go 的理由**：与前端/UI 层完全割裂；go-sqlite3 需要 CGO，Windows 编译链路折腾。

**UI → Electron + React**
- **Core 永远是独立 daemon 进程；UI 永远是客户端。** 无论 Electron 还是 Tauri，UI ↔ Core 都走 127.0.0.1 HTTP + SSE/WS 协议。Electron 的优势在于进程树管理（主进程可直接 spawn/管理 Core daemon 的生命周期），以及前后端共享 TypeScript 类型，而非"零成本通信"。
- 这个设计保证未来可以换 UI 技术栈而不伤 Core。
- 体积大对桌面开发工具不是关键问题。

**Monorepo → pnpm workspace + turborepo**

**状态机建模 → xstate v5**
- Core 内部至少有三层互相关联的状态机：Run 状态机、Engine 连接状态机、Approval 队列状态机。
- 交叉状态极多（如"Run 处于 Running，Engine 突然断连"），若不用显式状态机库建模，后期会变成无穷无尽的 if-else 补丁。
- xstate v5 的好处：状态转换图可可视化，TypeScript 类型推断保证不遗漏转换。

### 2.2 Monorepo 包结构

```
packages/
  protocol/     ← 统一事件模型 + 状态机定义 + JSON Schema + zod schema（地基）
  core/         ← 常驻 daemon（控制平面）
  app/          ← 桌面 UI（Electron + React）
  engines/
    claude/     ← Claude Code 适配器（Hooks 驱动）
    codex/      ← Codex 适配器（App Server 驱动）
  soul/         ← 记忆系统（SQLite + Git memory_repo + Compiler/园丁）
  tools/        ← 工具执行（file/git/shell/docker/wsl）
  toolchain/    ← 工具链与语言服务管理（LSP/格式化/静态检查）
```

### 2.3 通信与事件流
- UI ↔ Core：本地 HTTP(127.0.0.1) + SSE（或 WS）事件流
- Core ↔ Claude Adapter：本地 IPC（HTTP/pipe），由 hooks 触发事件回传
- Core ↔ Codex Adapter：stdio 双向（App Server JSONL/JSON-RPC）
- Core ↔ Tool Runner：本地 IPC

**所有运行时事件统一归一到 Core 的 Event Bus**，UI 只订阅渲染。

### 2.4 本地 API 安全（防本机横向攻击）

127.0.0.1 并不安全——任何本机进程都能打 Core 的端口。若不做鉴权，恶意程序可直接调用 `tools.shell_exec` 绕过 UI 审批。

**强制措施**：
- Core 每次启动生成随机 `core_session_token`（crypto random, 256-bit），写入 `~/.do-what/run/session_token`（权限 600 / Windows ACL 仅当前用户）。
- UI 启动时读取该文件，所有 HTTP 请求必须带 `Authorization: Bearer <token>`。
- Core 对缺失/错误 token 的请求一律拒绝（401），并记录审计日志。
- Hook runner 同理：启动时由 Core 注入 token 到环境变量，回传事件时携带。
- 未来可升级为命名管道（Windows Named Pipe / Unix domain socket），彻底消除端口暴露。

---

## 3. 运行时模型（多 Agent、多任务、多产物）

### 3.1 Runtime 原语
- **Workspace**：项目根目录 + 运行环境配置（本机/WSL/Docker）
- **Engine**：Claude Code 或 Codex
- **Agent**：身份（role/能力/记忆命名空间），绑定 Engine
- **Task**：可交付工作单元（输入、验收标准、产物类型）
- **Run**：Task 的一次执行（绑定 Agent+Engine+Workspace，可取消）
- **Artifact**：产物（diff/patch/文件/报告/测试结果）
- **Handoff**：交接包（状态+关键结论+证据指针+活动线索）

### 3.2 并行策略（Single Writer + Actor 模型 + 依赖规划：以"可知"为边界）

Gemini 的压测指出两个真实问题：
1) **预规划悖论**：生成式模型无法在写代码前精确预言 symbol 级变更。
2) **语义合并地狱**：Git 无冲突 ≠ 语义无断裂。

因此 do-what 的并行策略必须遵守一条更硬的"物理法则"：

> **并行只建立在"可观测、可验证"的切割上；DAG 先粗后细，允许在运行中重算。**

**单写者（Single Writer）**
- 任何时刻只有 Integrator 可以把变更落到 **主工作区主分支**。

**并行的允许范围**
- 允许并行：分析/检索/规划/生成补丁建议（Read-only 或隔离目录）。
- 允许隔离写：每个 Run 在独立 worktree / sandbox 中生成 patch（不会直接改主工作区）。

**DAG：先模块/文件级，再演进到符号级（可选）**
- **默认 DAG 粒度：模块/目录/文件级**，来自可观测事实：
  - touched_paths（从 patch/diff 自动提取）
  - language/module boundaries（例如 src/auth/*）
- **符号级依赖不作为前置要求**：仅作为"加分项"在有 LSP 可用时从实际 patch 中自动推导（post-hoc）。
- 若任务高度耦合（同一模块核心接口重构），规划器直接退回串行（不并行）。

**两阶段并行（解决'预言家悖论'）**
1) **Proposal 阶段（可并行）**：各 Run 先在隔离环境产出 patch + touched_paths；Core 据此重算/细化 DAG。
2) **Integration 阶段（串行）**：Integrator 按最终 DAG 拓扑序合入。

**Fast Gate（快速验证门）+ Replay（回放重跑）**
- 每次合入后执行 Fast Gate：LSP/类型/基础 lint（可配置）。
- 若失败：
  - 立即停止后续合入
  - 将失败原因作为"接口变更事件"广播给相关 Run
  - 触发受影响 Run 在其 worktree 中 rebase/replay 重新产出 patch（而非 Integrator 盲修死循环）

工程纪律：
- 其它 agent **不直接写主工作区文件**，只提交：patch + 交接包 + 证据指针。
- 冲突解决不自动化：出现冲突由 Integrator + UI 提示处理。

### 3.3 Handoff 契约（防 token 爆炸）
- 默认不携带原文，只携带：
  - done/todo/blockers
  - 最多 5 条关键结论（短）
  - pointers（证据指针）
  - 最多 3 条 active cues（gist）

---

## 4. 引擎接入（不黑盒、不解析 TTY）

### 4.1 Claude Code：以 Hooks 作为稳定事件接口（低延迟接管，不做长阻塞）

Gemini 的压测指出"毫秒级 hook 与人类慢反射的死锁"。do-what 的应对原则是：

> **hook 只做'闸门'，不做'等待'。凡需要人类等待的审批，不在 hook 通道里完成。**

实现策略（两条路径，按风险分级）：

**A) 允许 Claude 原生 ask（最稳，体验可镜像）**
- 对需要人类介入的高危动作，Core 在超短超时内返回 `ask`，让 Claude CLI 自己等待用户确认。
- do-what UI 同步展示"Claude 正在等待确认"的镜像状态，但不阻塞 hook。

**B) deny + reroute 到 do-what 工具（统一 UI 体验的主路径）**
- 对需要 do-what 统一仲裁的动作：PreToolUse 直接 deny，并提示 Claude 改用 do-what 的 MCP 工具（如 `tools.shell_exec` / `tools.file_write`）。
- MCP 工具调用不受 hook 超时约束，可安全地等待 UI 审批。
- **可靠性风险**：Claude Code 的行为并非完全可控，它可能反复尝试原生工具而不转向 MCP。需要在 system prompt / CLAUDE.md 中明确引导，并在 Step 1.5（协议验证）阶段实测 deny → reroute 的成功率。若成功率不稳定，应以路径 A 为主。

**deny + reroute 的强制收口约束**（防止 Claude 绕过）：
- **Policy 级硬规则**：以下原生工具类别默认 **永远 deny**，不存在 allow 路径——`Bash`（shell 执行）、`Write`/`Edit`（文件写入）、`WebFetch`（网络访问）。这些能力只能通过 do-what 的 MCP 工具通道执行。Read 类工具（`View`、`Grep`等）可按策略 allow。
- **提示工程级约束**：在 CLAUDE.md / system prompt 中写入明确指令："所有文件写入和命令执行必须通过 do-what tools（`tools.shell_exec`、`tools.file_write` 等）。不要使用原生 Bash/Write 工具。"
- **语义熔断联动**：当 Claude 在同一 Run 中连续 N 次（默认 2 次）尝试被 deny 的原生工具时，触发 `AgentStuckException`（12.3 节），中断 Run 并在 UI 提示"引擎未能切换到 do-what 工具通道"。

#### 4.1.1 Hook Runner 架构（独立进程 + 策略缓存）

hook 超时窗口（200-500ms）不是调参能解决的问题。Hook runner 必须有架构级保障：

**Hook runner 作为极轻的独立进程/脚本运行**，与 Core daemon 解耦：
- 内部维护一个**策略缓存**（从 Core 定期同步的"当前活跃规则表"）。
- Hook 收到事件后直接查本地缓存做 allow/deny 决策，只有"缓存未命中"的情况才需要同步问 Core。
- 策略缓存的同步机制：Core 启动时写一个 JSON 文件到 `~/.do-what/hook-policy-cache.json`；Core 策略变更时通知 hook runner 重载。
- 这样 hook 的响应时间基本就是"读内存 + JSON 序列化"的耗时，远低于 200ms。Core 的 Event Bus 拥塞不会影响 hook 决策速度。

Hook runner 其它行为：
- 收到事件 → 立即查缓存决策 → 同时异步转发 Core（用于审计/事件流）。
- Core 在收到异步转发后做秒级工作（检索/编译/证据展开），放入异步队列与缓存。

### 4.2 Codex：以 App Server 作为双向会话接口
- Core 启动 `codex app-server` 子进程，保持双向 JSONL 通道。
- App Server 可发起"需要用户输入/审批"的请求并暂停；do-what UI 完成审批后由 Core 回传。
- Codex 的 token 流、计划节点、工具调用、差异等统一转成 do-what 事件模型。

### 4.3 协议韧性与降级（避免"适配器一崩全宕机"）
为应对 CLI 版本快速更新与边缘 bug，do-what 的引擎适配层必须按"韧性系统"设计：
- **不解析终端输出**：只消费 hooks JSON / app-server JSON 事件。
- **Schema 容错**：对未知字段保持前向兼容（zod `.passthrough()`）；对关键字段缺失/类型错误立即降级并上报。
- **状态机 + 超时**：每个 Run 有明确状态机（Idle/Running/WaitingApproval/Failed/Completed/Interrupted），所有等待都有超时与可取消。
- **断路器（Circuit Breaker）**：适配器出现连续解析失败/死锁迹象，自动熔断该引擎并提示用户切换/升级。
- **录制回放测试（Contract Tests）**：对"典型会话事件序列"做录制与回放，用于适配器回归测试。
- **降级路径**：若协议接口不可用，允许临时降级为"一次性 Tool 运行模式（仅输出最终结果）"，但 UI 明确提示"无审批/无细粒度事件"。

### 4.4 黑盒 CLI（兜底，不作为主路线）
- 仅当某 CLI 无稳定协议/事件接口时，才降级为 Tool Runner 的一次性命令。
- 本版 Claude/Codex 不走该模式。

---

## 5. Provider / 登录 / API 配置策略（默认跟随系统 + 向导兜底）

> 立场：do-what **不原生做反代**，但要兼容外部切换工具（如 cc-switch）。

### 5.1 三种运行模式（UI 选择）
1) **跟随系统配置（默认）**
   - do-what 不写 base_url/provider，不覆盖 CLI 既有配置
   - 启动引擎进程时继承当前环境与 CLI 配置
   - UI 显示"来源信息 + 健康检查"（避免用户未配置却以为能跑）

2) **官方登录**
   - UI 引导用户完成 Claude Code/Codex 的官方登录流程
   - do-what 不管理 token，仅检测"已登录/未登录"状态

3) **官方 API Key**
   - UI 允许填写官方 Key（不提供 base_url 字段）
   - 注入策略：优先"仅对 do-what 启动的子进程注入环境变量"，避免覆盖用户全局环境
   - 兜底策略：可选写入 CLI 的本地配置文件（仅本地，不提交）

### 5.2 cc-switch 兼容性
- cc-switch 会管理 provider 端点、MCP、Prompts 等。
- do-what 的策略：
  - 不接管 provider 管理逻辑
  - 不覆盖 cc-switch 写入的字段
  - 只做必要集成：hooks + Soul MCP + 审计/权限
  - UI 明确提示"当前 Provider 由外部工具管理（只读）"

### 5.3 "未配置/未安装"的向导（必须具备）
当默认跟随系统配置时，Core 必须能检测以下缺口并引导：
- 未安装 Claude Code / Codex
- 已安装但未登录、且未检测到 API Key
- 检测到配置但健康检查失败（401/403/超时/不支持 streaming/tool-calls）

向导能力：
- 下载/安装指引（给出官方链接与系统检查）
- 一键打开登录命令与结果检测
- API Key 输入与保存（本地加密存储）

（新增）**工具链/LSP 引导**（与第 15 章 Toolchain Manager 对齐）：
- 对 portable 可托管项（ripgrep、pyright、tsserver 等）：检测并提供一键安装到 `~/.do-what/tools/`
- 对重型系统依赖（Git、Node.js、Python 等）：仅提供"复制安装命令/打开下载页/建议 devcontainer"，不做系统级安装
- 进入 workspace 时按语言/仓库特征提示"建议启用 X 的 LSP/检查器"，一键确认

---

## 6. Soul 记忆系统：模糊层（抽象）+ 证据层（原文）

### 6.1 两层记忆的角色分工
- **模糊层（Claim/Fuzzy Layer）**：短、可注入、可衰减，负责"注意力引导/避坑/偏好一致性"
- **证据层（Evidence Layer）**：长、可复现、可审计，负责"确证/引用/回溯"

### 6.2 三段式显影：Hint → Excerpt → Full
- Hint：`gist + pointers`（冷启动可注入）
- Excerpt：按需返回最相关片段（有预算上限）
- Full：按需返回完整证据单元（函数/类型/配置块/小节），必须显式申请

### 6.3 Pointer（证据指针）抗漂移规范 + 自愈机制（默认懒自愈，避免性能海啸）

**基础指针组合**
- `git_commit:<sha>`（版本锚）
- `repo_path:<path>`（路径锚）
- `symbol:<qualifiedName>`（符号锚）
- `snippet_hash:<sha256>`（片段指纹）
- 文档：`doc:<id>#heading:<path>` 或 offset span

> 行号仅作为辅助信息，不作为唯一真相。

**懒自愈（Lazy Healing）优先**
- 不在"重构 commit 发生后"立即全量修复指针。
- 仅记录一个 **Refactor Event**（含 commit sha、rename/move 统计、影响模块）。
- 当未来某次 `open_pointer` 发现失效时，才对"当前被用到的 cue"触发自愈链路。

**Pointer Relocation（按需重定位）链路**（精确→模糊逐级降级）
1) git rename 线索：利用 rename detection 将旧路径映射到新路径
2) 符号搜索：在新路径（或同模块目录）里用 LSP/Tree-sitter 搜索同名/相似符号
3) 片段近似匹配：用 snippet 指纹近邻定位候选范围
4) 语义回退：对 Canon 级记忆允许 embedding 相似检索找候选证据块（候选必须再用证据验证/Checkpoint）

性能约束：
- 自愈任务必须是低优先级、可取消、带速率限制（token/CPU/IO budget）。
- UI 可显示"当前 cue 的指针正在自愈（可取消）"。

---

## 7. 存储：单一真相 + 可重建索引

### 7.1 Git Context Repository（证据真相层）
默认位置：`~/.do-what/memory/<project_fingerprint>/memory_repo/`（每项目独立 Git 仓库）

- 目的：保持工作区纯净，同时为未来可选同步留出口（用户自行 push/pull）。
- do-what 维护 `project_fingerprint` 稳定定位项目，采用**主键 + 次键**策略：
  - **主键**：`git remote origin URL` + `default branch`（如 `github.com/user/repo` + `main`）。对于有 remote 的仓库，即使本地路径变化（从 D 盘搬到 E 盘），主键不变，记忆不会断掉。
  - **次键**：绝对路径哈希（用于无 remote 的纯本地目录，或主键冲突时的消歧）。
  - **手动映射**：UI 提供"将当前 workspace 绑定到已有 memory_repo"的操作，用于以下场景：用户重新 clone 了同一个仓库、路径变了但 remote 也变了（fork）、纯本地目录搬家等。

可选：工作区内"快捷入口"（不污染仓库历史）
- 在 workspace 下生成 `.dowhat/memory_repo/` 作为指向上述仓库的入口：
  - Windows 优先使用 junction（目录联接）。
  - 不支持则仅在 UI 提供打开路径。

**memory_repo 垃圾回收与防膨胀**
- 长期项目的 memory_repo 会累积大量 commit。防膨胀策略：
  - 定期执行 `git gc --auto`（由 Core 在空闲期触发）。
  - **Orphan branch rotation 限制条件**（防止破坏指针与审计链）：
    - **仅允许对"没有任何 pointer 引用"的历史做压缩**。压缩前扫描 `memory_cues` 表中所有 pointer 的 `git_commit:<sha>`，被引用的 commit 及其祖先链不可压缩。
    - **Canon/Consolidated 级 cue 引用的历史永不做 orphan rotation**，只做 `git gc`。
    - 仅对已归档（archived）且超过保留期限（如 90 天）的 Working 级 cue 对应的无引用历史执行压缩。
    - **压缩前必须生成 `git bundle` 存档**（写入 `~/.do-what/memory/<fingerprint>/archives/`），确保极端情况下可恢复。
  - UI 显示 memory_repo 的磁盘占用，提供手动"压缩记忆仓库"操作。
  - 不做 shallow clone（需要完整历史用于 pointer relocation 的 git rename detection）。

### 7.2 SQLite（派生索引层，可重建）
路径：`~/.do-what/state/state.db`
- `memory_cues` / `memory_graph_edges` / 可选 `evidence_index`

SQLite 并发纪律（应对 WAL/FTS 写饥饿）：
- 读写分离连接：读连接用于 Router；写连接用于 Compiler。
- 写操作分帧（chunking）：小 batch 小事务（例如每批 5 条 cue）并在批间 yield。
- 对 FTS5 更新采用异步、分批提交；重索引在低优先级队列执行。
- Router 优先使用缓存（最近热点 cue/结果），DB 忙时返回缓存结果并提示"索引更新中"。

---

## 8. 记忆生命周期：提取 → 路由 → 显影 → 遗忘（可自我进化）

> 关键风险：记忆"投毒"（幻觉/错误建议被沉淀，反复误导）。
> 本方案通过 **质量过滤层 + 分层晋升 + Checkpoint** 来抑制投毒。

### 8.1 Memory Compiler（提取器）
触发：SessionEnd / PreCompact / 主 agent 显式请求
（注：`大量 file_activity` 触发默认关闭，或需用户开启且受预算/频率控制，见 8.4）

输入：
- 最近对话的摘要/关键步骤（不是全量 token）
- Git diff（或变更摘要 + 关键片段）

输出（严格 JSON schema 校验）：
- cue drafts（gist/anchors/pointers/type/impact/confidence）
- edge drafts（source/target/track/relation/evidence）
- memory_repo markdown patch（可选）

写入策略（分层 + 质量过滤）：
- **Working（试用）**：新 cue 默认进入 Working（低权重、短 TTL、优先不给冷启动注入）。
- **Consolidated（巩固）**：满足"行为证据"后晋升（多次命中且展开证据；产物引用 pointers；用户未移除）。
- **Canon（结晶）**：架构决策等必须走 Checkpoint；建议要求证据 pointers 完整。

### 8.2 验证反馈环：增量验证（解决'脏基线'）
Gemini 指出"脏基线"问题：项目全量 typecheck/lint 本来就红。do-what 采用 **增量验证 / diff-based assertion**：
- 维护项目的 baseline 诊断快照（首次扫描或用户确认的基线）
- 每次合入后只要求：
  - **不新增**诊断错误（全局计数不增加）
  - 或在 touched context（修改行附近/修改文件）不新增错误
- 允许"改了仍然红但没变更更糟"的情况晋升（否则系统永远学不会）。

### 8.3 Retrieval Router（路由器）与预算
- 冷启动注入：Top 1–3 条 gist（仅 Hint）
- 运行期：仅当引擎显式调用工具，才展开 Excerpt/Full

### 8.4 钱包与速率保护（防后台'钱包黑洞'）
- Memory Compiler 默认只在 SessionEnd/PreCompact 触发。
- file_activity 触发默认关闭，需用户开启，并受：
  - 频率上限（例如每 10 分钟最多 1 次）
  - 预算上限（每日/每项目 token 或调用次数）
  - 本地启发式门控（格式化/小改动/机械变更直接跳过）
- 使用双轨模型：
  - 低成本模型/本地启发式做粗提炼
  - 仅对高信息熵变更使用更强模型

### 8.5 Soul 计算后端（Compute Providers）

Soul 的后台任务（编译/embedding/rerank）需要计算资源。目标：**尽量复用 Claude Code / Codex 的额度**，同时给用户留一个自定义端点入口（高级选项），以便没有会员/想走其它渠道的用户仍能启用 Soul 的后台能力。

为避免把 do-what 绑死在某一种计费/渠道上，Soul 的后台计算统一抽象为 `ComputeProvider` 插件接口（只用于 Soul），并受 8.4 的预算/频率/启发式门控约束。

#### 8.5.1 Provider 优先级与默认策略
- 默认：`LocalHeuristics`（纯本地，不花钱，永远可用的保底）
- 若用户提供官方 API Key：可用 `OfficialAPI`
- 高级：用户提供 `NewAPIEndpoint`（OpenAI/Anthropic 兼容网关），可用 `CustomAPI`
- 可选：本地模型 `LocalModel`（如 Ollama，仅当用户主动启用）
- 预留：`EngineQuota`（复用 Claude Code/Codex 额度）——见 8.5.3

> **v1 产品策略**：v1 **默认不启用 EngineQuota**。Soul 后台默认走 `LocalHeuristics`；要"完整记忆能力"需配置 `OfficialAPI` 或 `CustomAPI`。EngineQuota 作为实验性 Provider 保留接口定义，待 Step 1.5 验证可行性后再决定是否启用。避免把开发时间耗在"榨 CLI 后台额度"这种不确定赛道上。

#### 8.5.2 ComputeProvider 能力接口（概念）
- `summarize_diff(input, budget)`：对 diff/对话摘要产出 cue drafts
- `embed(texts[])`：可选，用于语义回退/相似检索
- `rerank(query, candidates[])`：可选，用于精排（低优先级）
- `cost_estimate(input)`：估算消耗（用于预算提示与熔断）

#### 8.5.3 EngineQuota：复用 Claude Code / Codex 的额度
- Claude Code：仅在具备"非交互 prompt 执行"能力时使用（例如 `--print` flag 或未来的 batch 模式）；`--print` 每次启动完整 CLI 进程，开销较大，需要评估性价比。
- Codex：优先使用 App Server 的非交互请求通道（若支持）来跑后台 summarize/embed；与主 Run 资源隔离（低优先级队列）。

> **可行性风险**：目前 Claude Code 和 Codex 都没有稳定的"第三方可调用的 batch 模式"。框架层面保留 EngineQuota 接口定义，但在 Step 1.5（协议验证）阶段明确测试这条路径。若不可行，实际默认路径为 LocalHeuristics + OfficialAPI/CustomAPI。
>
> **v1 产品策略：EngineQuota 默认不启用。** Soul 后台默认走 LocalHeuristics；要获得"完整记忆能力"（语义级总结/embedding），用户必须配置 OfficialAPI 或 CustomAPI。避免在"榨 CLI 后台额度"这种不确定赛道上消耗开发时间。EngineQuota 作为未来增强项保留接口。

工程要求：
- `EngineQuota` 必须是 **低优先级、可取消** 的后台队列；主对话 Run 永远优先。
- 触发前必须通过本地启发式筛选，避免把无价值 diff 喂给引擎。

#### 8.5.4 OfficialAPI / CustomAPI（New API）
- do-what UI 主入口仍维持"官方登录/官方 key"；
- 但在 Soul 的"高级设置"里允许用户配置一个 **仅用于 Soul 后台任务** 的 `CustomAPI`：
  - base_url
  - api_key
  - provider_type（openai-compatible / anthropic-compatible）
  - （可选）extra_headers
- 该设置不影响 Claude Code/Codex 引擎本身，仅作为 Soul 的后台计算后端。

#### 8.5.5 LocalHeuristics：永远可用的保底
- diff 熵/规模评估、格式化识别、TODO/接口变更检测
- 规则化 cue 草稿（进入 Working），等待后续行为证据晋升
- **能力天花板**：纯本地启发式只能做到"这个文件改了很多行"或"新增了一个 export"，无法提炼语义级总结（如"认证逻辑从 middleware 抽到独立 service"）。
- **UI 必须明确提示此降级**：当仅有 LocalHeuristics 可用时，显示"Soul 以基础模式运行——配置 API Key 可解锁完整记忆能力"。

#### 8.5.6 Embedding 模型与相似检索策略（用于 Pointer 语义回退与记忆检索）
- Embedding 是 Soul 的可选能力，用于 Pointer Relocation 的第 4 级语义回退、以及 memory_search 的语义排序。
- 模型选择遵循 ComputeProvider 优先级：
  - `OfficialAPI` / `CustomAPI`：调用远程 embedding 端点（如 OpenAI `text-embedding-3-small`、Anthropic 未来的 embedding API）。
  - `LocalModel`：调用本地 Ollama 的 embedding 模型（如 `nomic-embed-text`、`mxbai-embed-large`）。
  - 若无 embedding 可用：跳过语义回退层，仅用前 3 级（git rename / 符号搜索 / snippet hash）做 pointer relocation；memory_search 退化为 FTS5 全文检索。
- embedding 向量存储在 SQLite 的 `evidence_index` 表中（BLOB 列），不引入额外向量数据库。
- **相似检索算法**（按数据规模分级）：
  - **小规模（< 5,000 向量）**：启动时全量加载到内存，余弦相似度线性扫描。单项目的 cue + evidence 通常在此范围内，线性扫描延迟 < 10ms，无需索引。
  - **中规模（5,000–50,000 向量）**：使用分桶策略——按 track/module 分 partition，每次检索只扫描相关 partition。或使用 `hnswlib-node`（纯 JS HNSW 实现）构建近似最近邻索引。
  - **大规模（> 50,000 向量）**：建议用户启用 `LocalModel`（Ollama），索引使用 `hnswlib-node`，索引文件与 SQLite 共存于 `~/.do-what/state/`。
  - 索引视为可重建的派生数据——SQLite BLOB 是真相源，索引损坏时可全量重建。
- 预算约束：embedding 调用纳入 8.4 的日预算计量。

#### 8.5.7 预算与透明度（UI 必须体现）
- 每次后台编译在执行前计算 `cost_estimate`，与当日预算比对。
- UI 显示：今日 Soul 后台消耗、剩余额度、最近一次触发原因。
- 默认策略：预算不足则跳过，不允许静默超支。

### 8.6 冷启动引导策略（Bootstrapping）

新项目初期面临的问题：Working 级 cue 默认不注入冷启动；但 Consolidated 级的晋升条件（多次命中 + 产物引用 + 用户未移除）在项目早期很难满足。这可能导致前几天 Soul 形同虚设。

应对策略：
- **首周宽松模式（Bootstrapping Phase）**：项目创建后的前 N 天（默认 7 天，可配置），Working 级 cue 中 confidence >= 0.6 的可纳入冷启动注入（标注 `[trial]`），但权重低于 Consolidated。
- **用户种子记忆（Seed Memory）**：允许用户在项目初始化时手动输入 1-5 条"项目关键事实"（如技术栈、核心架构约束、命名约定），这些直接进入 Consolidated 级。
- **首次会话总结加速**：首次与引擎的完整对话结束后，Memory Compiler 执行一次"深度总结"（不受频率限制），快速填充初始记忆库。
- Bootstrapping Phase 结束后自动切换为正常晋升规则，Working 级不再注入冷启动。

---

## 9. Soul 工具接口（建议实现为 MCP Tools）

> 原则：结构化（JSON Schema）、可预算、可审计、读写分离。

### 9.1 Read-only 工具
1) `soul.memory_search({project_id, query, anchors?, limit?, tracks?, budget?})`
   - 返回 cues（仅 gist+pointers+score+why）
2) `soul.open_pointer({pointer, level: hint|excerpt|full, max_tokens/max_lines, with_context?})`
   - 展开证据（受白名单与预算控制）
3) `soul.explore_graph({entity_name, track, depth?, limit?})`

### 9.2 Write-intent + 人类审批
4) `soul.propose_memory_update({project_id, cue_draft, edge_drafts?, confidence, impact_level})`
   - 返回 proposal_id，标记 requires_checkpoint
5) `soul.review_memory_proposal({proposal_id, action: accept|edit|reject|hint_only, edits?})`
   - 落库 SQLite + commit memory_repo（如适用）

---

## 10. 执行工具接口（Tools API，实现为 MCP Tools）

> 这是引擎执行文件/命令/网络等操作的统一通道。与第 9 章 Soul 工具分开定义，但共享相同的 MCP 协议基础设施。

### 10.1 设计原则
- 所有写操作/危险操作必须经 Core 仲裁（承重墙 #2）。
- 每个工具调用产生 `ToolExecution` 事件（requested → approved/denied → executing → completed/failed）。
- 审批策略由 Core 的 Policy Engine 决定：auto-allow（白名单内）/ ask-user / deny。
- 工具输出纳入 Event Log（可回放）。

### 10.2 核心工具清单

**文件操作**
- `tools.file_read({path, encoding?, line_range?})` → 读取文件内容（受 workspace 白名单限制）
- `tools.file_write({path, content, create_dirs?})` → 写入/创建文件（需审批，受路径白名单限制）
- `tools.file_patch({path, patches[]})` → 基于 diff/patch 的增量修改（需审批）

**Shell 执行**
- `tools.shell_exec({command, cwd?, env?, timeout?, sandbox?})` → 执行 shell 命令
  - `sandbox: 'native' | 'wsl' | 'docker'`：执行环境选择
  - 默认需审批；可配置白名单命令（如 `ls`、`cat`、`git status`）auto-allow

**Git 操作**
- `tools.git_apply({patch, worktree_id?, message?})` → 应用 patch 到 worktree
- `tools.git_status({worktree_id?})` → 查询 git 状态（auto-allow）
- `tools.git_diff({ref_a?, ref_b?, paths?})` → 获取 diff（auto-allow）

**网络访问**（默认高危）
- `tools.web_fetch({url, method?, headers?, body?})` → HTTP 请求（默认需审批，可配置域名白名单）

**Docker/WSL**
- `tools.docker_run({image, command, mounts?, env?})` → 在容器中执行（需审批）
- `tools.wsl_exec({command, distro?})` → 在 WSL 中执行（需审批）

### 10.3 审批策略配置（Policy Engine）

策略存储在 `~/.do-what/policy.json`（同时作为 Hook Runner 策略缓存的数据源）：

```jsonc
{
  "tools.file_read":  { "default": "allow", "deny_paths": ["/etc/shadow", "~/.ssh/*"] },
  "tools.file_write": { "default": "ask",   "allow_paths": ["<workspace>/**"] },
  "tools.shell_exec": { "default": "ask",   "allow_commands": ["ls", "cat", "git status", "npm test"] },
  "tools.web_fetch":  { "default": "ask",   "allow_domains": ["github.com", "npmjs.org"] },
  // ...
}
```

### 10.4 与 Hook deny+reroute 的关系
当 Claude Code 的原生工具（Bash/Write/WebFetch）被 hook deny 后，Claude 应转向调用上述 `tools.*` MCP 工具。这些 MCP 工具不受 hook 超时约束，审批流程完全由 Core + UI 控制。

---

## 11. Prompt 编译与 Token 预算熔断（协议层写死）

### 11.1 预算契约
- 冷启动注入（Hint）：总计 <= X tokens（如 300–600）
- `open_pointer(excerpt)`：单次 <= Y tokens（如 200–500）
- `open_pointer(full)`：单次 <= Z tokens（如 800–1500，按 symbol/heading 单元截断）

### 11.2 本地熔断（ContextBudgetExceededError）
- 任何模块试图注入超过预算 → Core 直接抛错并强制降级
- 降级策略：
  - 多条 gist → 1 条 gist
  - excerpt → hint
  - full → excerpt（或拒绝）

---

## 12. 审计与日志：可回放但不膨胀

### 12.1 Event Log：WAL + 状态水合（Rehydration）
- 事件日志是系统事实（写磁盘，不常驻内存）。
- 每条事件有单调递增的 `revision`。
- UI 断线重连时：先拉取 State Snapshot（含所有 pending approvals 队列与当前 revision），再继续订阅事件流。

### 12.2 防膨胀策略
- 分段（按日/按大小 rotate）
- 快照（每 N 事件或每次大任务后）
- 压缩（超过窗口的细粒度 token 流可丢弃，只留高层摘要事件）

### 12.3 "语义熔断器"（防无限道歉死循环）
- Core 监控工具调用失败：
  - 同一工具 + 同参连续失败 N 次（默认 3）→ 触发 `AgentStuckException`
  - 自动中断 Run 或强制注入一段"停止重试、改用降级策略"的 override 指令

---

## 13. Core 崩溃恢复与韧性

### 13.1 崩溃恢复策略

Core 作为唯一真相源和常驻 daemon，崩溃恢复是框架级问题。

**原则：Core 重启后不尝试自动恢复正在执行的 Run，而是安全地标记中断。**

理由：引擎子进程（Claude Code/Codex）在 Core 崩溃时大概率已死（Job Object 连带终止），即使存活也失去了事件流上下文。自动恢复的复杂度远大于收益。

恢复流程：
1) Core 重启时，从最近的 **State Snapshot** + 之后的 **事件增量** 水合出所有 Run/Workspace/Agent 的最终已知状态。
2) 所有处于 `Running` / `WaitingApproval` 状态的 Run 统一标记为 `Interrupted`。
3) 清理遗留进程：扫描 `~/.do-what/run/pids/`，终止历史遗留的引擎子进程。
4) UI 重连后展示哪些 Run 被中断，用户可选择重跑。
5) 已完成的 Run 和已持久化的 Soul 记忆不受影响。

**水合逻辑必须有测试覆盖**：这是"四条承重墙"中"单一真相源"的核心保障。

### 13.2 网络中断与离线处理

do-what 依赖远程 API（Claude/Codex），网络中断不可避免。

**引擎层**：
- 正在执行的 Run：引擎 CLI 自身会报错/超时，适配器将其转为 `RunFailed` 事件，原因标记为 `network_error`。
- UI 展示"网络中断，Run 已停止"，用户可在恢复后重跑。
- 不尝试自动重连/重试整个 Run（引擎内部状态已丢失）。

**Soul 层**：
- Memory Compiler 若依赖远程 ComputeProvider（OfficialAPI/CustomAPI），离线时自动降级到 `LocalHeuristics`。
- 降级期间产出的 Working 级 cue 标注 `source: local_heuristic`，恢复网络后不自动重新编译（避免重复消耗）。
- embedding 不可用时，memory_search 退化为 FTS5。

**UI 层**：
- 状态栏始终显示网络连接状态。
- 离线时仍可浏览已有记忆、审阅历史 Run、编辑 cue。

---

## 14. Windows + WSL2/Docker：执行与隔离

### 14.1 两级执行
- Windows 本机：轻量、路径白名单、可控命令集
- WSL2/Docker：重依赖/高风险任务统一沙箱

### 14.2 worktree 并行（推荐）
- 每个 Run 分配独立 worktree + 分支（纯本地，不依赖网络）
- 并行产出 patch/建议
- 集成到主线必须由 Integrator 串行完成，并跑 Fast Gate/测试

### 14.3 Git 锁与文件锁风暴（index.lock）应对
- Core 内部实现 **GitOps 队列**：对同一 repo 的 git 写操作串行化（mutex）。
- 捕获 `.git/index.lock` / "another git process" 等错误时：指数退避 + 抖动重试。
- 合入前 patch 驻留在 Core 队列中，拿到 repo 写锁后才落盘。
- memory_repo 与 workspace repo 物理隔离（不同仓库）以降低互相锁冲突概率。

### 14.4 进程生命期与僵尸进程治理
- Windows 下用 **Job Object** 管理子进程：Core 崩溃/退出时可一键终止进程树。
- Core 启动时扫描 `~/.do-what/run/pids/`，清理历史遗留进程（taskkill /F）。
- 对 SQLite 设置 busy_timeout，并将写入集中到单写线程，降低"DB locked"。

---

## 15. 默认工具链与 LSP（强烈建议写入安装体验，但避免"重造包管理"）

Gemini 的担忧成立：如果 do-what 试图同时承担 nvm/pyenv/scoop/mason 的角色，会造成维护黑洞。这里的折中是：

- do-what **默认提供 LSP 能力**（为了证据抽取与质量门），
- 但在实现上采用 **"断言 + 可选托管（portable）"**，把重型环境治理交还给系统/容器。

### 15.1 为什么 do-what 应默认提供 LSP
- **证据层更可靠**：`open_pointer(full)` 要按 symbol（函数/类/类型）抽取正文，LSP 能稳定定位符号范围；否则只能靠行号/正则，抗漂移很差。
- **质量过滤更有效**：Memory Compiler 的"验证反馈环"需要 typecheck/lint/test 信号，LSP/语言服务器能在不跑全量测试时给出诊断。
- **多 Agent 协作更安全**：Integrator 合并前可自动跑"快速诊断"（语法/类型/导入）减少把坏补丁合入主线的概率。

### 15.2 Toolchain Manager（packages/toolchain）职责边界（避免 Scope Creep）
**A. 只做"环境断言（Assertion）"作为默认路径**
- 检测：Git/Node/Python（可选）/Docker/WSL2/LSP 是否存在与版本是否达标
- 给出"一键复制命令/打开终端/打开下载页"的修复建议
- 不主动在系统层面安装复杂运行时（如完整 Python 发行版）

**B. 仅对"可移植（portable）的二进制/纯脚本"提供可选托管**
- 可托管对象示例：ripgrep、sqlite3、jq（单文件二进制）、rust-analyzer（官方预编译）、gopls（官方发行或 go install，建议放到容器/WSL）、pyright（npm 包，通常无需本地编译）、TypeScript/tsserver（npm 包）。
- 托管目标目录：`~/.do-what/tools/`，带 checksum 与版本 pin。
- 若检测到需要本地编译/系统依赖（node-gyp、C++ Build Tools 等），自动降级为"断言模式"。

**C. 把"复杂环境"交给 Devcontainers/WSL/Docker**
- 对重型语言链（Java/jdtls、复杂 C++ 工具链等），默认建议使用 devcontainer 或 WSL2/Docker。

### 15.3 默认工具链清单（建议）
- 必装（断言）：Git、Node.js、ripgrep、Docker/WSL（按需）
- 可选（托管）：pyright、typescript/tsserver、sqlite3

### 15.4 UI 落地：Setup & Health 里的"工具链"页
- 显示：已安装/缺失/版本/来源（系统 or do-what 托管）
- 一键操作：复制安装命令、打开下载页、或启用 do-what 托管版本
- 项目检测：进入 workspace 时提示"建议启用 X 的 LSP/检查器"，一键确认

---

## 16. UI 信息架构（落地到页面与交互）

> UI 的具体实现由 Claude Code 执行。本节定义信息架构与页面职责，视觉设计遵循已有美学方案（暖色纸张质感 + Kalam 手写体 + 有机 SVG 装饰）。

### 16.1 引擎页（Setup & Health）
- 检测：Claude/Codex 是否安装、版本、可用性
- 模式选择：跟随系统配置（默认）/ 官方登录 / 官方 API Key
- 健康检查：能否请求、能否 streaming、工具调用是否可用
- 与外部工具提示：检测到 cc-switch 管理时显示"外部管理（只读）"
- 工具链状态：已安装/缺失/版本（15.4 节详述）

### 16.2 会话页（Chat + Runs）
- 多引擎切换：选择 Claude 或 Codex 作为当前引擎
- 并行工作流：一个任务拆分成多个 Run 的状态面板（节点/时间线）

### 16.3 Context Bar（隐性感知）
- 显示当前注入的 active cues（1–3 条）
- 显示证据引用状态（Hint/Excerpt/Full）
- 模式：Global/Project/Incognito

### 16.4 Memory Drawer（显性管控）
- Project Map（图谱可视化）
- Active Cues（可剔除/降权/归档）
- Git Checkpoints（memory_repo commit 历史）

### 16.5 Checkpoint Modal（审阅写入）
- 类似 Code Review：旧记忆 vs 新提案
- Accept/Edit/Reject/HintOnly

### 16.6 右侧栏导航（已有设计方案）
- 宽横栏（176px），分三组：核心（Automations）、能力（Soul / Skills）、扩展（Extensions）
- Kalam 手写字体标签 + 有机 SVG 图标
- 星星闪烁装饰（2.8s 周期，支持"减少动画"偏好）
- Settings 移至底部状态栏

### 16.7 视觉设计约束
- **手写体仅用于导航标签和装饰性文字**。所有信息密集区域（代码、diff、状态文本、数据表格、cue 内容、日志）严格使用系统字体或等宽字体。
- **动画节制**：星星闪烁等装饰动画在用户活跃操作时自动暂停，空闲时恢复。提供"减少动画"全局偏好。
- **状态栏**：始终显示引擎连接状态、Core 运行状态、网络状态、Soul 模式（完整/基础）。

---

## 17. 安全模型（本地应用仍需严谨）

- **本地 API 鉴权**：Core HTTP 端口必须 session_token 鉴权（详见 2.4 节）
- 默认 deny（危险工具、敏感路径、网络访问），审批策略由 Policy Engine 管理（详见 10.3 节）
- allowlist：workspace 路径、命令集、容器挂载
- 任何写入长期记忆（尤其架构决策）必须 checkpoint
- 外部脚本/skills/MCP server 视为不可信，必须显式启用

---

## 18. 重构落地顺序（依赖关系，而非阶段计划）

### Step 0：Protocol 包（地基，先于一切代码）
`packages/protocol` — 把事件模型、状态机定义、JSON Schema 全部写成 TypeScript 类型 + zod schema。

至少覆盖以下事件族：
- `RunLifecycle`：created / started / waiting / completed / failed / cancelled / interrupted
- `ToolExecution`：requested / approved / denied / executing / completed（含 Tools API 的全部工具）
- `EngineOutput`：token_stream / plan_node / diff
- `MemoryOperation`：search / open / propose / commit
- `SystemHealth`：engine_connect / engine_disconnect / circuit_break / network_status

同时定义：
- Tools API 的全部 MCP tool schema（第 10 章）
- Soul MCP tool schema（第 9 章）
- Policy 配置格式（10.3 节）
- 每个事件必须有：`revision`（单调递增）、`timestamp`、`runId`、`source`（产生模块）。

### Step 1：Core 骨架
- Event Bus + State Store（SQLite，含 DatabaseWorker）+ 状态机（xstate）+ 本地 HTTP server + SSE。
- **本地 API 安全层**（session_token 生成/校验，2.4 节）。
- Policy Engine 骨架（读取 policy.json，Tools API 审批判定）。
- 此时用 mock 事件验证整个事件流转链路。

### Step 1.5：协议验证（关键门控点）
实际启动 Claude Code（带 hooks）和 Codex（带 app-server），确认：
- 事件是否能收到、格式是否和文档一致
- Hook 超时行为是否符合预期
- deny → reroute 到 MCP 工具的成功率（决定路径 A vs 路径 B 的主次）
- Codex App Server 是否支持所需的所有事件类型（审批请求、工具调用详情、token 流）
- EngineQuota 是否可行（能否在主 Run 之外插入独立请求）

**若此步发现协议不符预期，需回头修改整体设计，代价最小。**

### Step 2：Claude 接入
hooks runner → Core（可审批），包含 hook runner 独立进程 + 策略缓存机制 + Tools API MCP server 注册。

### Step 3：Codex 接入
app-server 通道 → Core（可审批）+ Tools API MCP server 注册。

### Step 4：Soul read path
memory_search + open_pointer（Hint → Excerpt → Full）。

### Step 5：Soul write path
propose → checkpoint → commit（SQLite + Git）。含 Bootstrapping Phase 逻辑。

### Step 6：worktree 并行 + Integrator 集成流程

### Step 7：Compiler/园丁 + 自我进化信号

---

## 19. 附录索引（用于拆给 Claude/Codex 实现）

- A. SQLite DDL（memory_cues / memory_graph_edges / evidence_index）
- B. Pointer 规范化与 pointer_key 生成规则
- C. do-what 统一事件模型（Run/Tool/Approval/Memory/Git）JSON Schema
- D. Soul MCP tools 的 JSON Schema（5 个工具）
- E. Evidence Extractor：symbol/heading 抽取（Tree-sitter/LSP/markdown parser）
- F. Prompt Compiler：预算与降级策略
- G. Event Log：分段/快照/压缩策略
- H. ComputeProvider 接口定义与 Provider 实现规格
- I. Hook Runner 策略缓存 JSON Schema 与同步协议
- J. 状态机定义（xstate machine configs：RunMachine / EngineMachine / ApprovalMachine）
- K. DatabaseWorker 实现规格（worker_threads 架构、MessagePort 协议、读写分离连接管理）
- L. 执行工具（Tools API）完整 MCP Schema（shell_exec / file_read / file_write / file_patch / git_apply / git_status / git_diff / web_fetch / docker_run / wsl_exec）+ 审批策略配置格式
- M. Core 本地 API 安全规格（session_token 生成/分发/校验、endpoint 列表、UI 水合 endpoint、SSE 订阅鉴权）
- N. memory_repo 压缩/GC 规则（pointer 引用扫描算法、bundle 存档流程、orphan rotation 执行条件）

（当你确认字段/错误码/边界条件后，可把 A–N 展开为"可直接落地编码"的规格。）
