# Protocol Validation Report (T010)

- Generated at: 2026-03-05T15:31:38.233Z
- Workspace: `D:\个人开发项目\do-what\do-what-new`
- Status summary: 5 pass / 2 warn / 0 fail

## Key Checks

| Status | Checkpoint | Details |
| --- | --- | --- |
| ✅ | Hook event compatibility + passthrough | parse success 3/3 (100.0%), passthrough=true |
| ✅ | Hook response latency (target <= 200ms) | measured latency 13ms |
| ⚠️ | EngineQuota feasibility (claude --print) | --print failed (exit 1) |
| ✅ | Core SSE end-to-end connectivity (hook runner -> /events) | SSE stream observed forwarded event |
| ⚠️ | Codex App Server event coverage | token_stream=true, plan_node=false, diff=false, approval_request=false (runtime) |
| ✅ | Codex App Server bidirectional JSONL probe | runtime probe received 70 JSON-RPC messages |
| ✅ | deny -> reroute MCP success rate (mock) | mock reroute success 19/20 (95.0%) |

## Compatibility Metrics

- Hook schema parse success rate: 100.0% (3/3)
- Hook passthrough validation: pass
- Hook latency sample: 13ms
- Codex coverage snapshot:
  - token_stream: true
  - plan_node: false
  - diff: false
  - approval_request: false
- deny -> reroute MCP mock success rate: 95.0% (19/20)

## Observed Protocol Differences

- Claude hook events currently sampled from synthetic payloads (runtime hook capture unavailable).

## Command Probe Log

### Claude

- `claude --version` -> ok=true, exit=0, duration=117ms
- `claude --print --output-format json Reply with exactly OK` -> ok=false, exit=1, duration=123ms

### Codex

- `codex --version` -> ok=true, exit=0, duration=82ms

## Raw Sample Events

### Hook Event Sample (normalized)

```json
[
  {
    "args": {
      "command": "echo test"
    },
    "hook_event_name": "PreToolUse",
    "runId": "t010-claude-8be114ff-d67d-463e-9b0f-7f960ccac62d",
    "source": "claude-hook-synthetic",
    "timestamp": "2026-03-05T15:31:16.737Z",
    "toolName": "Bash",
    "revision": 1,
    "status": "requested"
  },
  {
    "exitCode": 0,
    "hook_event_name": "PostToolUse",
    "output": "test",
    "runId": "t010-claude-8be114ff-d67d-463e-9b0f-7f960ccac62d",
    "source": "claude-hook-synthetic",
    "timestamp": "2026-03-05T15:31:16.737Z",
    "revision": 2,
    "status": "completed"
  },
  {
    "hook_event_name": "Stop",
    "runId": "t010-claude-8be114ff-d67d-463e-9b0f-7f960ccac62d",
    "source": "claude-hook-synthetic",
    "timestamp": "2026-03-05T15:31:16.737Z",
    "revision": 3,
    "status": "completed",
    "duration": 0
  }
]
```

### Codex Methods (first 30)

```json
[
  "codex/event/agent_message",
  "codex/event/agent_message_content_delta",
  "codex/event/agent_message_delta",
  "codex/event/item_completed",
  "codex/event/item_started",
  "codex/event/mcp_startup_complete",
  "codex/event/mcp_startup_update",
  "codex/event/task_complete",
  "codex/event/task_started",
  "codex/event/token_count",
  "codex/event/user_message",
  "item/agentMessage/delta",
  "item/completed",
  "item/started",
  "thread/started",
  "thread/status/changed",
  "thread/tokenUsage/updated",
  "turn/completed",
  "turn/started"
]
```

## Follow-ups

- If any row is marked ❌, create a follow-up ticket before starting E2/E3.
- If rows are ⚠️ due environment restrictions, rerun on a host with working CLI spawn/auth and refresh this report.
- If hook parse success drops below 95% on real data, update protocol schema/adapter mapping in the same PR.
