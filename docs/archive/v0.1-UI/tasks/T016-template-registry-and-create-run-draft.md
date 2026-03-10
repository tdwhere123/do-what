# T016 · template-registry-and-create-run-draft（模板注册表与 Create Run 草稿）

**Epic:** v0.1-UI  
**分组:** Workbench  
**依赖:** T003，T012  
**可并行:** 可与 T017 并行  
**状态:** 待开始  

---

## 目标

落实 template registry 读模型与 Create Run 草稿结构，让模板变化收敛在 descriptor / form adapter 层。

---

## 涉及文件/目录

```text
packages/app/src/lib/template-registry/
packages/app/src/components/create-run/
packages/app/src/stores/ui/
```

---

## 实现要点

- 读取并缓存 `TemplateDescriptor[]`。
- 把草稿结构固定为 `templateType + templateVersion + templateInputs + participants`。
- advanced panel 字段只作为 descriptor 映射结果出现。
- 不在前端复制 workflow 模板推导逻辑。

---

## 验收标准

- [ ] Create Run 表单只消费 descriptor 与草稿模型
- [ ] 模板字段变化优先收敛在 adapter
- [ ] workspace draft 结构可直接复用到提交前本地态
- [ ] 不出现散落在组件中的模板 if/else 逻辑

---

## 风险 / 注意事项

- 未来模板系统仍可能扩展，adapter 需要具备容错性。
- descriptor 缺字段时要降级显示，而不是推导不存在的配置。
