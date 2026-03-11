# T031 · core-command-and-probe-routes（Core 命令面与 Probe 路由）

**Epic:** v0.1-UI  
**分组:** Core API  
**依赖:** T030  
**可并行:** 否  
**状态:** 已完成

---

## 目标

在 Core 侧补齐 Create Run、消息发送、审批、memory 治理、drift/gate 处置与对象级 probe 路由。

---

## 涉及文件/目录

```text
packages/core/src/server/
packages/protocol/src/
packages/core/src/state/
```

---

## 实现要点

- 提供 `/api/runs`、`/api/runs/:runId/messages`。
- 提供 `/api/approvals/:approvalId/decide`、`/api/memory/*`、`/api/nodes/:nodeId/resolve-drift`、`/api/runs/:runId/integration-gate/decide`。
- 提供 `/api/memory/:memoryId` 与 `/api/approvals/:approvalId` 等对象 probe。
- 返回结果与 ack/probe 契约对齐，便于前端进入 reconciling/desynced。

---

## 验收标准

- [x] 对象型命令均有正式路由
- [x] memory 与 approval 至少具备对象级 probe
- [x] 前端无需靠猜测对象所属 run 才能 refetch
- [x] 命令面与 query 面职责分离清晰

---

## 风险 / 注意事项

- 会同时触达多类 command/ack 流，回归面较大。
- probe 粒度如果太粗，会直接影响 desynced 自愈质量。
