# T019 · timeline-render-merged-and-threaded（Merged / Threaded Timeline 视图）

**Epic:** v0.1-UI  
**分组:** Timeline  
**依赖:** T018  
**可并行:** 可与 T020 并行  
**状态:** 待开始  

---

## 目标

实现 timeline 的 merged / threaded 双视图、laneOrder、integration/handoff/blocked 标记渲染。

---

## 涉及文件/目录

```text
packages/app/src/components/timeline/
packages/app/src/stores/projection/
packages/app/src/stores/ui/
```

---

## 实现要点

- 在统一 timeline 数据模型上切换 merged / threaded 两种表现。
- 按 laneOrder 排列 node threads。
- 显式渲染 integration moments、handoff moments、blocked moments。
- 视图切换只影响表现层，不改 projection 真相。

---

## 验收标准

- [ ] merged 与 threaded 可在同一份数据上切换
- [ ] laneOrder 与 markers 被明确消费
- [ ] 线程视图不会反写 projection 结构
- [ ] Timeline 视图模式保存在 UI 本地态

---

## 风险 / 注意事项

- 视觉稿对 threaded 细节覆盖不足，需要在不改信息结构前提下补齐表现。
- 若把视图切换逻辑写进 store，会污染数据层。
