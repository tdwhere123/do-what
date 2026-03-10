# T014 · workspace-sidebar（左栏工作区与 Run 摘要）

**Epic:** v0.1-UI  
**分组:** Workbench  
**依赖:** T008，T013  
**可并行:** 可与 T015 并行  
**状态:** 待开始  

---

## 目标

实现左栏 workspace tree、run list、状态 cluster，并严格执行 inactive run 只更新 summary/hot state 的规则。

---

## 涉及文件/目录

```text
packages/app/src/components/sidebar/
packages/app/src/selectors/
packages/app/src/pages/workbench/
```

---

## 实现要点

- 渲染 workspace tree、run hot summary、审批计数、健康摘要。
- 切换 run 只更新 selected id，不在左栏直接拉富投影。
- 底部状态 cluster 只读 hot state。
- 为 New Run 入口预留触发点。

---

## 验收标准

- [ ] 左栏只读 hot state summary
- [ ] inactive run 不因左栏更新而拉 timeline/inspector
- [ ] workspace 与 run 选中态清晰
- [ ] 状态 cluster 能反映 Core / Engine / Soul 健康态

---

## 风险 / 注意事项

- 真实 workspace tree 字段仍依赖 Core 新 snapshot。
- 左栏若偷读 projection，会破坏分层约束。
