# 开发与测试 / Development and Testing

[中文](#中文) · [English](#english)

<a id="中文"></a>

## 中文

### 环境要求

- Chrome 120 或更高版本。
- Node.js 18 或 22；CI 会在这两个版本上运行 Node 测试。
- 项目没有第三方 npm 依赖、打包器或编译步骤。HTML、CSS 和 classic JavaScript 会直接作为扩展资源加载。
- 浏览器烟测需要本机可执行的 Chrome 或 Chromium。

### 本地启动

```bash
git clone https://github.com/heihaheihaha/g-extension.git
cd g-extension
npm test
```

在 `chrome://extensions` 开启“开发者模式”，点击“加载已解压的扩展程序”并选择仓库根目录。代码修改后：

1. 在扩展卡片上点击“重新加载”。
2. 刷新已经打开的目标网页，使新的内容脚本进入页面。
3. 重新打开侧边栏或选项页；后台问题可从扩展详情中的 Service Worker 检查器查看。

不要从 `guide/`、`docs/` 或某个子目录加载；`manifest.json` 必须位于所选目录根部。

### 目录职责

| 路径 | 内容 |
| --- | --- |
| `manifest.json` | 扩展入口、Chrome 基线与权限 |
| `background.js` | 后台编排、消息安全、提取注入和链接任务 |
| `sidebar.*` | 侧边栏聊天与工具界面 |
| `content_script.js` | 选区与链接拖放边界 |
| `extraction_core.js`、`*_content_extractor.js` | 统一提取核心和注入入口 |
| `regex_engine.js`、`regex_worker.js` | 正则纯逻辑与 Worker |
| `options.*`、`prompts.*`、`archive.*` | 设置、Prompt 与存档页面 |
| `libs/` | 随扩展打包的第三方库和 Markdown 清洗器 |
| `_locales/` | Chrome 扩展元数据国际化 |
| `guide/`、`privacy_policy/`、`docs/` | 产品指南、隐私政策和维护文档 |
| `tests/` | Node 契约/安全测试、VM 夹具与真实浏览器烟测 |

完整模块关系见[架构说明](./architecture.md)。

### 测试命令

```bash
# 所有 Node 契约、行为与安全测试
npm test

# 同一 Node 测试集，并输出 Node 的实验性覆盖率
npm run test:coverage

# Chrome/Chromium 中的真实 DOM 与 Worker 烟测
npm run test:browser
```

`test:coverage` 是诊断工具，不是当前 CI 门禁。它包含 VM 夹具和测试运行辅助代码，也不包含浏览器 smoke 的覆盖，因此不要只用汇总百分比判断产品风险；应结合相关运行文件、分支边界和浏览器验证。

浏览器 runner 依次读取 `CHROME_BIN`、`CHROME_PATH`、`CHROMIUM_BIN`，之后查找常见安装路径。例如：

```bash
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:browser
```

runner 启动一个仅监听 `127.0.0.1` 的临时静态服务器，通过 DevTools pipe 驱动无头浏览器，并在结束后删除临时 profile。它验证真实 Chrome DOM、closed ShadowRoot、拖放事件、Markdown 清洗和 Worker 终止，但会模拟 `chrome.runtime`；它不是“安装扩展后遍历所有功能”的完整端到端测试。

### 测试分层

| 层 | 主要文件 | 适合覆盖 |
| --- | --- | --- |
| 纯逻辑 | `regex_engine.test.js`、`extraction_core*.test.js` | 正常值、边界、截断、Unicode、错误结构 |
| 注入入口/Worker | `extractor_entrypoints.test.js` | 四个入口的模式选择、核心缺失结构、Worker import/转发、关联 ID 与异常转换 |
| 后台与链接任务 | `background_*test.js` | 发送者授权、并发、预算、超时、恢复、claim/ack/release 竞态 |
| 内容脚本 | `content_script_*test.js` | 选区授权、URL 规范化、拖放与 ShadowRoot 边界 |
| 侧边栏 | `sidebar_*test.js` | API 串行化、SSE、历史预算、窗口隔离、正则超时和任务交付 |
| 设置/Prompt/存档 | `options_prompts.test.js`、`archive_runtime_contract.test.js` | 配置请求、迁移、渲染和持久化 |
| 输出安全 | `safe_markdown_security.test.js` | 标签、属性、URL scheme 和受信任 UI 标记 |
| 打包契约 | `manifest_contract.test.js`、`package_integrity.test.js` | Manifest、引用资源、本地脚本与 classic-script 语法 |
| 浏览器 smoke | `browser_harness.html`、`run_browser_smoke.js` | 真实浏览器 DOM、事件和 Worker 行为 |

### 新增或修改测试

- 新增 `tests/*.test.js` 会被 `node --test` 自动发现。使用 `node:test` 和 `node:assert/strict`。
- 纯逻辑优先做成可直接调用的函数；`regex_engine.js` 的浏览器/Node 双用途封装可作为参考。
- 测试 Chrome API 或 DOM 脚本时，优先复用 `tests/helpers/` 的 VM 环境，只模拟本场景需要的边界。
- 新增浏览器 smoke 时，必须同时在 `tests/browser_harness.html` 实现检查，并将完全相同的名称加入 `run_browser_smoke.js` 的 `REQUIRED_SMOKE_TESTS`。runner 会检查每个必需名称恰好出现一次。
- 修改提取 schema 时，同时更新核心、四个注入入口、后台校验和对应契约测试。
- 新增运行时 HTML/JS/CSS/图片引用后运行全套测试；包完整性测试会拒绝缺失资源和远程可执行脚本。
- 修复问题时先写能复现失败的测试，再验证修复后的正常路径与相邻边界。

按改动选择最小验证集：

| 改动 | 至少运行 |
| --- | --- |
| 文案、Markdown 文档、隐私页 | `npm test`，并检查本地链接和中英文同步 |
| 纯提取或正则逻辑 | `npm test`、`npm run test:coverage` |
| DOM、拖放、Worker、Markdown 渲染 | `npm test`、`npm run test:browser` |
| 后台任务、存储或权限 | `npm test`；再手动加载扩展验证恢复和权限路径 |
| API/SSE 行为 | `npm test`；使用测试配置手动验证成功、HTTP 错误、空流和超时 |

### CI

`.github/workflows/test.yml` 在每次 `push` 和 `pull_request` 上运行，权限仅为 `contents: read`：

- Node 18：`npm test`
- Node 22：`npm test` + `npm run test:browser`

当前 CI 不执行 coverage、lint、typecheck 或 build，因为仓库没有对应门禁/构建阶段。不要在文档中把这些描述成已启用检查。

### 调试与发布前检查

- Service Worker：`chrome://extensions` → 扩展详情 → Service Worker“检查视图”。
- 页面脚本：目标标签页 DevTools；确认重新加载扩展后也刷新了页面。
- 侧边栏/设置/存档：在对应扩展页面打开 DevTools。
- 存储：在扩展 DevTools 的 Application 面板检查 `sync`、`local` 和 `session`，避免把 API Key 打印到日志或测试快照。

发布前至少确认：

1. `manifest.json` 版本、README 更新日志和商店说明一致。
2. `npm test` 与 `npm run test:browser` 通过。
3. 新增权限、外部数据流、存储键、上限或保留期已同步更新 README、架构文档和中英文隐私政策。
4. 新增用户界面文字已同步中英文；新增资源已包含在扩展包中。
5. 从干净 Chrome profile 加载根目录，手动验证首次配置、当前页总结、本地全文、链接任务和错误提示。

<a id="english"></a>

## English

### Requirements and local setup

- Chrome 120 or later.
- Node.js 18 or 22, matching the CI matrix.
- No third-party npm dependencies, bundler, compilation, or runtime build step.
- Chrome or Chromium is required for browser smoke tests.

```bash
git clone https://github.com/heihaheihaha/g-extension.git
cd g-extension
npm test
```

Enable Developer mode at `chrome://extensions`, choose **Load unpacked**, and select the repository root. After a code change, reload the extension, refresh already-open target pages so the new content script is injected, and reopen extension pages as needed. Inspect the service worker from the extension details page.

### Test commands

```bash
npm test
npm run test:coverage
npm run test:browser
```

- `npm test` runs all Node contract, behavior, and security tests with `node:test`.
- `test:coverage` runs the same Node tests with experimental coverage. It includes test helpers and excludes browser smoke coverage, so its aggregate percentage is diagnostic rather than a release gate.
- `test:browser` runs real Chrome DOM, event, sanitizer, closed-ShadowRoot, and Worker checks while mocking `chrome.runtime`. It is a browser smoke layer, not a fully installed-extension E2E suite.

The browser runner checks `CHROME_BIN`, `CHROME_PATH`, and `CHROMIUM_BIN` before common install locations. It uses a loopback-only temporary server and profile and cleans both up after the run.

### Adding tests

- New `tests/*.test.js` files are auto-discovered. Use `node:test` and `node:assert/strict`.
- Prefer direct tests for pure logic. Reuse the minimal VM environments under `tests/helpers/` for Chrome and DOM scripts.
- A new browser smoke check must be implemented in `browser_harness.html` and added under the exact same name to `REQUIRED_SMOKE_TESTS` in `run_browser_smoke.js`.
- An extraction-schema change must update the core, four injected entry points, background validation, and contract tests together.
- Run package-integrity tests after adding runtime resources; extension scripts must remain local and parse as classic scripts.
- A bug fix should include a reproducing test plus the adjacent success and boundary cases.

### CI and release checks

The test workflow runs on pushes and pull requests with read-only repository permissions. Node 18 and 22 both run `npm test`; Node 22 also runs `npm run test:browser`. Coverage, lint, typecheck, and build are not current CI gates.

Before release, verify the manifest/version/changelog, run Node and browser tests, manually load the repository root in a clean Chrome profile, and keep both language versions of user-facing text and privacy documentation synchronized. Any permission, storage, retention, limit, or outbound-data-flow change requires documentation and privacy-policy updates in the same change.
