# C010 - 重建 Settings 信息架构

**优先级：** P0  
**依赖：** C009  
**涉及范围：**

- `packages/app/src/pages/settings/`
- `packages/app/src/stores/`
- `UI/preview-settings.html`
- `UI/UI-DESIGN-SPEC.md`
- 如需设置快照字段调整：`packages/core/src/server/`、`packages/protocol/src/`、`docs/INTERFACE_INDEX.md`

---

## 背景

Settings 页面当前最容易出现两类问题：

1. 多个 tab 切换后内容几乎一样
2. 引擎页没有承担真实状态查看与重新检测职责

在 Active / Workbench 回正之后，Settings 必须成为真正可理解的配置中心。

---

## 目标

1. 把 Settings 重建为五个明确配置域。
2. 让引擎页成为 v0.1 中最重要的配置页。
3. 保留“不持久化”诚实提示，但不让其掩盖信息架构缺失。

---

## 本任务必须完成

1. 五个 tab 固定为：
   - 引擎
   - Soul
   - 策略
   - 环境
   - 外观
2. 每个 tab 必须有明显不同的主内容与主问题域。
3. 引擎页至少承担：
   - 当前引擎状态查看
   - 重新检测
   - 接入说明或失败原因说明
4. 保留 Settings 不持久化的诚实提示。
5. 若设置快照结构不足以支撑新信息架构，允许调整，但必须同步 protocol 与接口文档。

---

## 本任务不包含

- 不实现 Settings 持久化到 SQLite。
- 不做完整主题系统。
- 不在本任务里完成所有占位按钮硬化。

---

## 验收标准（DoD）

1. 任意切换三个以上 tab，内容不会再高度同质化。
2. 五个 tab 的主内容明确对应不同配置域。
3. 引擎页可以承担真实状态查看与重新检测。
4. “设置不持久化”提示仍然存在。

---

## 完成后更新

- [ ] `closure-overview.md` 中 C010 状态改为“已完成”
- [ ] `AGENTS.md` 中收口任务进度同步
- [ ] 若新增接口或字段，`docs/INTERFACE_INDEX.md` 追加变更记录
