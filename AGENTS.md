# AGENTS.md — dsh-mcp-jetbrains

面向要改这个仓库的 AI/开发者。只写本仓特有的规矩与已实测的坑；通用编程建议不在此。

## 这是什么

DSH（DeepSeek Harness）插件：连接管理多台 JetBrains IDE 内置的 MCP Server，把 IDE 能力接成 DSH 工具，并提供一个设置页。Host + 客户端双半，都是 TypeScript 源码。

**仓库根就是包根**（早先的 `connectors/dsh-mcp-jetbrains` 中间层已移除，别按那条路径找）。

| 路径 | 角色 |
|---|---|
| `src/index.ts` | Host 半源码，`tsc` 产出 `lib/index.js` |
| `src/client.tsx` | 客户端半源码（设置页），`tsc` 产出根目录 `client.js` |
| `src/env.d.ts` | `@deepseek-ai/*` 的类型 shim（peer 依赖，工程内无法解析） |
| `lib/index.js` / `client.js` | **构建产物，入库** |
| `cordis.patch.yml` | 插件在 profile patch 里的插入行 |
| `assets/` | 静态资源（`icon.svg`） |
| `locale/` | 界面语言包，**必须留在根**（DSH 按 `locale/<lang>.json` 目录约定读，且要求出现在 `exports`） |
| `tsconfig.json` | 公共编译选项；`tsconfig.host.json` / `tsconfig.client.json` 分别产出宿主与客户端 |
| `文档/` | 路线规划与官方文档副本 |

## 构建与产物纪律

```text
pnpm build        # tsc -p tsconfig.host.json && tsc -p tsconfig.client.json
```

1. **不打包**：`tsc` 1:1 产出。产物入库，linked 安装不会现场构建。
2. **布局约定**：宿主产物进 `lib/`（`exports["."]` 指向它），客户端产物留在根 `client.js`（`exports["./client"]`）。根目录只留一个 js。
3. **`client.js` 里不许出现任何 `import`**。它由宿主以工厂脚本加载（`window['__ModuleLoader__'].load({ id, factory })`），依赖只能从 `require` 参数取。
4. **JSX 用经典运行时**：`jsx: "react"` + `jsxFactory: "h"`。浏览器侧是裸 ESM，解析不了 `react/jsx-runtime`，用自动运行时会直接加载失败。
5. `@deepseek-ai/*` 是 peer 依赖：新增裸 import 必须同时进 `peerDependencies`，否则 profile 里报 `ERR_MODULE_NOT_FOUND`。类型靠 `src/env.d.ts` 里 `declare module` 顶上。

## 开发闭环

```text
改 src/*.ts(x) → pnpm build → remove_bundle → install_bundle（指向仓库根）→ 验证
```

**linked 插件不热更新**：不重装就还是旧模块世代，改完看不到效果不是代码错。

`pnpm install` 在本目录会因上游未发布的包而 404，所以 `pnpm-workspace.yaml` 关了 `verifyDepsBeforeRun`，`pnpm-lock.yaml` 不入库。装新 devDependency 用 `pnpm add -D <pkg>`。

## 验收清单（本仓标准）

改动合并前逐条过：

| 检查 | 期望 |
|---|---|
| `pnpm build` | 成功 |
| `node --check lib/index.js` / `node --check client.js` | 均通过 |
| `client.js` 里 `^import ` 计数 | **0** |
| `src/index.ts`、`lib/index.js`、`src/client.tsx`、`client.js` 的 IDE 静态检查 | 全部 0 |
| 无 cookie `GET /dsh-mcp-jetbrains/config` | **401**，body `{"ok":false,"error":"unauthorized"}` |
| `mcp__idea__execute_tool` | 可正常调用（例如 `get_project_modules`） |

## 编码与行尾

- 代码与配置 **LF**；`.md` **CRLF**（`.gitattributes` 已钉死）。
- IDE 的 `reformat_file` 会把 `.md` 整篇改成 LF，动过就归回 CRLF 再入库。
- 一律 UTF-8 **无 BOM**；写文件用 `[IO.File]::WriteAllText` + `New-Object Text.UTF8Encoding($false)`。

## 高危行为清单

每条都是实测踩过或被实测推翻的假设。

| 不要做 | 原因 |
|---|---|
| 用 `robocopy /MOVE` 或 `Move-Item` 搬 `node_modules` | 会拍平 pnpm 的符号链接，`@types/node` 变成没有 `package.json` 的空壳，`tsc` 报 `Cannot find name 'process'`。搬目录后应当直接删掉重装 |
| 假设 `apply_patch` 遇到多处相同文本会报错 | 它**不查歧义**，静默修改**第一处**并返回 `1 out of 1 operations applied`。所以 `edit` 必须先 `search_text` 定位 |
| 给 `read_file` 传文档里的 `mode` / `start_line` | 本机 2026.2.3 的实际签名是 `(file_path, offset, limit)`，`mode` 会被丢弃。契约以本机实测为准 |
| 以为 `apply_patch` 批量操作是原子的 | 合法的照做、非法的逐条报错、**不回滚**：`1 out of 2 operations applied` + 每条原因 |
| 以为「读写走 IDE」能管住 shell 删除 | 它只拦工具层 `read`/`write`/`edit`；`Remove-Item` / `rm` 绕过 IDE，Local History 也救不了 |
| 在开关开启时让失败静默回落磁盘 | 这是设计红线。无法路由必须明确失败并给出三种解法 |
| 只用 `tools/list` 拿路由模式下的工具清单 | 路由模式只列 `execute_tool` 一个，内部工具名只能从报错文本的 `Available tools:` 解析 |
| 删改形参后忘记同步 JSDoc | IDE 会立刻报「JSDoc 中描述的形参未出现在函数签名中」（实测抓过一次） |
| 以为 `tools/execute` wrapper 追加的 `content` 模型一定看得到 | **只有错误结果保留**。成功结果会被 `normalizeDispatchResult` → `createSuccessResult` 按 `value` 重新渲染 `content`，追加的文本块被丢弃。持久记录走 `diagnostics`，附言只放在失败路径 |

## 版本与发布

- `package.json` 的 `version` 与 `src/index.ts` 里的 `PLUGIN_VERSION` **必须同时改**（后者进 MCP `clientInfo`，用于日志与诊断）。
- 发布前过一遍上面的验收清单。
- 包已发布：`dsh-mcp-jetbrains`（<https://www.npmjs.com/package/dsh-mcp-jetbrains>）。`private` 已移除，`publishConfig` 钉死 `access: public` 与 `registry: https://registry.npmjs.org`（本机 npm 默认源是 npmmirror 镜像，不发布到镜像）。

### 为什么是手动发布（2026-10-28 实测结论）

想走 Trusted Publisher（OIDC，零 token + provenance）时被两道墙拦住：

1. **OIDC 不能发首版**——npm 有意不支持（[npm/cli#8544](https://github.com/npm/cli/issues/8544)），必须先用 token 把包名占住。占名已完成。
2. **建 Trusted Publisher 要求账户先开 2FA**，而 npm 的 2FA 设置页**只提供硬件安全密钥（WebAuthn）**，没有验证器 App（TOTP）选项；没有 FIDO2 设备就卡在 `Device registration failed`。

所以当前唯一可用路径是**手动 + 短期 granular token**。仓库里的 `.github/workflows/publish.yml` 是给 OIDC 准备的，**暂时处于休眠状态**（只在推 `v*` 标签时触发，手动流程不打标签）。等有了硬件密钥并配好 Trusted Publisher，它立刻可用。

### 发布访问策略（改之前先看）

包的 Publishing access 必须保持**宽松档**：`Require two-factor authentication or a granular access token with bypass 2fa enabled`。

若切成推荐档（`Require 2FA and disallow bypass tokens`），**bypass token 就再也发不了包**——而 token 是当前唯一路径。切之前先确认新路径已经能用。

### 手动发版流程

```text
1. 改版本：package.json 的 version + src/index.ts 的 PLUGIN_VERSION
2. pnpm build
3. 过验收清单（四文件静态检查 0、client.js 零 import、无 cookie 路由 401）
4. npm 网页生成 granular token（Read and write；勾 bypass 2FA；7 天）
5. npm config set //registry.npmjs.org/:_authToken=<token>
6. npm publish                     # 不要带 --registry，publishConfig 已钉死官方源
7. npm view dsh-mcp-jetbrains version   # 确认新版本可查
8. 立刻删 token：https://www.npmjs.com/settings/<用户名>/tokens
9. git tag v<version> && git push --tags    # tag 只作标记，不触发 CI 发布
```

注意点：

- **token 不要写进仓库、不要粘进对话**；它等同短期发包权，用完即删。
- `npm publish` 读的是**当前目录磁盘上的文件**，不是 git 里的内容——确认工作树是你想发的状态。
- 首次发布会额外产生一个 `0.0.0-stage` 占位版本，是 npm 的内部标记，不用管它。

### 2027-01 之后的变化（已知风险）

npm 计划于 2027 年 1 月取消「bypass-2FA token 直接发布」的能力（[公告](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/)）。届时只剩三条路：

1. **硬件安全密钥** + Trusted Publisher（最干净）；
2. 用 GitHub Actions + 存 `NPM_TOKEN` secret（能发，但等于把长期发包权交给第三方）；
3. **在 npm 上标记停止维护，只更新 GitHub** —— 仓主已表态接受这条兜底，所以不必为了发版强行采购硬件。

## 关键实现位置（改之前先看）

| 关注点 | 位置 |
|---|---|
| 连接配置与存储读写 | `src/index.ts` 的 `readStore` / `writeStore` / `ideIoOf` |
| 后台探测与退避 | 探测常量区（`PROBE_*`），健康退避上限 45 秒、工具面每 2 次探测校验一次 |
| 失败诊断与一次性重试 | `ctx.on('tools/execute', …)` 处理器 |
| 读写走 IDE 的拦截与路由 | `routeFileTool` / `pickIdeRow` / `readViaIde` / `writeViaIde` / `editViaIde` |
| 设置页 | `src/client.tsx` |
| 路由与鉴权 | `GET/POST /dsh-mcp-jetbrains/config`、`POST /reconnect`、`POST /ide-io`，均经 DSH 浏览器信任 |

## 提交身份（本仓特例）

- 本仓库的**本地 git 身份固定为 `本地鲸鱼 <dsh@local>`**，由仓主定：历史里保留「谁写的」，让读者知道这个插件是 AI 写的，而不是冒充人类作者。
- 因此**不要**在提交前切全局身份、也**不要**在提交后"归位"；直接用仓库本地配置提交即可：
  ```text
  git config --local user.name  "本地鲸鱼"
  git config --local user.email "dsh@local"
  ```
- 工作区脚本 `脚本/GitUserSwitch.ps1` 仍需用于需要区分身份的仓库，但**本仓不是其中之一**。

## 安全类改动必须人工过目

以下改动**不得**仅由 AI 自行决定并提交，必须由仓主复核后再落：

- 鉴权与会话（`refused()`、`connection.requestRejection`、路由信任）；
- 任何可能造成「静默回落磁盘」的路径（`routeFileTool` 的失败分支）；
- 删除、移动、覆盖类操作，以及批量 `apply_patch`；
- 扩大模型可触达的能力面（新工具、新路由、放开 `execute_terminal_command` 一类）；
- `SAFETY.md` / `SAFETY.en.md` 的任何删减。

理由：这个插件的风险不在代码风格，而在「它把 IDE 的能力交给了模型」——这类边界一旦放松，回滚成本远高于改动成本。

## 参考

- 路线规划（判断依据、实测记录、后续计划）：`文档/软件工程/0.项目管理/路线规划.md`
- IDE MCP Server 官方文档副本（英文原版，注意与 2026.2.3 实现的差异）：`文档/参考/mcp-server-2026.2.en.md`
