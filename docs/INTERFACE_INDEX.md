# INTERFACE_INDEX.md 鈥?鎺ュ彛涓?Schema 绱㈠紩

> **鐢?Codex 缁存姢銆?* 姣忔鏂板鎴栦慨鏀规帴鍙ｃ€佷簨浠躲€丮CP Tool銆丠TTP 绔偣銆丏B 琛ㄦ椂锛屽繀椤诲悓姝ユ洿鏂版湰鏂囦欢銆?>
> 鏉冨▉瀹氫箟婧愶細`packages/protocol/src/`锛坺od schema锛夊拰鍚勫寘鐨勫疄鐜版枃浠躲€?> 鏈枃浠舵槸"鍙绱㈠紩"锛屼笉鏇夸唬婧愮爜銆?
## 鐩綍

- [Protocol 浜嬩欢绫诲瀷](#protocol-浜嬩欢绫诲瀷)
- [MCP Tools 鈥?Tools API](#mcp-tools--tools-api)
- [MCP Tools 鈥?Soul API](#mcp-tools--soul-api)
- [Core HTTP 绔偣](#core-http-绔偣)
- [SQLite 琛ㄧ粨鏋?鈥?state.db](#sqlite-琛ㄧ粨鏋?-statedb)
- [SQLite 琛ㄧ粨鏋?鈥?soul.db](#sqlite-琛ㄧ粨鏋?-souldb)
- [xstate 鐘舵€佹満](#xstate-鐘舵€佹満)
- [Policy 閰嶇疆鏍煎紡](#policy-閰嶇疆鏍煎紡)
- [Pointer 鏍煎紡瑙勮寖](#pointer-鏍煎紡瑙勮寖)
- [鍐呴儴閫氫俊鍗忚](#鍐呴儴閫氫俊鍗忚)
- [鍙樻洿璁板綍](#鍙樻洿璁板綍)

---

## Protocol 浜嬩欢绫诲瀷

> 婧愭枃浠讹細`packages/protocol/src/events/`
> 鎵€鏈変簨浠跺叡浜熀纭€瀛楁锛歚revision: number, timestamp: string(ISO8601), runId: string, source: string`

### RunLifecycleEvent
**鍒ゅ埆瀛楁锛?* `status`

| status | 瑙﹀彂鏂?| 鍏抽敭闄勫姞瀛楁 |
|--------|--------|-------------|
| `created` | Core | `workspaceId, agentId?, engineType` |
| `started` | Core | `worktreePath?` |
| `waiting_approval` | Core (ApprovalMachine) | `approvalId, toolName` |
| `completed` | Core | `duration?, artifactIds?` |
| `failed` | Core | `error: string, code?` |
| `cancelled` | Core / UI | `cancelledBy` |
| `interrupted` | Core | `reason: 'agent_stuck' \| 'core_restart' \| 'network_error'` |

> 婧愭枃浠讹細`packages/protocol/src/events/run.ts`

---

### ToolExecutionEvent
**鍒ゅ埆瀛楁锛?* `status`

| status | 瑙﹀彂鏂?| 鍏抽敭闄勫姞瀛楁 |
|--------|--------|-------------|
| `requested` | Hook Runner / Codex Adapter | `toolName: string, args: object, approvalId?, rawToolName?, hookEventName?` |
| `approved` | Policy Engine / User | `approvedBy: 'policy' \| 'user', approvalId?, input?` |
| `denied` | Policy Engine / User | `reason: string, approvalId?, resolutionStatus?` |
| `executing` | Tool Runner | `pid?` |
| `completed` | Tool Runner | `output: string, exitCode: number` |
| `failed` | Tool Runner | `error: string` |

> 婧愭枃浠讹細`packages/protocol/src/events/tool.ts`
> Codex `approval_request` 鐢?Adapter 褰掍竴鍖栦负 `ToolExecutionEvent.requested`锛涜姹傛爣璇嗗吋瀹?`requestId | id | request_id`锛屽苟浠?`approvalId` 閫忎紶銆?

---

### EngineOutputEvent
**鍒ゅ埆瀛楁锛?* `type`

| type | 瑙﹀彂鏂?| 鍏抽敭闄勫姞瀛楁 |
|------|--------|-------------|
| `token_stream` | Engine Adapter | `text: string, isComplete: boolean` |
| `plan_node` | Engine Adapter | `nodeId, title, status: 'pending\|active\|done\|failed'` |
| `diff` | Engine Adapter | `path: string, patch: string, hunks: number` |

> 婧愭枃浠讹細`packages/protocol/src/events/engine.ts`

---

### MemoryOperationEvent
**鍒ゅ埆瀛楁锛?* `operation`

| operation | 瑙﹀彂鏂?| 鍏抽敭闄勫姞瀛楁 |
|-----------|--------|-------------|
| `search` | Soul | `query, results: CueRef[], budgetUsed: number` |
| `open` | Soul | `pointer, level: 'hint\|excerpt\|full', tokensUsed: number` |
| `propose` | Soul | `proposalId, requiresCheckpoint: boolean` |
| `commit` | Soul | `proposalId, cueId, commitSha?` |

> 婧愭枃浠讹細`packages/protocol/src/events/memory.ts`

---

### SystemHealthEvent
**鍒ゅ埆瀛楁锛?* `event`

| event | 瑙﹀彂鏂?| 鍏抽敭闄勫姞瀛楁 |
|-------|--------|-------------|
| `engine_connect` | Claude / Codex Adapter | `engineType: 'claude'\|'codex', version: string` |
| `engine_disconnect` | Claude / Codex Adapter | `engineType, reason: string` |
| `circuit_break` | Engine Machine | `engineType, failureCount: number` |
| `network_status` | Core | `online: boolean` |
| `checkpoint_queue` | Soul | `projectId?, pendingCount: number` |
| `soul_mode` | Soul Compute Registry | `soul_mode: 'basic'\|'enhanced', provider?, reason?` |

> 婧愭枃浠讹細`packages/protocol/src/events/system.ts`

---

### IntegrationEvent
**鍒ゅ埆瀛楁锛?* `event`

| event | 瑙﹀彂鏂?| 鍏抽敭闄勫姞瀛楁 |
|-------|--------|-------------|
| `gate_passed` | Integrator | `workspaceId, touchedPaths?, baselineErrorCount?, afterErrorCount?` |
| `gate_failed` | Integrator | `workspaceId, touchedPaths: string[], baselineErrorCount, afterErrorCount, newDiagnostics: string[]` |
| `conflict` | Integrator | `workspaceId, touchedPaths: string[], reason: string` |
| `replay_requested` | Integrator | `workspaceId, touchedPaths: string[], affectedRunIds: string[]` |

> 婧愭枃浠讹細`packages/protocol/src/events/integration.ts`锛圱024 鏂板锛?

---

### SoulEvent
**判别字段：** `event`

| event | 触发方 | 关键附加字段 |
|-------|--------|-------------|
| `run_checkpoint` | Core / Soul | `checkpointId?, projectId?` |
| `memory_cue_accepted` | Soul Review / Checkpoint | `cueId, projectId?, proposalId?, claimDraftId?, impactLevel?, resolver?` |
| `memory_cue_rejected` | Soul Review | `proposalId, cueId?, projectId?, reason?, resolver?` |
| `context_cue_used` | Soul Retrieval | `cueId, projectId?, trigger: 'hint'\|'excerpt'\|'full'` |
| `claim_superseded` | Soul Checkpoint | `cueId, draftId, supersededByDraftId?` |
| `memory_cue_modified` | Soul | `cueId, projectId?, changedFields: string[]` |

> 源文件：`packages/protocol/src/events/soul.ts`（T031–T037 新增）

---

### AnyEvent

**用途：** 开发态 `POST /_dev/publish` 使用的聚合事件 union，覆盖 `RunLifecycleEvent`、`ToolExecutionEvent`、`EngineOutputEvent`、`MemoryOperationEvent`、`SystemHealthEvent`、`IntegrationEvent`、`SoulEvent` 七类事件。`revision` 由 Core 注入，调用方无需自行分配。
> 源文件：`packages/protocol/src/events/index.ts`

---

## MCP Tools 鈥?Tools API

> 婧愭枃浠讹細`packages/protocol/src/mcp/tools-api.ts`
> MCP Server 绔彛锛歚DOWHAT_MCP_PORT`锛堥粯璁?3848锛?

| 宸ュ叿鍚?| 榛樿绛栫暐 | 杈撳叆鍙傛暟 | 璇存槑 |
|--------|---------|---------|------|
| `tools.file_read` | allow | `path, encoding?, line_range?` | 鍙?workspace 鐧藉悕鍗曢檺鍒?|
| `tools.file_write` | ask | `path, content, create_dirs?` | 鍙楄矾寰勭櫧鍚嶅崟闄愬埗 |
| `tools.file_patch` | ask | `path, patches: Patch[]` | 澧為噺淇敼 |
| `tools.shell_exec` | ask | `command, cwd?, env?, timeout?, sandbox?` | sandbox: `'native'\|'wsl'\|'docker'` |
| `tools.git_apply` | ask | `patch, worktree_id?, message?` | 搴旂敤 patch |
| `tools.git_status` | allow | `worktree_id?` | 鍙 |
| `tools.git_diff` | allow | `ref_a?, ref_b?, paths?` | 鍙 |
| `tools.web_fetch` | ask | `url, method?, headers?, body?` | 榛樿楂樺嵄 |
| `tools.docker_run` | ask | `image, command, mounts?, env?` | 鈥?|
| `tools.wsl_exec` | ask | `command, distro?` | 鈥?|

`Patch` 绫诲瀷锛歚{ type: 'replace'\|'insert'\|'delete', lineStart: number, lineEnd?: number, content?: string }`

**Claude 鏈湴 MCP Server锛圗2锛夛細**
- `GET /tools` 鈫?杩斿洖 `{ tools: [{ name, inputSchema }] }`
- `POST /call` 鈫?璇锋眰浣?`{ name, arguments }`
- `allow` 鈫?`200` + `{ ok: true, status: 'completed', result }`
- `ask` 鈫?`202` + `{ ok: false, status: 'pending_approval', approvalId? }`
- `deny` 鈫?`403` + `{ ok: false, status: 'denied', error }`

---

## MCP Tools 鈥?Soul API

> 婧愭枃浠讹細`packages/protocol/src/mcp/soul-tools.ts`

| 宸ュ叿鍚?| 绫诲瀷 | 杈撳叆鍙傛暟 | 杩斿洖 |
|--------|------|---------|------|
| `soul.memory_search` | 只读 | `project_id, query, anchors?, limit?(默认10), tracks?, budget?(hint 路径硬上限 600), scope?, dimension?, domain_tags?` | `CueRef[], budget_used, total_found` |
| `soul.open_pointer` | 鍙 | `pointer, level: 'hint\|excerpt\|full', max_tokens?, max_lines?, with_context?` | 璇佹嵁鍐呭 + `tokensUsed, degraded?` |
| `soul.explore_graph` | 鍙 | `entity_name, track, depth?(榛樿2), limit?(榛樿20)` | `nodes: CueRef[], edges: EdgeRef[]` |
| `soul.propose_memory_update` | 鍐欐剰鍥?| `project_id, cue_draft, edge_drafts?, confidence, impact_level` | `proposal_id, requires_checkpoint, status('pending'\|'accepted'), cue_id?, commit_sha?` |
| `soul.review_memory_proposal` | 鍐欙紙闇€瀹℃壒锛?| `proposal_id, action: 'accept\|edit\|reject\|hint_only', edits?` | `cue_id?, committed: boolean, status, commit_sha?` |

**Token 棰勭畻涓婇檺锛堝崗璁眰鍐欐锛夛細**
- Hint锛歚gist + pointers` 鈮?600 tokens
- Excerpt锛氬崟娆?鈮?500 tokens
- Full锛氬崟娆?鈮?1500 tokens锛堟寜 symbol/heading 杈圭晫鎴柇锛?

**`CueRef` 绫诲瀷锛?* `{ cueId, gist, score, pointers: string[], why? }`

---

## Core HTTP 绔偣

> 婧愭枃浠讹細`packages/core/src/server/routes.ts`
> Base URL锛歚http://127.0.0.1:3847`
> 閴存潈锛氭墍鏈夌鐐癸紙闄?`/health`锛夐渶 `Authorization: Bearer <session_token>`

### 鍏紑绔偣

| 鏂规硶 | 璺緞 | 閴存潈 | 璇存槑 |
|------|------|------|------|
| `GET` | `/health` | 鏃?| 杩斿洖 `{ ok, version, uptime }` |
| `GET` | `/events` | 鉁?| SSE 浜嬩欢娴侊紙`Content-Type: text/event-stream`锛?|
| `GET` | `/state` | 鉁?| 褰撳墠 `hot_state` 瑙嗗浘锛歚{ revision, pendingApprovals, recentEvents }` |

### Run 绠＄悊

| 鏂规硶 | 璺緞 | 璇存槑 |
|------|------|------|
| `POST` | `/runs` | 鍒涘缓骞跺惎鍔?Run |
| `GET` | `/runs/:runId` | 鏌ヨ Run 鐘舵€?|
| `DELETE` | `/runs/:runId` | 鍙栨秷 Run |

### 瀹℃壒

| 鏂规硶 | 璺緞 | 璇存槑 |
|------|------|------|
| `GET` | `/approvals` | 鍒楀嚭 pending 瀹℃壒椤?|
| `POST` | `/approvals/:id/approve` | 鎵瑰噯 |
| `POST` | `/approvals/:id/deny` | 鎷掔粷 |

### Soul

| 鏂规硶 | 璺緞 | 璇存槑 |
|------|------|------|
| `GET` | `/soul/proposals` | 鍒楀嚭 pending checkpoint 鎻愭锛坄?project_id=`锛夛紝杩斿洖 `proposal_id/project_id/cue_draft/edge_drafts/status` |
| `GET` | `/soul/healing/stats` | Pointer 鑷剤闃熷垪缁熻锛氳繑鍥?`queued, completed, failed` |

### MCP 璋冪敤浠ｇ悊

| 鏂规硶 | 璺緞 | 璇存槑 |
|------|------|------|
| `POST` | `/mcp/call` | 浠?loopback + Bearer session_token锛涗唬鐞嗚皟鐢?MCP tool锛堝吋瀹?`{ tool, args }` 涓?`{ name, arguments }`锛墊

### 鍐呴儴绔偣锛堜粎 127.0.0.1锛?

| 鏂规硶 | 璺緞 | 璇存槑 |
|------|------|------|
| `POST` | `/internal/hook-event` | Hook Runner 寮傛杞彂鏍囧噯鍖?`ToolExecutionEvent`锛堜粎 loopback + Bearer token锛?|

`/internal/hook-event` 璇锋眰浣撻』閫氳繃 `ToolExecutionEventSchema` 鏍￠獙锛堟湇鍔＄浼氬厛琛?`revision: 0` 鍐嶆牎楠岋紝璋冪敤鏂规棤闇€鍒嗛厤 revision锛岀敱 EventBus 缁熶竴鍐欏洖鐪熷疄 revision锛夈€?鍝嶅簲鏍煎紡锛歚{ ok: true, revision: number }`锛堟垚鍔燂級/ `{ error: string, issues? }` + 4xx锛堝け璐ワ級銆?

### 寮€鍙戜笓鐢紙`NODE_ENV=development` 鎵嶆縺娲伙級

| 鏂规硶 | 璺緞 | 璇存槑 |
|------|------|------|
| `POST` | `/_dev/publish` | 娉ㄥ叆缁?`AnyEventSchema` 鏍￠獙鐨勫紑鍙戜簨浠跺埌 EventBus锛沗revision` 鐢辨湇鍔＄濉厖 |
| `POST` | `/_dev/start-run` | 浠呴檺 loopback + Bearer token 鐨?dev-only Run 鍏ュ彛锛氬垎閰?worktree銆佸綋 prompt 鍛戒腑 `write/create/test file` 鏃跺啓鍏ユ渶灏忔祴璇曟枃浠躲€佹墽琛?`git status --short`銆佸欢鏃惰嚜鍔?`COMPLETE`锛屽苟鍦ㄧ粓鎬佸悗瑙﹀彂 Integrator / Fast Gate / Memory Compiler |

---

## SQLite 琛ㄧ粨鏋?鈥?state.db

> 璺緞锛歚~/.do-what/state/state.db`
> 婧愭枃浠讹細`packages/core/src/db/migrations/`

| 琛ㄥ悕 | 涓婚敭 | 鍏抽敭瀛楁 | 璇存槑 |
|------|------|---------|------|
| `event_log` | `revision` | `timestamp, event_type, run_id, source, payload(JSON)` | 鍙拷鍔狅紝涓嶅彲鏀癸紱`event_type` 娲剧敓浼樺厛绾э細`eventType -> type -> event -> status`锛涚储寮曪細`(run_id, revision)`, `(event_type, revision)` |
| `runs` | `run_id` | `workspace_id, agent_id?, engine_type, status, created_at, updated_at, completed_at?, error?, metadata(JSON)?` | Run 鐢熷懡鍛ㄦ湡璁板綍锛沗metadata` 鐜版壙杞?`worktreePath/branchName/patch/touchedPaths/integrationStatus` |
| `workspaces` | `workspace_id` | `name, root_path, engine_type?, created_at, last_opened_at?` | 宸ヤ綔鍖洪厤缃?|
| `agents` | `agent_id` | `name, role?, engine_type, memory_ns, created_at, config(JSON)?` | Agent 瀹氫箟 |
| `approval_queue` | `approval_id` | `run_id(FK鈫抮uns), tool_name, args(JSON), status, created_at, resolved_at?, resolver?` | 宸ュ叿瀹℃壒闃熷垪锛涚储寮曪細`(run_id, status)` |
| `snapshots` | `snapshot_id` | `revision, created_at, payload(JSON)` | 鐘舵€佹按鍚堝揩鐓?|
| `schema_version` | `version` | `applied_at, description` | 杩佺Щ鐗堟湰璺熻釜锛坴1 鍒濆杩佺Щ锛墊
| `diagnostics_baseline` | `workspace_id` | `error_count, created_at, updated_at` | Fast Gate 澧為噺璇婃柇鍩哄噯锛坴2 杩佺Щ锛孍6 鏃舵柊澧烇級|

---

## SQLite 琛ㄧ粨鏋?鈥?soul.db

> 璺緞锛歚~/.do-what/state/soul.db`
> 婧愭枃浠讹細`packages/soul/src/db/migrations/`

| 琛ㄥ悕 | 涓婚敭 | 鍏抽敭瀛楁 | 璇存槑 |
|------|------|---------|------|
| `memory_cues` | `cue_id` | `project_id, gist, source, type?, formation_kind, dimension, focus_surface, scope, track, anchors(JSON), pointers(JSON), evidence_refs(JSON)?, snippet_excerpt?, confidence, impact_level, activation_score, retention_score, manifestation_state, retention_state, decay_profile, hit_count, last_hit_at, last_used_at, reinforcement_count, contradiction_count, superseded_by, claim_draft?, claim_confidence?, claim_gist?, claim_mode?, claim_source?, pruned, metadata(JSON)?` | 记忆线索（三轴模型 + 生命周期字段；v6 激活 dormant 字段并统一 legacy `type`） |
| `memory_cues_fts` | 鈥?| FTS5 铏氭嫙琛紙鍙€夛級 | 鍏ㄦ枃妫€绱紙gist + anchors锛夛紱涓嶅彲鐢ㄦ椂鐢?LIKE 闄嶇骇 |
| `memory_graph_edges` | `edge_id` | `source_id, target_id, relation, track, confidence, evidence` | 璁板繂鍥捐竟锛沗(source_id, target_id, relation)` 鍞竴绱㈠紩鑷?v3 鐢熸晥 |
| `evidence_index` | `evidence_id` | `cue_id, pointer, pointer_key, level, content_hash, git_commit?, repo_path?, symbol?, snippet_excerpt?, context_fingerprint?, confidence, created_at, last_accessed, access_count, embedding(BLOB), relocation_status, relocation_attempted_at, relocated_pointer` | 证据访问索引 + Evidence Capsule 元数据 + Lazy Pointer 自愈状态（v7 扩展） |
| `memory_proposals` | `proposal_id` | `project_id, cue_draft(JSON), edge_drafts(JSON), confidence, impact_level, requires_checkpoint, status, proposed_at, resolved_at, resolver` | 寰呭闃呮彁妗堬紙v3 杩佺Щ锛墊
| `projects` | `project_id` | `primary_key, secondary_key, workspace_path, fingerprint, memory_repo_path, last_active_at, bootstrapping_phase_days` | 椤圭洰鎸囩汗鏄犲皠涓?memory_repo 缁戝畾锛坴2 杩佺Щ锛墊
| `soul_budgets` | `date` | `tokens_used, dollars_used, created_at, updated_at` | 鏃ラ绠楄拷韪紙v4 杩佺Щ锛墊
| `refactor_events` | `event_id` | `project_id, commit_sha, renames(JSON)` | 閲嶆瀯浜嬩欢锛坴5 杩佺Щ锛墊
| `soul_schema_version` | `version` | `applied_at, description` | Soul 杩佺Щ鐗堟湰 |

**`impact_level` 枚举：** `working` → `consolidated` → `canon`
**`type` 枚举：** `fact` / `pattern` / `decision` / `risk`
**`relation` 枚举：** `implements` / `depends_on` / `contradicts` / `extends` / `replaces`
**User decision ledger：** `~/.do-what/state/evidence/user_decisions.jsonl`（JSONL，0600 权限）
---

## xstate 鐘舵€佹満

> 婧愭枃浠讹細`packages/core/src/machines/`
> 绫诲瀷瀹氫箟锛歚packages/protocol/src/machines/`

### RunMachine锛堟瘡涓?Run 涓€涓?actor 瀹炰緥锛?

```
idle 鈫?created 鈫?started 鈫?running 鈬?waiting_approval
                                  鈫?
                        completed | failed | cancelled | interrupted
```

**鍏抽敭 Guard锛?* `TOOL_REQUEST` 鏃惰嫢 Policy 鍒ゅ畾 `allow` 鈫?涓嶈繘鍏?`waiting_approval`锛岀洿鎺ュ仠鐣?`running`
**AgentStuckException锛?* 鍚屼竴 `toolName` 杩炵画 deny `AGENT_STUCK_THRESHOLD`锛堥粯璁?2锛夋 鈫?`INTERRUPT`

### EngineMachine锛堝叏灞€鍚勫紩鎿庝竴鍙帮級

```
disconnected 鈫?connecting 鈫?connected 鈫?degraded 鈫?circuit_open
                                鈫慱______________|锛堟仮澶嶅悗锛?
```

**鏂矾鍣ㄨЕ鍙戯細** 杩炵画瑙ｆ瀽澶辫触 >= 5 娆?鈫?`circuit_open`锛堟嫆缁濇柊 Run锛?

### ApprovalMachine锛堝叏灞€涓€鍙帮級

```
idle 鈬?waiting锛堥槦棣栧鐞嗕腑锛?
```

**瓒呮椂锛?* `after(300000)` 鈫?鑷姩 deny锛? 鍒嗛挓锛?

---

## Policy 閰嶇疆鏍煎紡

> 璺緞锛歚~/.do-what/policy.json`
> Schema 婧愭枃浠讹細`packages/protocol/src/policy/config.ts`
> 榛樿鍊硷細`packages/protocol/src/policy/defaults.ts`

```jsonc
{
  "tools.file_read":  { "default": "allow", "deny_paths": ["/etc/shadow", "~/.ssh/*"] },
  "tools.file_write": { "default": "ask",   "allow_paths": ["<workspace>/**"] },
  "tools.shell_exec": { "default": "ask",   "allow_commands": ["ls", "cat", "git status", "npm test"] },
  "tools.web_fetch":  { "default": "ask",   "allow_domains": ["github.com"] },
  "tools.git_status": { "default": "allow" },
  "tools.git_diff":   { "default": "allow" }
}
```

**`default` 鏋氫妇锛?* `allow` / `ask` / `deny`
**`<workspace>`** 鍦ㄥ尮閰嶅墠鏇挎崲涓哄綋鍓嶆椿璺?workspace 鐨勬牴璺緞銆?

### hook-policy-cache.json锛圕ore 鍐?鈫?Hook Runner 璇伙級

> 璺緞锛歚~/.do-what/run/hook-policy-cache.json`锛堟潈闄?600锛?
> Schema 婧愭枃浠讹細`packages/protocol/src/policy/hook-cache.ts`
> Core 鍐欏叆锛歚packages/core/src/policy/cache-writer.ts`锛汬ook Runner 璇诲彇锛歚packages/engines/claude/src/policy-cache.ts`

```jsonc
{
  "version": "1",
  "updatedAt": "2026-03-06T00:00:00.000Z",
  "rules": {
    // 涓?policy.json 鏍煎紡瀹屽叏鐩稿悓
    "tools.shell_exec": { "default": "ask", "allow_commands": ["git status"] }
  }
}
```

Hook Runner 鍦ㄥ惎鍔ㄦ椂鍔犺浇骞?`fs.watch` 鐩戝惉鍙樺寲锛屾枃浠舵洿鏂板悗鑷姩鐑噸杞斤紙鏃犻渶閲嶅惎 Hook Runner 杩涚▼锛夈€?

---

## Pointer 鏍煎紡瑙勮寖

> 婧愭枃浠讹細`packages/soul/src/pointer/pointer-parser.ts`

**鏍煎紡锛?* 绌烘牸鍒嗛殧鐨?`key:value` 缁勫悎锛堥『搴忔棤鍏筹級

```
git_commit:<sha>                    鐗堟湰閿氾紙蹇呴』鏈夛級
repo_path:<relative/path/to/file>   璺緞閿?
symbol:<qualifiedName>              绗﹀彿閿氾紙鍑芥暟鍚?绫诲悕/绫诲瀷鍚嶏級
snippet_hash:<sha256>               鐗囨鎸囩汗锛堝彲閫夛級
```

**绀轰緥锛?*
```
git_commit:abc1234 repo_path:src/auth/login.ts symbol:authenticate
git_commit:abc1234 repo_path:docs/design.md#heading:Architecture
```

**`pointer_key`锛?* 灏?`key:value` 瀵规寜 key 瀛楁瘝鎺掑簭鍚庢嫾鎺ュ啀 sha256锛岀敤浜?`evidence_index` 鍘婚噸銆?

---

## 鍐呴儴閫氫俊鍗忚

### Hook Runner 鈫?Core锛圚TTP POST锛?

> 绔偣锛歚POST /internal/hook-event`

```jsonc
{
  "status": "requested",
  "toolName": "tools.shell_exec",
  "rawToolName": "Bash",
  "hookEventName": "PreToolUse",
  "args": { "command": "ls" },
  "runId": "uuid",
  "source": "engine.claude.hook-runner",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

### Claude MCP Server锛圚TTP锛?

> 婧愭枃浠讹細`packages/engines/claude/src/mcp-server.ts`

| 鏂规硶 | 璺緞 | 璇存槑 |
|------|------|------|
| `GET` | `/tools` | 鍒楀嚭 Claude 渚ф敞鍐岀殑 10 涓?Tools API 宸ュ叿 |
| `POST` | `/call` | 璋冪敤宸ュ叿锛涜繑鍥?completed / pending_approval / denied |

### Codex App Server 娑堟伅鏍煎紡锛圝SONL锛屼互 T010 楠岃瘉缁撴灉涓哄噯锛?

> 婧愭枃浠讹細`packages/engines/codex/src/event-normalizer.ts`

**Codex 鈫?do-what锛坰tdout锛夛細**

| `type` | 璇存槑 |
|--------|------|
| `token_stream` | LLM token 娴?|
| `plan_node` | 璁″垝鑺傜偣鐘舵€佸彉鏇?|
| `diff` | 鏂囦欢鍙樻洿 diff |
| `approval_request` | 闇€瑕佺敤鎴?绯荤粺瀹℃壒 |
| `tool_result` | 宸ュ叿璋冪敤瀹屾垚缁撴灉 |
| `tool_failed` | 宸ュ叿璋冪敤澶辫触缁撴灉 |
| `run_complete` | Run 姝ｅ父缁撴潫 |
| `run_failed` | Run 寮傚父缁撴潫 |

**do-what 鈫?Codex锛坰tdin锛夛細**

| `type` | 璇存槑 |
|--------|------|
| `user_input` | 鐢ㄦ埛杈撳叆鎴栬拷鍔犳寚浠?|
| `approval_response` | 瀹℃壒缁撴灉锛坄requestId, approved: boolean, input?`锛墊
| `cancel` | 鍙栨秷 Run |

**鍏煎璇存槑锛?*
- `approval_request` 鐨勮姹傛爣璇嗗吋瀹?`requestId | id | request_id`
- `approval_response` 鍥炰紶鏃剁粺涓€浣跨敤 `requestId`

---

## 鍙樻洿璁板綍

> 姣忔鏂板/淇敼鎺ュ彛鍚庯紝鍦ㄦ璁板綍銆傛牸寮忥細`鏃ユ湡 路 Ticket 路 鍙樻洿璇存槑`

| 鏃ユ湡 | Ticket | 鍙樻洿 |
|------|--------|------|
| 2026-03-04 | 鈥?| 鍒濆鐗堟湰锛堣鍒掗樁娈碉紝鍩轰簬 do-what-proposal-v0.1.md锛墊
| 2026-03-05 | T001 | 瀹屾垚 monorepo 楠ㄦ灦锛坵orkspace/turbo/tsconfig 涓?8 涓寘 stub锛墊
| 2026-03-05 | T002 | 鏂板 BaseEvent銆丷unLifecycleEvent銆乀oolExecutionEvent 鐨?zod schema 涓庢祴璇晐
| 2026-03-05 | T003 | 鏂板 EngineOutput/MemoryOperation/SystemHealth 浜嬩欢涓?Tools API MCP schema锛堝惈 JSON Schema 瀵煎嚭锛墊
| 2026-03-05 | T004 | 鏂板 Soul MCP schema銆丳olicy schema/defaults銆亁state 鐘舵€佹満绫诲瀷楠ㄦ灦|
| 2026-03-05 | T005 | 瀹炵幇 Core HTTP Server锛團astify锛?27.0.0.1:3847锛夛紝`GET /health` / `GET /events`锛圫SE锛? `GET /state` / `POST /_dev/publish`锛孊earer token 閴存潈涓棿浠?|
| 2026-03-05 | T006 | 瀹炵幇 Core EventBus锛坮evision 鍗曡皟閫掑锛夈€丏atabaseWorker锛坵orker_threads锛屾壒閲忓啓鍏ワ紝MAX_QUEUE_LENGTH=1000锛孊ATCH_SIZE=5锛夈€乄orkerClient |
| 2026-03-05 | T007 | 瀹炵幇 state.db v1 杩佺Щ锛歚event_log / runs / workspaces / agents / approval_queue / snapshots / schema_version`锛學AL 妯″紡锛岃縼绉荤増鏈窡韪?|
| 2026-03-05 | T008 | 瀹炵幇 RunMachine / EngineMachine / ApprovalMachine锛坸state v5锛夛紝RunRegistry锛孉gentStuckException锛堣繛缁?deny鈮? 娆¤Е鍙?INTERRUPT锛?|
| 2026-03-05 | T009 | 瀹炵幇 PolicyEngine锛坧ath-matcher / command-matcher / domain-matcher锛夛紝`hook-policy-cache.json` 鍐欏叆锛圕ore 渚?`cache-writer.ts`锛夛紝cache schema 褰掑叆 `@do-what/protocol` |
| 2026-03-05 | T010 | 鍗忚楠岃瘉闂ㄦ帶閫氳繃锛? pass / 2 warn / 0 fail锛夛紱鈿狅笍 `claude --print` 涓嶅彲鐢紙EngineQuota 榛樿鍏抽棴锛夛紱鈿狅笍 Codex plan_node/diff/approval_request 浠呰繍琛屾椂鍙锛圗3 fixtures 宸茶鐩栵級锛涙姤鍛婅 `docs/protocol-validation-report.md` |
| 2026-03-06 | T011 | 鏂板 Core `POST /internal/hook-event`锛孋laude Hook Runner 鏍囧噯鍖?`ToolExecutionEvent` 杞彂濂戠害 |
| 2026-03-06 | T012 | 鏂板 Claude 鏈湴 MCP Server `GET /tools` / `POST /call` 绔偣涓庡鎵硅繑鍥炶涔?|
| 2026-03-06 | T013 | 鏂板 Claude contract replay fixtures 鐗堟湰鍏冧俊鎭笌鍥炴斁鍩虹嚎璇存槑 |
| 2026-03-06 | T014 | 鏂板 Codex App Server 杩涚▼绠＄悊銆丣SONL 鍙屽悜閫氶亾涓庡績璺?閲嶅惎绾︽潫璇存槑 |
| 2026-03-06 | T015 | 鏂板 Codex 浜嬩欢褰掍竴鍖栥€佸鎵规ˉ鎺ヤ笌閫傞厤鍣ㄤ簨浠舵祦璇存槑 |
| 2026-03-06 | T016 | 鏂板 Codex contract replay fixtures 涓庡洖鏀惧熀绾胯鏄?|
| 2026-03-06 | T017 | 鏂板 soul.db 鍒濆 DDL銆佺嫭绔嬭縼绉?worker/state store锛屽苟灏?soul.db 琛ㄧ粨鏋勭储寮曟洿鏂颁负涓夎酱 cue 妯″瀷 |
| 2026-03-06 | T018 | 鏂板 `soul.memory_search` 璇昏矾寰勩€侀绠楄鍓€丗TS/LIKE 闄嶇骇涓?`MemoryOperationEvent.search` 琛屼负璇存槑 |
| 2026-03-06 | T019 | 鏂板 `soul.open_pointer` / `soul.explore_graph` 璇昏矾寰勪笌 Core `/mcp/call` loopback 浠ｇ悊绾︽潫璇存槑 |
| 2026-03-07 | T020 | 鏂板 `projects` 琛ㄣ€乣project_fingerprint`銆乣memory_repo` Git 鍒濆鍖栦笌 workspace junction 璇存槑 |
| 2026-03-07 | T021 | 鏂板 `memory_proposals` 琛ㄣ€乣checkpoint_queue` 浜嬩欢涓?Core `GET /soul/proposals` 绔偣 |
| 2026-03-07 | T022 | 鏂板 `soul.review_memory_proposal` 鍐欒矾寰勩€乵emory_repo commit 璇箟涓?bootstrapping 鎺ュ彛 |
| 2026-03-07 | T023 | 鏂板 `@do-what/tools` GitOpsQueue / WorktreeManager銆丆ore Run worktree lifecycle 涓?dev-only `POST /_dev/start-run` |
| 2026-03-07 | T024 | 鏂板 `IntegrationEvent`銆乻tate.db `diagnostics_baseline` v2 杩佺Щ锛屼互鍙?DAG builder / Fast Gate / Integrator 鍚堝叆璇箟 |
| 2026-03-07 | T025 | 鏂板 `ComputeProvider` / `LocalHeuristics` / `soul_mode` 闄嶇骇浜嬩欢锛屾敮鎸佸熀浜?git diff 鐨勬湰鍦?cue 鑽夌鎻愬彇 |
| 2026-03-07 | T026 | 鏂板 `OfficialAPI` / `CustomAPI` / `DailyBudget` / `MemoryCompiler` / `CompilerTrigger`锛屽苟鎺ラ€?Run 瀹屾垚鍚庣殑鑷姩缂栬瘧閾捐矾 |
| 2026-03-07 | T027 | 鏂板 `refactor_events`銆乣evidence_index` 鑷剤瀛楁銆乣PointerRelocator` / `HealingQueue` 涓?Core `GET /soul/healing/stats` |
| 2026-03-07 | T029 | 新增 `AnyEventSchema` 聚合 union，明确 `/_dev/publish` 校验面与 `event_log.event_type` 派生优先级，并将 `/state` 文档统一为 `hot_state` 术语 |
| 2026-03-08 | T031 | 新增 `SoulEvent` 类型、`memory_cues` v6 激活字段、legacy `type` 回填与概念统一说明 |
| 2026-03-08 | T032 | 更新 `soul.memory_search` 的 ContextLens hint 预算约束与 `context_cue_used` 事件说明 |
| 2026-03-08 | T033 | 新增 `run_checkpoint` / claim checkpoint 写入门控，并补充 `memory_cue_modified` / `claim_superseded` 事件 |
| 2026-03-08 | T034 | 补充 `memory_cues` activation / retention / pruned 生命周期字段说明 |
| 2026-03-08 | T035 | 补充有界 graph recall 与 ContextLens 组装链路索引说明 |
| 2026-03-08 | T036 | 扩展 `evidence_index` 为 Evidence Capsule 索引，新增 `git_commit/repo_path/symbol/snippet_excerpt/context_fingerprint` 字段说明 |
| 2026-03-08 | T037 | 新增 user decision ledger 运行时文件索引与 Soul 决策事件落盘说明 |
---

*鏈枃浠剁敱 Codex 鍦ㄦ瘡涓?Ticket 瀹屾垚鍚庤嚜鍔ㄧ淮鎶ゃ€傚鍙戠幇涓庢簮鐮佷笉绗︼紝浠ユ簮鐮佷负鍑嗭紝骞舵洿鏂版湰鏂囦欢銆?

