文档定位：独立于 v0.1 主方案的新阶段方案。  
使用方式：不回改现有 v0.1 主文档。待 v0.1 主线按既定方案推进完成后，以本文件作为下一小阶段的施工方案。  
本版目标：不是继续把系统做大，而是把它压实、收边、补魂、保留优雅与扩展性。

---
0. 这份文档与 v0.1 的关系
这份文档不是对 do-what-proposal-v0.1.md 的替代，更不是要求当前主线停下来返工。
它回答的是：
在 v0.1 主线已经基本落地后，v0.1.x 应该如何做一次以“清理、检查、减法、收敛、补全 SOUL”为核心的小阶段修补。
因此，本方案遵守以下前提：
1. v0.1 主线继续推进，不回改原主文档。
2. v0.1.x 以收敛、修补、整洁化为主，不做大版本式推翻。
3. 本方案所有新增抽象，都必须服务于两个目标：更简洁的主干、以及更长期可用的记忆系统。
4. 凡是会明显打断当前主线的改法，一律延后，不抢在 v0.1 主线中途插入。
5. 凡是没有稳定消费者的复杂能力，一律不进入主路径。
  

---
1. 承接 v0.1 的不变项
v0.1.x 必须明确承接 v0.1 的承重墙，而不是把它们冲掉。
以下内容保持不变：
1.1 Core 仍然是唯一控制平面
- Core 仍然是本地 daemon。
- Core 仍然是唯一真相源。
- UI、Claude Code、Codex 仍然只是客户端 / 外设。
  
1.2 危险动作仍然统一收口
- 文件写入
- 命令执行
- 网络访问
- 凭证相关操作
- 长期记忆写入
  
都必须继续经过 Core 仲裁。

1.3 证据与抽象分层仍然成立
SOUL 仍然坚持：
- 模糊层负责引导与压缩
- 证据层负责回溯与审计
  
1.4 Token 预算契约仍然写死
- 冷启动注入仍然要小
- Excerpt / Full 仍然按需展开
- 超预算仍然优先降级，而不是偷塞上下文
  
1.5 接入现实仍然不变
当前 v0.1 的引擎边界保持：
- 不解析 TTY
- Claude 走 Hooks 事件协议
- Codex 走 App Server 双向协议
  
1.6 单机、本地、个人工作台的定位不变
- 单用户
- 本地优先
- Windows 为主，允许 WSL / Docker
  
1.7 Checkpoint 与审计仍然是长期记忆的门
长期记忆仍然不能悄悄写入。  
架构决策、长期偏好、长期约束，仍然要经过可追溯的接受动作。


---

2. v0.1.x 的总目标

v0.1.x 不是“继续加能力”，而是让系统完成一次小而关键的收敛。

本阶段结束后，希望系统达到这些状态：

1. 主路径更短：关键控制态不再被异步派生层拖累。
2. 状态更清楚：控制态、派生态、典藏态三者边界明确。
3. 编排更开放但不失控：激活的 CLI 引擎是可编排节点，但工作流自由度被模板边界约束。
4. SOUL 更完整：恢复为真正的长期记忆内核，而不是只有模糊摘要与证据索引。
5. 全局记忆正式入场：但要避免跨项目、跨技术域污染。
6. 图记忆恢复身份：但只做有界回忆，不做重型图系统。
7. 显影与遗忘回归：但采用有界、稳定、可自检的机制。
8. 用户证据变耐久：不再只依赖易失的会话数据库。
9. memory_repo 降格为典藏层：不再承担运行期活动状态。
10. 后续更容易改：架构能继续演化，而不是越写越挤。
  

---

3. 这一轮修订吸收红队意见的方式

红队提出的问题不是要把系统做得更保守、更臃肿，而是逼着我们把几个过粗的抽象换成更精确的抽象。

本轮修订吸收的核心不是“再加更多防御层”，而是用以下更精确的骨架替换掉之前过粗的概念：

1. 用 CoreHotState 取代“关键控制态也读异步 Projection”的想法
2. 用 Ack Overlay 取代“Projection 必须立刻追上写入”的幻想
3. 用 Focus Surface 取代粗糙的 workspace 级漂移判断
4. 用 Baseline Lock + Integration Gate 取代过于笼统的 Sync Gate
5. 用 Governance Lease 取代频繁打断式治理
6. 用 Memory Claim + Memory Slot 取代“纯自然语言长期记忆”的不可治理状态
7. 用 global-core / global-domain 取代无差别的绝对 Global
  
这些替换的目标只有一个：

让系统更优雅、更可扩展、更可自检，而不是更重。


---

4. 本阶段开头必须先做：清理、检查、冻结、体检

v0.1.x 的开头不是加新能力，而是系统性减法。  
这部分必须作为独立前置阶段存在，并按多条路线拆开执行。

4.0 实施 Phase 排序

路线 A-K 不是同时推进，而是分 4 个 Phase 依序执行：

Phase 0：清理减法（前置，1-2 周）
- 路线 A：接入层清理
- 路线 B：事件/状态减法
- 路线 K：文档/命名收边
说明：纯减法，不新增抽象，v0.1 发版后第一时间做。

Phase 1：SOUL 补全（核心，3-4 周）
- 路线 H：SOUL 概念减法与统一命名
- 第 6 章全部：三轴、MemoryEntry、Claim/Slot、ContextLens、动力学、图回忆
- 第 7.1-7.2 章：证据耐久化（EvidenceCapsule、User Ledger）
说明：SOUL 是 v0.1.x 的核心增量。不依赖 CoreHotState 或 Focus Surface，可独立推进。

Phase 2：Core 四层分离（架构收敛，2-3 周）
- 路线 C：CoreHotState 与 Projection 分离
- 路线 D：同步/异步路径硬切分
- 路线 I：存储与证据耐久化（memory_repo 降格）
- 路线 J：图回忆成本控制
说明：需改动 Core 内部结构，应在 SOUL 补全之后做。

Phase 3：编排与治理（可选增强，2 周）
- 路线 E：编排与并行减法
- 路线 F：Focus Surface + Baseline Lock + Integration Gate
- 路线 G：Governance Lease
说明：让系统更优雅的增强，v0.1 编排能力尚在建设中，不急。


---

4.1 路线 A：接入层清理

目标
清掉为了把 Claude / Codex 接进来而留下的临时代码、排障支架、调试残留。

重点检查
- 临时 adapter shim
- 一次性调试脚本
- 已经无消费者的 feature flag
- 与现行接入路径重复的桥接层
- 只为协议验证阶段存在的 fallback 分支
  
动作
- 删除无消费者的临时代码
- 把不确定是否保留的入口降为 experimental
- 给保留的接入边界写清职责说明
  
通过标准
- 主干中不再存在明显“一次性接入痕迹”
- adapter 命名与职责可单独读懂
  

---

4.2 路线 B：事件、状态与协议减法

目标
把已经跑起来的事件模型和状态流瘦下来，避免所有后续层都围绕过胖事件堆复杂度。

重点检查
- 事件类型是否过多
- 是否存在多个事件表达同一语义
- 事件字段是否过胖
- 状态迁移是否隐含太多前端侧重算逻辑
- 是否存在只有某一层看得懂的私有状态
  
动作
- 合并同义事件
- 删除无人消费字段
- 固化最小状态迁移表
- 明确哪些状态只能由 Core 判定，哪些允许 Projection 派生
  
通过标准
- 状态迁移表能单独阅读
- 事件回放不依赖 UI 自己猜测后端状态
  

---

4.3 路线 C：关键控制态与 Projection 分离

目标
避免进入“最终一致性地狱”。

v0.1.x 不采用“纯 CQRS + 一切都读 Projection”的桌面方案。  
改为四层结构：

1. EventLog：事实事件
2. CoreHotState：关键控制态
3. Projection：异步派生读模型
4. Archive / Ledger / memory_repo：耐久典藏层
  
其中：
- CoreHotState 与主路径同步更新
- Projection 只负责历史、SOUL、图、FTS、聚合视图等派生读取
- UI 的控制区不能依赖异步 Projection 决定按钮状态
  
新增机制：Ack Overlay
为避免“刚写入成功，另一个视图一时看不到”，引入极轻量的 Ack Overlay：

每次关键动作（如 Accept Memory、Approve、Reject、Pin、Supersede）成功后，Core 返回：
- ack_id
- entity_type
- entity_id
- action
- revision
- status
  
UI 读取规则：
- 控制区读 CoreHotState
- 侧边抽屉、历史区、记忆列表读 Projection + Ack Overlay
- 当 Projection 的 revision 追上 ack revision 后，overlay 自动消失
  
通过标准
- 用户点击 Approve 后，不会闪回旧状态
- 用户刚 Accept 的记忆，切到另一视图时不会短时“凭空消失”
- 关键操作必须幂等，不因重复点击导致风暴
  

---

4.4 路线 D：同步路径 / 异步路径硬切分

目标
把主路径压到最短。

同步路径只保留
- 引擎事件摄取
- 审批判定
- Run / Node 状态迁移
- CoreHotState 更新
- 最小必要持久化
- 对 UI 的关键状态响应
  
异步路径承接
- Memory Compiler
- 图边生成
- FTS / embedding 更新
- pointer 自愈
- 历史汇总与派生 Projection
- 记忆健康扫描与园丁任务
  
通过标准
- 主路径失败模式尽可能少
- 后台忙时不影响当前操作闭环
  

---

4.5 路线 E：编排与并行的减法

目标
不把系统重新绑死在某一种固定协作流上，但也不允许 DAG 无限自由扩张。

新原则
在 v0.1.x 中：
- 激活的 CLI 引擎视为可编排节点
- 工作流来自模板实例化，而不是 LLM 任意生成
  
允许的模板拓扑仅包括：
1. 线性流
2. 单层并发 + 汇聚
3. 受控 revise loop
4. 有界 fan-out / fan-in
  
不允许：
- 任意自由 DAG
- 无上限分叉
- 动态生成循环图
- 把“下一步怎么编排”完全交给模型即时发明
  
通过标准
- 系统既不被单一协作剧本绑死
- 又不会因为编排自由度过高而失控
  

---

4.6 路线 F：Focus Surface、Baseline Lock 与 Integration Gate

目标
解决并行分支的“活锁”与“粗粒度 stale 判定”问题。

问题修正
v0.1.x 不再用“整个 workspace 的 epoch 变化”来判断一个分支是否 stale。  
因为这个判定太粗，会把无害漂移也当成致命冲突。

新抽象：Focus Surface
每个 Node、每个分支、每个 Artifact，都绑定一个更精确的 Focus Surface：

- workspace_id
- package_scope
- path_globs
- symbol_scope（可选）
- artifact_kind
- baseline_fingerprint
  
系统不再问：
工作区有没有变化？

而是问：
这次运行真正关心的那一块表面，是否发生了相关变化？

新机制 1：Baseline Lock
分支启动时记录：
- Focus Surface
- 基线指纹
- 受影响路径集合
- 关键配置指纹（如适用）
  
新机制 2：Integration Gate
汇聚前进行三类漂移判定：

1. Ignore Drift
  - 变化与该分支的 Focus Surface 无交集
  - 分支保持有效
    
2. Soft-Stale
  - 变化发生在相邻目录、相关包、相关配置
  - 允许做一次轻量 rebase check
  - 不立刻报废分支
    
3. Hard-Stale
  - 命中了同一文件、同一符号、同一输出表面，或关键配置直接影响该 Surface
  - 不能直接汇聚
  - 需要重试、人工决策，或降级为串行整合
    
防活锁规则
- 单个分支最多自动 reconcile 一次
- 连续二次仍为 hard-stale，则不再后台死循环重跑
- 改为：降级分支、请求人工决策、或转串行整合
  
说明
虽然 do-what 不是 IDE，用户通常不会长时间一边后台编排一边直接改工作区，但系统仍应优雅覆盖这个边缘场景。

通过标准
- 用户偶发改动不会导致所有长分支永远 stale
- 多个 agent 改同一文件时，冲突被明确暴露，而不是静默污染
  

---

4.7 路线 G：引擎原生表面治理

目标
解决 SOUL 与引擎原生记忆 / 规则文件之间的脑裂，同时避免治理过度打断流程。

新原则
治理仍然必须存在，但从“每走一步都可能中断”改为：

Preflight Governance + Governance Lease + Checkpoint Revalidation

预飞行报告：NativeSurfaceReport
每次 Flow 启动前，生成一份原生表面报告：
- aligned
- shadowed
- conflicting
  
涉及的原生表面包括：
- Claude 的 CLAUDE.md、rules、auto memory 入口
- Codex 的 AGENTS.md、项目配置、全局配置表面
  
新机制：Governance Lease
Flow 启动时生成：
- NativeSurfaceSnapshot
- GovernanceDecision
- GovernanceLease
  
Lease 约定：
- 本次 Flow / 阶段的有效原生规则快照
- 与当前 SOUL 的冲突结论
- 当前治理决策
- 失效条件
  
运行期规则
在 Lease 有效期内：
- 非关键变动只记录 drift，不立即打断
- 关键文件若变化但不命中当前 Focus Surface，也先记录
- 只在以下节点复检：
  1. 新 Flow 启动前
  2. 关键 Checkpoint 前
  3. Integrator / 最终验收前
  4. 原生规则变化直接命中当前 Focus Surface 时
    
两种模式
- Observe Mode：默认，仅检测、导入、告警
- Managed Mode：若引擎支持隔离 profile / 包装启动 / 指定规则路径，则由 do-what 接管运行环境
  
通过标准
- 不再出现 SOUL 与原生规则互相打架却悄悄继续跑的情况
- 也不会因为细小原生表面漂移而频繁打断用户
  

---

4.8 路线 H：SOUL 概念减法与统一命名

目标
统一记忆概念，避免后面继续术语膨胀。

统一术语
- MemoryEntry
- Evidence
- scope
- domain_tags
- dimension
- edge_type
- manifestation_state
- retention_state
- Focus Surface
- Claim
- Slot
  
明确删掉的表达
- 正向记忆 / 负向记忆 两套本体
- 把图当成第三层记忆
- 无消费者的细粒度层级与标签
  
通过标准
- 后续任务拆分时，不会被术语混乱拖垮
  

---

4.9 路线 I：存储与证据耐久化

目标
解决用户证据易失、项目证据跨仓库锚点断裂问题。

新原则
证据分为两大分区：

1）项目证据分区
用于代码、文档、配置、diff、测试、验收产物。  
继续采用强锚点，但不再只依赖 commit hash。

每条长期项目证据必须带 EvidenceCapsule：
- git_commit（可选强锚点）
- repo_path
- symbol
- snippet_excerpt
- context_fingerprint
- captured_at
- source_workspace_id
  
2）用户证据分区
用于偏好、决策、纠偏、审阅意见、治理动作。  
不能只留在 SQLite 会话历史里。

必须额外落一个 append-only ledger，例如：
- ~/.do-what/evidence/user_decisions.jsonl
  
SQLite 只做索引与查询缓存，  
ledger 才是用户证据的耐久锚点。

指针失效后的处理
- 不抛硬错误打断运行
- 标记 tombstone
- 记忆降级
- 进入待修复队列
- UI / 审计层给出可解释提示
  
通过标准
- 清理本地历史后，核心用户偏好仍可追溯
- Canon 记忆不会因 Git 历史改写瞬间全部死链
  

---

4.10 路线 J：图回忆与成本控制

目标
防止图回忆变成 N+1 爆炸和 CPU 黑洞。

新规则
图回忆只做：
- 单源
- 一跳
- 有方向
- 有上限
  
具体约束：
- seed 数量上限固定
- 一跳候选数量上限固定
- 只沿允许的 edge_type 扩展
- 不做无界 BFS
- 不做默认两跳扩展
- 不把大批节点全量拉到应用层排序
  
计算策略
- 第一阶段：SQLite 层做粗筛和截断
- 第二阶段：只对 Top-K 候选做轻量 rerank
- 绝不在每次 prompt 时对数百节点做全量 activation 计算
  
通过标准
- 图回忆成本可预测
- 守护进程不会因小 prompt 进入高 CPU 状态
  

---

4.11 路线 K：文档、目录与命名收边

目标
在系统还没有彻底膨胀前，先把命名和目录对齐一遍。

动作
- 统一模块命名
- 去掉历史误导命名
- 写清 state / projection / archive / ledger 的边界
- 对齐文档与实际字段
  

---

5. 架构层正式收敛方案


---

5.1 Core 四层结构

v0.1.x 之后，Core 内部建议明确为四层：

1. EventLog：事实事件层  
2. CoreHotState：关键控制态层  
3. Projection：派生读模型层  
4. Archive / Ledger / memory_repo：典藏与耐久审计层
  
这不是为了追求“架构美观”，而是为了明确：

- 什么东西必须同步一致
- 什么东西允许最终一致
- 什么东西只负责长期典藏
  

---

5.2 控制态不属于 Projection

以下状态必须继续属于 CoreHotState：
- Run 当前状态
- Node 当前状态
- 当前审批结果
- 当前 checkpoint 状态
- 当前活跃工作流节点
- 当前治理租约状态
  
以下信息才主要来自 Projection：
- SOUL 列表与检索视图
- 历史聚合视图
- 图探索视图
- 证据索引视图
- 派生统计与健康报告
  

---

5.3 激活引擎即节点，但节点受模板约束

v0.1.x 不再把协作流写死为某一套“固定角色剧本”。  
相反：

激活的 CLI 引擎本身就是一个可编排节点。

节点只定义：
- 输入
- 输出
- Focus Surface
- 可用工具能力
- 预算
- 是否需要 checkpoint
- 是否允许并行
  
但工作流本身仍然来自模板，而不是即兴自由生成。

建议的节点模板类型
- Analyze
- Plan
- Build
- Review
- Integrate
- Govern
- Summarize / Compile Memory
  
这些只是能力模板，不绑定 конкрет某个引擎或某个角色。


---

5.4 Baseline Lock + Integration Gate 取代粗糙 Sync Gate

为避免并发汇聚阶段失控：

- 分支启动时：拿 Baseline Lock
- 汇聚前：过 Integration Gate
  
这套组合替代掉粗粒度的“全局 epoch 漂移 = stale”。

其优点：
- 允许并发
- 允许边缘场景下的人类小改动
- 允许无害漂移存在
- 只在真正相关表面发生冲突时才阻断
  

---

5.5 编排错误不会无声向后传播

任何 fan-in 汇聚前，Integration Gate 都必须做这些校验：
- 依赖分支是否全部成功
- Artifact 是否仍绑定有效基线
- 是否存在 hard-stale
- 是否存在关键配置漂移
- 是否存在可检测的基础静态错误
  
若失败：
- 分支可降级为 stale
- 允许局部重试
- 必要时强制回退为串行整合
- 绝不允许脏产物流入下一层节点
  

---

6. SOUL：从二层记忆，恢复成长期可用的记忆内核

v0.1 里已经有了两层记忆、显影路径、pointer、自愈、Working / Consolidated / Canon。  
v0.1.x 不推翻这些，而是把之前被压扁的骨架补回来。

SOUL 在 v0.1.x 中应被正式理解为：

一个具有层、域、图、动力学的长期记忆内核。

同时，为了贴近你最初的想法，还应明确两件事：

- 维度（dimension） 是记忆本身的内容维度
- 方向（direction） 主要体现在图边与回忆路径中
  
也就是说：
- 维度回答“这是什么类型的记忆”
- 方向回答“它与什么发生关联，以及如何被唤起”
  

---

6.1 SOUL 的四轴

1）Layer
- 模糊层
- 证据层
  
2）Scope
- 项目域
- 全局核心域
- 全局技术域 / 工作域
  
3）Topology
- 图连接面
- 有方向的回忆路径
  
4）Dynamics
- 显影
- 强化
- 衰减
- 降级
- 复活
  

---

6.2 记忆三轴模型与术语收敛

v0.1 的 type（fact/pattern/decision/risk）在 v0.1.x 中正式废弃。
它的内容语义被 dimension 完全接管，保留只会制造重叠。

v0.1.x 的每条 MemoryEntry 拥有三根正交轴：

1）source（来源通道：从哪条管道来的）
- compiler：Memory Compiler 自动产出
- user：用户手动创建
- seed：初始化种子记忆
- import：从引擎原生表面导入（预留）
- review：从 review / checkpoint 过程中产出（预留）

2）formation_kind（形成路径：怎么形成的）
- extracted：从代码/文档/diff 中直接提取
- explicit：用户主动声明
- inferred：从行为模式中推断归纳
- derived：从已有记忆推导或组合
- imported：从外部系统导入

3）dimension（内容维度：这条记忆是什么）
- preference：偏好
- constraint：约束
- decision：决策
- procedure：流程 / 做法
- fact：事实
- hazard：风险 / 避坑
- glossary：术语
- episode：经历摘要

三轴各管各的：
- source 决定审计溯源（谁写的）
- formation_kind 决定可信度模型（extracted 比 inferred 初始 confidence 更高）
- dimension 决定在 ContextLens 中的位置与裁剪优先级（constraint/preference 绝不砍，episode 优先砍）

旧 type 到新轴的映射表

v0.1 旧 type  --> formation_kind          --> dimension                     --> 说明
fact          --> extracted                --> fact                          --> 从代码/文档提取的客观事实
pattern       --> inferred                 --> procedure 或 episode          --> 从行为归纳的模式，视内容分到不同维度
decision      --> explicit 或 extracted    --> decision                      --> 用户做出的决策或从记录中提取
risk          --> inferred 或 extracted    --> hazard                        --> 识别出的风险

注意：旧 type 的枚举不是一对一映射。一条记忆的 formation_kind 和 dimension 是独立判定的，
不存在 type=X 就一定映射到 formation_kind=Y + dimension=Z 的关系。

方向（direction）
方向不是第四轴，而是体现在图边上的关联方式。
建议边类型至少包括：
- supports
- derives_from
- caused_by
- contradicts
- supersedes
- generalizes_to
- specializes_to
- recalls

这样，"记忆不是线性的"这个思想才真正落地。


---

6.3 统一记忆对象：MemoryEntry

所有记忆统一为 MemoryEntry。
不区分正向 / 负向两套本体。
项目记忆与全局记忆放同一张 memory_cues 表，用 scope 字段区分。

完整字段定义（DDL-ready，v0.1 实施时 schema 一步到位，行为分阶段启用）：

A. 基础标识
  - memory_id（主键）
  - project_id（可为 NULL，全局记忆不绑项目）
  - gist（短摘要，可注入上下文）
  - summary（长摘要，比 gist 更详细，可选）

B. 三轴
  - source：来源通道（compiler | user | seed | import | review）
  - formation_kind：形成路径（extracted | explicit | inferred | derived | imported）
  - dimension：内容维度（preference | constraint | decision | procedure | fact | hazard | glossary | episode）

C. 分层与作用域
  - scope：project | global-core | global-domain:xxx
  - domain_tags：JSON array，技术域/工作域标签
  - impact_level：working | consolidated | canon
  - track：追踪线索分类（可选）

D. 证据锚点
  - anchors：JSON array，实体名
  - pointers：JSON array，pointer string
  - evidence_refs：JSON array，evidence_id 引用
  - focus_surface：JSON object，FocusSurface（可选）

E. 动力学
  - activation_score：显影分数 [0,1]
  - retention_score：留存分数 [0,1]
  - manifestation_state：hidden | hint | excerpt | full-eligible
  - retention_state：working | consolidated | canon | archived | tombstoned
  - decay_profile：pinned | stable | normal | volatile | hazard
  - confidence：可信度 [0,1]

F. 生命周期
  - created_at / updated_at
  - last_used_at：最后一次被 ContextLens 选中
  - last_hit_at：最后一次被 memory_search 命中
  - hit_count / reinforcement_count / contradiction_count
  - superseded_by：被覆盖者的 memory_id

G. Claim Form（可选双形态，仅高价值规则型记忆启用）
  - claim_namespace：如 code_style、workflow、output
  - claim_key：如 frontend.react.paradigm
  - claim_value：如 functional_hooks
  - claim_scope：如 project:/frontend 或 global-domain:react
  - claim_mode：preferred | required | forbidden
  - claim_strength：[0,1]
  不是所有记忆都必须结构化。只对高价值、长期、规则型、会进入 ContextLens / Slot 的记忆启用。
  临时 cue、episode、会话摘要保持 fuzzy-only。

H. 扩展
  - metadata：JSON blob

字段启用分层（v0.1 vs v0.1.x）：
  v0.1 主路径：A + source(B) + impact_level/track(C) + anchors/pointers(D) + confidence(E) + F 全部
  v0.1 建表但 dormant：formation_kind/dimension(B) + scope/domain_tags(C) + evidence_refs/focus_surface(D) + 动力学(E) + Claim(G)
  v0.1.x 阶段：启用全部字段

其中最关键的四个 v0.1.x 字段：
- focus_surface：决定检索范围与 stale 判定
- dimension：决定 ContextLens 位置与裁剪优先级
- activation_score：决定是否显影
- retention_score：决定是否衰减淘汰
  

---

6.4 长期记忆必须拥有双形态：Fuzzy Form + Claim Form

这是 v0.1.x 对 SOUL 最关键的一次增强。

为什么需要它
如果长期记忆只有自然语言 gist，那么系统会越来越难处理：
- 记忆冲突
- 作用范围
- 项目记忆与全局记忆的优先级
- 自动裁剪与自调参
  
因此，长期高价值记忆需要双形态：

A. Fuzzy Form
用于回忆、解释、显影：
- gist
- summary
- evidence_refs
  
B. Claim Form
用于治理、优先级、冲突控制、自动裁剪：
- claim_namespace
- claim_key
- claim_value
- claim_scope
- claim_mode
- claim_strength
  
示例
gist: 本项目前端坚持函数式 React Hook 风格
claim_namespace: code_style
claim_key: frontend.react.paradigm
claim_value: functional_hooks
claim_scope: project:/frontend
claim_mode: preferred
二者在 claim_key 上直接冲突。
系统无需 LLM 才知道它们不能同时占据同一主槽位。
注意
不是所有记忆都必须结构化。
只有高价值、可复用、会进入 ContextLens 的长期规则型记忆，才补 Claim Form。
临时经历、会话摘要、草稿线索仍然可以保持模糊态。

Claim 的产生流程

Claim Form 永远不能由 Compiler 自主写入，必须经过 checkpoint 或用户确认。
理由：结构化规则一旦写入 Slot，会直接影响后续所有 ContextLens 的组装优先级，影响面大。

产生路径：
1. Memory Compiler（自动）：从高 confidence 的 decision/preference/constraint 类 cue 中
   自动尝试提取 claim_namespace + claim_key，但不直接写入 Claim Form，
   而是标记 claim_draft，进入 checkpoint 审阅队列。
2. 用户（手动）：在 Memory Drawer 中选择一条记忆，手动 "结构化为规则"，
   补填 claim_namespace / key / value / scope。
3. review_memory_proposal（审阅）：审阅 propose 时，若 action=accept 且 cue 带 claim_draft，
   确认后正式写入 Claim Form。

---
6.5 Memory Slot：长期规则不能无限并存
每个 claim_key 构成一个 Memory Slot。
组装 ContextLens 时，一个 Slot 默认只允许一个主激活记忆进入主上下文。
默认 scope 优先级（高到低）：
1. project path-scope
2. project package-scope
3. project repo-scope
4. global-domain
5. global-core

Claim 冲突解决

同一 claim_key 下出现多条 Claim 时：

跨 scope 冲突：按 scope 优先级，高 scope 胜出。

同 scope 下冲突，优先级从高到低为：
1. explicit supersedes（已有明确覆盖关系的记忆优先）
2. 人工确认（经过 checkpoint / review 的优先于未经确认的）
3. claim_strength 高者胜
4. retention_score 高者胜
5. 最近 last_used_at 胜

失败者处理：
- 不删除，降为 slot 备选（manifestation_state = hidden）
- 在 Memory Drawer 中仍可见，标记 "被覆盖"
- 用户可手动提升或恢复

冲突示例：
项目里决定用 class component，但全局偏好是 functional hooks：
- claim_key: frontend.react.paradigm
- project 级 claim_value: class_component（scope: project:/frontend）
- global 级 claim_value: functional_hooks（scope: global-domain:react）
- 结果：项目级胜出，全局级被 shadow

这样做的好处：
- 降低"潜伏冲突 + 模型和稀泥"
- 降低全局记忆污染本地项目的风险
- 让 ContextLens 更小、更稳

---
6.6 Scope：项目记忆与全局记忆补齐
项目记忆
存放：
- repo 事实
- 项目决策
- 项目约束
- 项目局部流程
- 项目特有坑点
全局记忆
v0.1.x 正式补齐，但拆成两层：
A. global-coreA. 全局核
真正跨项目稳定的工作习惯：
- 审批偏好
- 输出格式偏好
- review 风格
- diff 粒度偏好
- 与引擎交互的通用偏好
B. global-domainB. 全局域
带技术域 / 工作域约束的全局经验：
- global-domain:python
- global-domain:web-frontend
- global-domain:infra
- global-domain:review
- global-domain:testing
新规则
没有 domain 约束的全局架构经验，默认不进入代码类 ContextLens。

---
6.7 Monorepo 与 Focus Surface 检索
SOUL 检索不再默认以“整个 workspace”作为上下文。
改为：
以当前 Node 的 Focus Surface 作为第一检索上下文。
ContextLens 组装优先级：
12201. 当前 Focus Surface当前 焦点表面
12202. 当前 artifact 类型
12203. 当前 package / path domain
12204. 当前项目 repo-scope
12205. 当前 global-domain
12206. 当前 global-core
这样，在一个 Monorepo 里：
- 后端节点不会无意义地吃到前端全局经验
- 前端节点不会被 Python / Infra 经验挤占预算
建议的 domain tags
技术域
- python
- typescript
- react
- terraform
- rust
工作域
- backend
- frontend
- infra
- cli
- review
- testing

---
6.8 图记忆：图不是第三层，而是回忆路径
图负责回答：
- 这条记忆与什么相关
- 它是怎么被唤起的
- 它与哪些其他记忆形成支持、继承、覆盖、冲突、迁移关系
v0.1.x 的限制
- 只做一跳有界扩展
- 只沿允许方向扩展
- 只服务于回忆与裁剪
- 不引入重图数据库
默认回忆路径
12732. 先命中 seed
12733. 沿允许边扩一跳
12734. 对候选按 activation 做轻排序
12735. 必要时再打开证据
这比“全文检索 + 一把抓”更符合记忆宫殿与回忆触发的直觉。

---
6.9 动力学：显影与遗忘回归，但改用有界稳定版
v0.1.x 不采用无界乘法链，也不采用无限制线性加减。
动态方程必须满足：
- 可解释
- 有界
- 可调
- 不容易数值坍缩
Retention：留存分数
采用半衰期模型：
retention_base(t) =
  pinned ? 1.0 :
  max(r_min, retention_prev * 2^(-delta_t / half_life))
retention_next =
  clamp(
    retention_base
    + accept_gain
    + reuse_gain
    + evidence_gain
    - supersede_penalty
    - reject_penalty,
    0, 1
  )
Activation：显影分数
采用有界加权求和：
activation =
  clamp(
    w1 * relevance
    + w2 * scope_match
    + w3 * domain_match
    + w4 * graph_support
    + w5 * retention
    + w6 * freshness
    - w7 * budget_penalty
    - w8 * conflict_penalty,
    0, 1
  )
显影状态
- hidden
- hint
- excerpt
- full-eligible
留存状态
- working
- consolidated
- canon
- archived
- tombstoned
衰减 profile
只保留少量固定档，不做无限调参：
- pinned
- stable
- normal
- volatile
- hazard
原则
- 淡忘不等于删除
- 正向 / 负向不分本体，只分显影与衰减曲线
- pinned 只意味着难衰减，不意味着总是强显影

参数初始值（稳定默认，不做早期精调）

Retention 半衰期：
  pinned:   half_life = 无穷,  r_min = 1.0（不衰减）
  stable:   half_life = 90 天, r_min = 0.3
  normal:   half_life = 30 天, r_min = 0.1
  volatile: half_life = 7 天,  r_min = 0.05
  hazard:   half_life = 60 天, r_min = 0.2（避坑经验衰减慢于 normal）

Karma 增减量：
  accept_gain:       +0.15（用户接受 / checkpoint 通过）
  reuse_gain:        +0.05（被 ContextLens 选中并实际展开证据）
  evidence_gain:     +0.10（证据指针成功展开且被引用）
  supersede_penalty: -0.20（被新记忆覆盖）
  reject_penalty:    -0.30（用户拒绝 / checkpoint 驳回）

Activation 权重：
  w1 (relevance):       0.30（可调 0.1-0.5）
  w2 (scope_match):     0.15（可调 0.05-0.3）
  w3 (domain_match):    0.15（可调 0.05-0.3）
  w4 (graph_support):   0.10（可调 0.0-0.2）
  w5 (retention):       0.15（可调 0.05-0.3）
  w6 (freshness):       0.10（可调 0.0-0.2）
  w7 (budget_penalty):  0.05（可调 0.0-0.1）
  w8 (conflict_penalty):0.05（可调 0.0-0.1）

formation_kind 与初始 confidence 的关系：
  extracted: 0.7（直接从代码/文档提取，可信度高）
  explicit:  0.8（用户主动声明，可信度最高）
  inferred:  0.4（推断归纳，需要更多证据验证）
  derived:   0.5（从已有记忆推导，中等可信度）
  imported:  0.6（外部导入，需要确认适用性）

---
6.10 冲突与覆盖：不做后台记忆对撞机
v0.1.x 不做后台主动大规模语义冲突检测。
不建立耗 token 的“记忆对撞机”。
冲突只允许被动发现
来源只有：
13903. 用户显式指出
13904. review / checkpoint 指出Review / 检查点指出
13905. 生成 / 验收节点显式标出
13906. 治理过程中人工确认
13907. 同一 Memory Slot 中结构化 Claim 明显冲突
发现后再写入：
- contradicts
- supersedes
这样处理的好处：
- 不引入持续 token 税
- 仍然能治理高价值长期记忆

---
6.11 SOUL 的内部解释框架：Seed、Recollection、Karma、Crystallization6.11 SOUL 的内部解释框架：种子、回忆、业力、结晶
为了保留你最初关于记忆宫殿、种子、业、回忆路径的思想，
v0.1.x 建议把 SOUL 的内部解释语言统一成四个词：
Seed种子
新形成但尚不稳定的线索，先进入 working
Recollection回忆
通过 Focus Surface 与图路径被唤起，并按 hint -> excerpt -> full 显影
Karma业力
使用、接受、拒绝、覆盖、长期未用等事件，改变 retention 与 activation
Crystallization结晶
经过复用与审阅后，由 working -> consolidated -> canon
这套语言不改变工程结构，但能让 SOUL 更像一个真正有内部运动规律的记忆系统。

---
6.12 SOUL 的直接产物：ContextLens
SOUL 的直接产物不是一堆散乱 cue，
而是一份很小的 ContextLens。

ContextLens 结构：
- current_goal：当前目标
- active_constraints：来自 Claim Slot 的约束/偏好
- project_memories：项目级记忆（Hint 形态）
- global_core_memories：全局核心记忆
- global_domain_memories：全局域记忆
- risk_notes：hazard 维度记忆
- evidence_pointers：尚未展开的证据指针
- budget_used / budget_total：预算追踪

current_goal 来源策略：
- 默认：直接取 Workflow Node 的 task description / node objective（零成本）
- 可选增强：当原始目标过长（超 200 token）或信息密度过低时，
  允许 Soul 以低预算（不超过 50 token 输出）凝练一版
- 用户手写不作为默认路径

组装流程（三步）：

Step 1：填 Memory Slot（结构化约束优先）
  按 slot 优先级遍历所有活跃 Slot（scope: project path > package > repo > global-domain > global-core）
  每个 claim_key 只出一个主激活记忆（Slot Winner）
  dimension 为 constraint 或 preference 的，进入 active_constraints
  其余按 scope 分到 project/global 区
  每条消耗 gist_tokens 预算

Step 2：图扩展（一跳有界）
  从当前 Focus Surface 取 Top-K seeds（K=5）
  沿允许边类型扩展一跳（supports/derives_from/caused_by/recalls）
  每个 seed 最多扩展 3 个邻居
  按 activation_score 排序，逐条加入直到预算用完

Step 3：预算裁剪
  超预算时砍序（从先砍到后砍）：
  1. 长摘录降为 hint
  2. 低权重 graph 扩展候选
  3. global-domain 中最不相关的
  绝不砍：active_constraints 中 dimension 为 constraint 或 preference 的项

预算纪律：
- 默认总预算 600 tokens
- 证据按需展开（不在 ContextLens 组装时展开 full）
- 关键规则优先，叙述性摘要靠后

---
6.13 SOUL 的自检与自调参
v0.1.x 的自调参不应该是黑盒学习，
而应该是少量可解释旋钮的有限调优。
可调旋钮
- 半衰期 profile 参数
- activation 阈值激活阈值
- global-domain 惩罚系数
- slot 优先级权重
- graph expansion 上限图展开上限
- overlay 保留时间
- soft-stale / hard-stale 判定阈值软陈 / 硬陈定判定阈值
调参信号
- 用户接受 / 拒绝
- review 通过 / 驳回
- 记忆被显影后是否真的展开证据
- claim 是否长期被压掉
- 某类记忆是否总被 supersede
- 图扩展命中率
- 全局记忆误触发率
自检报告建议
定期生成 MemoryHealthReport：
- orphan evidence rate
- tombstone rate
- slot conflict rate
- graph expansion hit rate
- global-domain pollution rate
- evidence open success rate
- pointer healing success rate
- projection lag p95

触发条件：
1. 每日空闲期（Core idle 5 分钟后）：生成完整 MemoryHealthReport
2. 手动触发（用户点击"体检"）：生成完整 MemoryHealthReport
3. 连续 3 次 ContextLens 组装未命中任何 Slot：触发 SlotCoverageAlert
4. pointer_healing 失败率超过 30%：触发 PointerHealthAlert

消费方：
- MemoryHealthReport：UI Memory Drawer 展示 + 审计日志
- SlotCoverageAlert：UI 状态栏提示
- PointerHealthAlert：UI + 自动降低相关记忆权重

自调参闭环：
信号采集 -> 统计计算 -> 旋钮建议 -> 用户确认 -> 生效 -> 下一周期观察

永远不自动调参。只生成建议，由用户在 Memory Drawer 中确认。
理由：自动调参在数据量少时容易过拟合，且不可解释。

目标不是让系统神秘自学习，
而是让它拥有可观察、可解释、可校正的长期自演化能力。

---
7. 证据层与存储策略修补

---
7.1 项目证据分区
项目证据继续服务于：
- 代码
- 文档
- 配置
- diff差异
- 测试
- 验收产物
但 Canon 级项目证据必须带 EvidenceCapsule，不能只靠 commit hash。
这样即使工作区发生：
- rebase超车
- squash壁球
- force push原力推
- 路径搬迁
系统仍可通过 context_fingerprint + snippet_excerpt + symbol 做自愈与降级。

---
7.2 用户证据分区
用户证据不再只依赖会话数据库。
凡属于长期偏好、长期决策、明确纠偏、审批习惯、治理动作的记录，都应额外落入 append-only ledger。
建议示例：
- ~/.do-what/evidence/user_decisions.jsonl
每条记录至少包含：
- decision_id
- timestamp
- source_session
- actor
- decision_type
- summary
- linked_memory_id
- evidence_excerpt
这样即使 SQLite 历史被清理，核心用户记忆的可解释链仍然存在。

---
7.3 memory_repo 降格为典藏层
memory_repo 不再承担运行期活动状态。
它只存：
- Canon 级记忆
- 经 Checkpoint 接受的关键决策
- 长期值得典藏的证据快照
新规则
- working：只进 SQLite / Projectionworking：只进 SQLite / 投影
- 大多数 consolidated：也先只进 SQLite / ledger
- canon：才写入 memory_repo
这样做的价值：
- 减少写入噪音
- 降低 GC 压力
- 让早期规则调整不被历史垃圾提交拖住

---
7.4 Pointer 自愈与 Tombstone
pointer 自愈失败时：
- 不打断主运行
- 写 tombstone写 墓碑
- 降低该记忆的显影权重与可信度
- 进入待修复队列
Canonical memory 可以“受损但仍存在”，
而不是“找不到锚点就系统报硬错”。

---
8. 引擎原生记忆表面的吸收策略
v0.1.x 仍然坚持：
do-what SOUL 是真相源。
引擎原生记忆表面只是外部上下文表面，而不是系统真相源。

---
8.1 默认策略：读取、映射、治理，不默认双向自动同步
允许 do-what：
- 读取 Claude / Codex 的原生规则表面
- 解析出可映射的长期记忆候选
- 生成冲突报告
- 在 Managed Mode 下治理运行环境
不默认允许：
- 隐式双向自动同步
- do-what 与原生文件互相改来改去

---
8.2 Observe Mode 与 Managed Mode8.2 观察模式与管理模式
Observe Mode观察模式
- 默认
- 只读导入与检测
- 不主动接管原生表面
Managed Mode管理模式
- 若引擎与启动链允许
- 由 do-what 接管规则组合 / profile / 启动包装
- 最大程度减少脑裂
这两种模式可以并存，但系统必须清楚当前处于哪一种。

---
8.3 Governance Lease 的价值
Governance Lease 让治理成为：
- 预飞行决定
- 阶段内稳定
- 在 checkpoint / integrate 前复检在 检查点 / 整合前复检
而不是：
- 每一步都可能被频繁打断
这既保留了严肃性，也保住了 UX。

---
9. 与现有 v0.1 接口的兼容原则
v0.1.x 的修补优先兼容现有工具链与协议接口，不推翻整个调用链。
9.1 Soul 工具接口保持兼容式扩展
现有：
- memory_search
- open_pointer
- explore_graph
- propose_memory_update
- review_memory_proposal
建议新增可选参数：
- scope
- domain_tags
- focus_surface
- claim
- slot_policy
默认行为仍与 v0.1 兼容。
9.2 执行工具接口继续收口
tools.* 继续作为统一危险动作通道。
不因为引擎原生能力变强就放弃统一收口。
9.3 Projection 不是推翻 v0.1，而是被重新限定职责
Projection 保留，但只做派生读模型。
关键控制态不再寄希望于异步投影追平。

---
10. v0.1.x 明确不做的事情
1. 不做关键控制态的纯 CQRS 架构
2. 不做 LLM 自由生成任意 DAG
3. 不做后台全自动记忆大规模语义冲突检测
4. 不做默认两跳以上图扩展
5. 不做自动双向同步引擎原生记忆文件
6. 不让所有记忆都落入 memory_repo
7. 不引入重图数据库
8. 不把全局记忆做成无条件跨域生效的万能规则
9. 不让后台记忆系统抢占主路径体验
10. 不为了“理论更完整”而牺牲当前工程可落地性

---
11. 本阶段完成后的理想状态
v0.1.x 完成后，系统应达到：
1. 用户点击关键动作时，UI 不闪、不抖、不重复提交
2. 原生引擎规则与 SOUL 冲突时，会被前置暴露且可治理
3. 并行分支有 Focus Surface、有 Baseline Lock、有 Integration Gate
4. SOUL 已具备层、域、图、动力学四轴，以及维度与方向建模
5. 长期高价值记忆已具备 Claim Form 与 Slot 治理能力
6. 全局记忆正式存在，但不会污染不相关技术域
7. 用户证据不会因 SQLite 清理而失真
8. Canon 记忆不会因 Git 历史改写而立刻全部失效
9. 图回忆成本有上限，守护进程不会变成 CPU 黑洞
10. SOUL 已具备有限自检与有限自调参能力
11. 后续继续迭代时，系统不会因为早期代码过挤而难以改动

---
12. 一句话总结
v0.1.x 的任务，不是把 do-what 做得更大，而是把它从“能跑的雏形”压成“边界清楚、主干稳定、SOUL 成形、后续改得动”的系统。