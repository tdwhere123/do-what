# Protocol Validation Report (T010)

- Generated at: 2026-03-05T15:10:53.550Z
- Workspace: `D:\个人开发项目\do-what\do-what-new`
- Status summary: 4 pass / 3 warn / 0 fail

## Key Checks

| Status | Checkpoint | Details |
| --- | --- | --- |
| ✅ | Hook event compatibility + passthrough | parse success 3/3 (100.0%), passthrough=true |
| ✅ | Hook response latency (target <= 200ms) | measured latency 19ms |
| ⚠️ | EngineQuota feasibility (claude --print) | --print failed (spawn EPERM) |
| ✅ | Core SSE end-to-end connectivity (hook runner -> /events) | SSE stream observed forwarded event |
| ⚠️ | Codex App Server event coverage | token_stream=false, plan_node=false, diff=false, approval_request=false (no probe) |
| ⚠️ | Codex App Server bidirectional JSONL probe | runtime and schema fallback both unavailable |
| ✅ | deny -> reroute MCP success rate (mock) | mock reroute success 19/20 (95.0%) |

## Compatibility Metrics

- Hook schema parse success rate: 100.0% (3/3)
- Hook passthrough validation: pass
- Hook latency sample: 19ms
- Codex coverage snapshot:
  - token_stream: false
  - plan_node: false
  - diff: false
  - approval_request: false
- deny -> reroute MCP mock success rate: 95.0% (19/20)

## Observed Protocol Differences

- Claude hook events currently sampled from synthetic payloads (runtime hook capture unavailable).
- Codex runtime probe and schema fallback both failed.

## Command Probe Log

### Claude

- `claude --version` -> ok=false, exit=null, duration=2ms
- `claude --print --output-format json Reply with exactly OK` -> ok=false, exit=null, duration=0ms

### Codex

- `codex --version` -> ok=false, exit=null, duration=1ms

## Raw Sample Events

### Hook Event Sample (normalized)

```json
[
  {
    "args": {
      "command": "echo test"
    },
    "hook_event_name": "PreToolUse",
    "runId": "t010-claude-c5f04bc9-64e4-42b2-87cb-e684361986bd",
    "source": "claude-hook-synthetic",
    "timestamp": "2026-03-05T15:10:53.518Z",
    "toolName": "Bash",
    "revision": 1,
    "status": "requested"
  },
  {
    "exitCode": 0,
    "hook_event_name": "PostToolUse",
    "output": "test",
    "runId": "t010-claude-c5f04bc9-64e4-42b2-87cb-e684361986bd",
    "source": "claude-hook-synthetic",
    "timestamp": "2026-03-05T15:10:53.518Z",
    "revision": 2,
    "status": "completed"
  },
  {
    "hook_event_name": "Stop",
    "runId": "t010-claude-c5f04bc9-64e4-42b2-87cb-e684361986bd",
    "source": "claude-hook-synthetic",
    "timestamp": "2026-03-05T15:10:53.518Z",
    "revision": 3,
    "status": "completed",
    "duration": 0
  }
]
```

### Codex Methods (first 30)

```json
[]
```

## Follow-ups

- If any row is marked ❌, create a follow-up ticket before starting E2/E3.
- If rows are ⚠️ due environment restrictions, rerun on a host with working CLI spawn/auth and refresh this report.
- If hook parse success drops below 95% on real data, update protocol schema/adapter mapping in the same PR.
