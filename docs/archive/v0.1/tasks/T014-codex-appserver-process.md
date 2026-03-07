# T014 · Codex 适配器：App Server 进程管理 + JSONL 双向通道

**Epic:** E3 – Codex Engine Adapter
**依赖:** T010（协议验证通过，确认 Codex App Server 可用）、T006（EventBus）
**估算改动:** ~400 行

---

## 目标

实现 `packages/engines/codex` 中的 Codex 进程管理器：启动 `codex app-server` 子进程，建立双向 JSONL 通道，处理进程生命周期（崩溃重启、优雅关闭）。

---

## 范围

**做什么：**
- `CodexProcess`：spawn `codex app-server --stdio`，用 `readline` 读取 stdout JSONL，stdin 写入 JSONL 消息
- 双向通信协议（以 T010 验证结果为准）：
  - Codex 发出：`token_stream`, `plan_node`, `diff`, `approval_request`, `run_complete`, `run_failed`
  - do-what 发送：`user_input`, `approval_response`, `cancel`
- 进程生命周期：
  - 正常退出 → 通知 RunMachine `COMPLETE`
  - 异常退出（exit code != 0）→ 通知 RunMachine `FAIL`
  - 崩溃（SIGKILL 等）→ 重启最多 N 次（默认 2），超过则 `FAIL`
- Windows Job Object 集成（通过 `packages/tools` 的进程管理工具）
- `CodexProcessManager`：管理多个 Codex 进程实例（每个 Run 一个），提供 `spawn(config)`, `send(runId, msg)`, `kill(runId)` 接口
- 心跳超时检测：若 Codex 进程 > 5 分钟无输出 → `engine_heartbeat_timeout` 事件 → EngineMachine

**不做什么：**
- 不实现事件归一化（留 T015）
- 不实现工具调用处理（留 T015）

---

## 假设

- Codex App Server 的 JSONL 消息格式以 T010 验证结果为准
- 每条 JSONL 消息有 `type` 字段（discriminator）
- 心跳：若 Codex 支持 heartbeat 消息，则使用；否则以任意输出作为心跳
- `codex` 二进制在 PATH 中可找到（由 Toolchain Manager 断言）

---

## 文件清单

```
packages/engines/codex/src/codex-process.ts
packages/engines/codex/src/codex-process-manager.ts
packages/engines/codex/src/jsonl-reader.ts          ← readline JSONL 解析器
packages/engines/codex/src/jsonl-writer.ts          ← 序列化并写 stdin
packages/engines/codex/src/heartbeat-monitor.ts
packages/engines/codex/src/index.ts
packages/engines/codex/src/__tests__/codex-process.test.ts
```

---

## 接口与 Schema 引用

- `SystemHealthEvent.engine_connect / engine_disconnect`（`@do-what/protocol`）：进程启动/退出时发布
- `EngineMachine.send('DISCONNECT')`（T008）：进程退出时触发

---

## 实现步骤

1. 创建 `src/jsonl-reader.ts`：用 `readline.createInterface(process.stdout)` 逐行解析 JSON，on error 记录原始行并继续（容错）
2. 创建 `src/jsonl-writer.ts`：序列化对象为 JSONL 并写 stdin，带写队列防止并发乱序
3. 创建 `src/heartbeat-monitor.ts`：`HeartbeatMonitor`，每次收到任意消息重置 timer，超时触发回调
4. 创建 `src/codex-process.ts`：`CodexProcess`，spawn + reader/writer + heartbeat + 生命周期事件
5. 创建 `src/codex-process-manager.ts`：`CodexProcessManager`，维护 `Map<runId, CodexProcess>`，崩溃自动重启逻辑
6. 编写测试：mock child_process（用 `mockSpawn`），验证 JSONL 读写、崩溃重启、心跳超时

---

## DoD + 验收命令

```bash
pnpm --filter @do-what/codex test -- --testNamePattern process
# 预期：codex-process 测试通过

# 与真实 Codex 进程通信（需已安装 codex CLI）
node -e "
const {CodexProcess} = require('./packages/engines/codex/dist/codex-process.js');
const p = new CodexProcess({command: 'codex', args: ['app-server','--stdio']});
p.on('message', (msg) => { console.log('Received:', JSON.stringify(msg)); process.exit(0); });
p.on('error', (e) => { console.error('Error:', e); process.exit(1); });
p.start();
p.send({type: 'user_input', content: 'echo hello'});
setTimeout(() => { console.error('Timeout'); process.exit(1); }, 10000);
"
```

---

## 风险与降级策略

- **风险：** Codex App Server 不以 `--stdio` 方式暴露 JSONL，而是 HTTP
  - **降级：** 改为 HTTP + polling（GET 事件流），在 `codex-process.ts` 中抽象通道接口（`ICodexChannel`），可切换实现
- **风险：** Codex App Server 不稳定，频繁崩溃
  - **降级：** 启用断路器（连续崩溃 3 次 → 停止重启 + EngineMachine `circuit_open`）；UI 显示"Codex 不可用"提示
