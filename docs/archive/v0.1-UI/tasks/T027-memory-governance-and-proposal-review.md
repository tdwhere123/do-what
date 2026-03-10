# T027 · memory-governance-and-proposal-review（记忆治理与提案审阅）

**Epic:** v0.1-UI  
**分组:** Soul  
**依赖:** T010，T011，T026  
**可并行:** 否  
**状态:** 待开始  

---

## 目标

实现 memory proposal review、pin/edit/supersede 与全局记忆 blast radius 防护。

---

## 涉及文件/目录

```text
packages/app/src/components/soul/
packages/app/src/lib/commands/
packages/app/src/stores/pending-command/
```

---

## 实现要点

- 提案审阅支持 accept / reject / hint_only。
- memory 治理支持 pin / edit / supersede。
- 当 scope 为 `global-core | global-domain` 时，必须弹强确认并支持 `project_override`。
- memory 对象型命令统一接入 probe/refetch/desynced 自愈路径。

---

## 验收标准

- [ ] 全局记忆修改前有强确认
- [ ] `project_override` 选项可作为显式意图提交
- [ ] memory 相关 desynced 条目支持 `Retry Sync` 与 `Dismiss / Rollback`
- [ ] proposal review 与治理命令均走统一 command 生命周期

---

## 风险 / 注意事项

- 对象 probe 不足会直接影响 memory 命令的收敛质量。
- 若 blast radius 提示不充分，用户容易误操作全局记忆。
