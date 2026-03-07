# T001 · Monorepo Scaffold

**Epic:** E0 – Protocol & Schema
**依赖:** 无
**估算改动:** ~150 行配置文件

---

## 目标

搭建 pnpm workspace + turborepo 的 Monorepo 骨架，创建所有 package 目录的 `package.json` stub，确保 `pnpm install` 和 `pnpm -w build` 无错误运行（各包暂时为空模块）。

---

## 范围

**做什么：**
- 根 `package.json`（workspace 声明、scripts、devDependencies：turborepo、typescript、vitest）
- `pnpm-workspace.yaml`
- `turbo.json`（build/test/lint pipeline）
- `tsconfig.base.json`（共享 TS 配置，ESM + strict）
- 以下各包的最小 `package.json` + `src/index.ts` stub：
  - `packages/protocol`
  - `packages/core`
  - `packages/app`
  - `packages/engines/claude`
  - `packages/engines/codex`
  - `packages/soul`
  - `packages/tools`
  - `packages/toolchain`
- `.gitignore`（node_modules, dist, .turbo）
- `.nvmrc` / `engines` 字段锁定 Node.js >= 20

**不做什么：**
- 不写任何业务逻辑
- 不配置 Electron
- 不安装 better-sqlite3、xstate 等运行时依赖（留给后续 Ticket）

---

## 假设

- Node.js >= 20 已安装于开发机
- pnpm >= 9 已安装
- 不需要 CI/CD 配置（留给后期）

---

## 文件清单

```
package.json                        (root)
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
.gitignore
.nvmrc
packages/protocol/package.json
packages/protocol/src/index.ts
packages/core/package.json
packages/core/src/index.ts
packages/app/package.json
packages/app/src/index.ts
packages/engines/claude/package.json
packages/engines/claude/src/index.ts
packages/engines/codex/package.json
packages/engines/codex/src/index.ts
packages/soul/package.json
packages/soul/src/index.ts
packages/tools/package.json
packages/tools/src/index.ts
packages/toolchain/package.json
packages/toolchain/src/index.ts
```

---

## 接口与 Schema 引用

无（此 Ticket 是骨架，不引用业务类型）。

---

## 实现步骤

1. 创建根 `package.json`：`name: "do-what"`, `private: true`, `workspaces: ["packages/*", "packages/engines/*"]`, scripts: `build / test / lint`
2. 创建 `pnpm-workspace.yaml`：`packages: ["packages/*", "packages/engines/*"]`
3. 创建 `turbo.json`：pipeline `build → test → lint`，`dependsOn: ["^build"]`
4. 创建 `tsconfig.base.json`：`target: ES2022, module: Node16, moduleResolution: Node16, strict: true, declaration: true`
5. 为每个 package 创建 `package.json`（`name: "@do-what/<pkg>"`, `type: "module"`, `exports: "./src/index.ts"`, `scripts: { build, test }`）
6. 为每个 package 创建 `src/index.ts`（只有 `export {}`）
7. 运行 `pnpm install` 验证 workspace 链接无误

---

## DoD + 验收命令

```bash
# 安装依赖
pnpm install

# 构建所有包（应无错误，仅输出空模块）
pnpm -w build

# 验证 workspace 包列表
pnpm list --depth 0 -w
# 预期输出包含：@do-what/protocol, @do-what/core, @do-what/app,
#   @do-what/claude, @do-what/codex, @do-what/soul, @do-what/tools, @do-what/toolchain

# TypeScript 类型检查（空模块应无错误）
pnpm -w exec tsc --noEmit
```

---

## 风险与降级策略

- **风险：** pnpm workspace 与 turborepo 版本不兼容
  - **降级：** 固定 turborepo@2.x + pnpm@9.x，在 `package.json` 的 `engines` 字段锁定
- **风险：** Windows 路径分隔符导致 turborepo pipeline 失败
  - **降级：** 在 `turbo.json` 的 `outputs` 使用正斜杠，并在 README 注明需用 Git Bash 或 PowerShell
