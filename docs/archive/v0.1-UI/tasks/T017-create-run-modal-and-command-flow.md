# T017 · create-run-modal-and-command-flow（Create Run Modal 与提交闭环）

**Epic:** v0.1-UI  
**分组:** Workbench  
**依赖:** T010，T013，T016  
**可并行:** 否  
**状态:** 待开始  

---

## 目标

实现 Create Run modal、参与节点选择、更多选项与 createRun command 提交闭环。

---

## 涉及文件/目录

```text
packages/app/src/components/create-run/
packages/app/src/lib/commands/
packages/app/src/stores/pending-command/
```

---

## 实现要点

- Modal 直接读取当前 workspace 的草稿。
- 提交时注入 `clientCommandId`，走统一 command dispatcher。
- 成功后仅清当前 workspace draft，不污染其它 workspace。
- 冻结态下禁用真正发 command 的提交动作。

---

## 验收标准

- [ ] Create Run modal 可完成草稿 -> 提交 -> 清理闭环
- [ ] 提交后只清当前 workspace 的 draft
- [ ] pending command 中可追踪 create run 命令
- [ ] 全局冻结态下提交按钮被禁用

---

## 风险 / 注意事项

- 表单项与真实模板字段可能存在缺口，必须以 descriptor 为准。
- create run 是后续工作台主入口，不能掺杂额外业务逻辑。
