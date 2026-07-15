# 贡献指南 / Contributing Guide

[中文](#中文) · [English](#english)

<a id="中文"></a>

## 中文

感谢为 Smart Sidebar Assistant 提交改进。项目是直接加载的 Manifest V3 扩展；用户隐私、跨上下文消息边界和 Service Worker 恢复能力与功能本身同等重要。

### 开始前

1. 搜索现有 Issue 和 Pull Request，避免重复工作。
2. 对影响权限、外部数据传输、存储格式或用户流程的较大改动，先用 Issue 说明目标、方案和迁移影响。
3. 使用独立分支，保持提交围绕一个可审阅主题。
4. 阅读[架构说明](./docs/architecture.md)和[开发与测试](./docs/development.md)。

环境基线为 Chrome 120+ 与 Node.js 18/22。项目目前没有第三方 npm 依赖或构建步骤。

### 实现约定

- 运行时 JavaScript 直接作为 classic script 加载。除非同时设计并验证迁移，不要假设 ES module、打包器或 Node 全局可用。
- 权限操作放在后台边界，来自侧边栏和内容脚本的消息必须验证发送者、frame、tab/window 归属与输入长度。
- Service Worker 内存随时可能丢失。需要跨休眠恢复的状态应使用合适的 Chrome storage 和 alarm，并处理重复事件与竞态。
- 页面内容、拖入 URL、模型输出和第三方 API 响应都属于不可信输入。保持 URL 校验、摘要隔离、Worker 超时和 Markdown 清洗。
- 不要记录 API Key、完整私人对话、图片 Base64 或敏感页面正文。
- 不得从 CDN 加载扩展运行脚本。新增依赖时说明必要性、许可证、包体影响和本地打包方式。
- UI 文案同时维护中文和英文；可访问文本、错误状态和键盘操作不应退化。
- 修改公开行为时更新 README、使用/排障文档和更新日志。修改权限、存储、保留期或外发数据时，还要同步更新中英文隐私政策。

### 测试要求

所有改动至少运行：

```bash
npm test
```

涉及 DOM、拖放、Worker、Markdown 渲染或浏览器差异时再运行：

```bash
npm run test:browser
```

涉及提取、正则或复杂分支时建议运行：

```bash
npm run test:coverage
```

测试应覆盖问题复现、修复后的成功路径以及相邻边界。优先使用 `node:test`、`node:assert/strict` 和 `tests/helpers/` 中的最小 VM 夹具。新增浏览器 smoke 时，检查名称必须同时出现在 `tests/browser_harness.html` 与 `tests/run_browser_smoke.js` 的 `REQUIRED_SMOKE_TESTS`。

不要把 VM 测试或浏览器 smoke 描述为完整扩展 E2E；权限弹窗、扩展安装、真实站点登录状态和 Service Worker 生命周期仍需要手动验证。

### 文档要求

文档中的命令、路径、权限、存储键和数值限制必须能在当前仓库中核对。为减少漂移：

- README 只保留概览和入口，详细规则放入 `docs/` 专题文档。
- 双语文件应在同一次改动中更新两个语言段。
- 不要写容易过期的具体模型名称；建议用户使用服务商当前支持的模型 ID。
- 仓库内 HTML 指南与商店/托管版本可能需要分别部署；修改隐私政策时在 PR 中说明部署动作。
- 新增相对链接后确认目标文件存在，锚点与标题一致。

### Pull Request 清单

- [ ] 改动范围单一，说明了用户可见行为和设计取舍。
- [ ] 没有提交 API Key、令牌、私人数据、临时 profile 或调试输出。
- [ ] 新行为或修复有自动化测试；必要的手动验证有记录。
- [ ] `npm test` 通过；适用时 `npm run test:browser` 也通过。
- [ ] 新增运行资源已从正确 HTML/Manifest 引用，且没有远程可执行脚本。
- [ ] 权限、消息边界、URL/文本上限和持久化竞态已审阅。
- [ ] 中英文 UI、README、专题文档、更新日志和隐私政策按影响同步更新。
- [ ] 本地源码版在 Chrome 120+ 重新加载并验证。

### 报告问题

普通问题请通过 GitHub Issue 提供：Chrome/扩展版本、页面类型、API 类型、最小复现步骤、期望/实际结果和已脱敏日志。不要提交 API Key、完整私人对话或敏感网页原文。

如果报告尚未公开且可能影响用户数据的安全问题，请避免先发布可利用细节，可使用隐私政策中的联系邮箱 `rt@heihaheihaha.com` 协调披露。

提交贡献即表示您同意按仓库的 [MIT License](./LICENSE) 提供该贡献。

<a id="english"></a>

## English

Thank you for improving Smart Sidebar Assistant. This is a directly loaded Manifest V3 extension; user privacy, cross-context message boundaries, and service-worker recovery are first-class requirements.

### Before you start

1. Search existing issues and pull requests.
2. Open an issue first for substantial permission, outbound-data, storage-format, or workflow changes, including the proposed migration impact.
3. Use a focused branch and keep each change reviewable.
4. Read the [architecture](./docs/architecture.md#english) and [development guide](./docs/development.md#english).

The baseline is Chrome 120+ and Node.js 18/22. The project currently has no third-party npm dependency or build step.

### Implementation rules

- Runtime JavaScript is loaded as classic scripts. Do not assume ES modules, a bundler, or Node globals without an explicit, tested migration.
- Keep privileged operations behind the background boundary. Validate sender, frame, tab/window ownership, URL, type, and length for cross-context messages.
- Service-worker memory is disposable. Recoverable state belongs in the appropriate Chrome storage plus alarms, with duplicate-event and race handling.
- Treat page content, dragged URLs, model output, and third-party responses as untrusted. Preserve URL validation, summary isolation, Worker timeouts, and Markdown sanitization.
- Never log API keys, complete private conversations, image Base64, or sensitive page content.
- Do not load runtime scripts from a CDN. A new dependency needs a necessity, license, package-size, and local-packaging review.
- Keep Chinese and English UI text synchronized and preserve accessible labels, error states, and keyboard behavior.
- Update READMEs, topical documentation, and the changelog for public behavior. Permission, storage, retention, or outbound-data changes also require both privacy-policy languages.

### Tests

Every change must run:

```bash
npm test
```

Run `npm run test:browser` for DOM, drag/drop, Worker, Markdown rendering, or browser-specific changes. Use `npm run test:coverage` as a diagnostic for extraction, regex, and branch-heavy work.

Tests should cover the reproducing failure, the corrected success path, and adjacent boundaries. Prefer `node:test`, `node:assert/strict`, and the minimal VM fixtures in `tests/helpers/`. A browser smoke name must exist both in `tests/browser_harness.html` and in `REQUIRED_SMOKE_TESTS` inside `tests/run_browser_smoke.js`.

VM and browser-smoke tests are not a fully installed-extension E2E suite. Permission prompts, installation, authenticated real sites, and real service-worker suspension still need proportional manual verification.

### Documentation and PR checklist

Commands, paths, permissions, storage keys, and numeric limits must be verifiable against the current repository. Keep overview material in the READMEs and detailed rules under `docs/`; update both language sections together; avoid time-sensitive model IDs; and note any separate deployment needed for hosted guides or privacy pages.

- [ ] The scope is focused and user-visible behavior/tradeoffs are explained.
- [ ] No keys, tokens, private data, temporary profiles, or debug output are committed.
- [ ] New behavior or a bug fix has automated coverage and any required manual verification is recorded.
- [ ] `npm test` passes; `npm run test:browser` passes when applicable.
- [ ] New runtime resources are referenced correctly and no remote executable script was introduced.
- [ ] Permissions, message boundaries, URL/text limits, and persistence races were reviewed.
- [ ] Chinese/English UI, READMEs, topical docs, changelog, and privacy policies are synchronized as applicable.
- [ ] The source build was reloaded and verified on Chrome 120+.

### Reporting issues

For normal issues, include Chrome/extension versions, page type, API type, minimal reproduction, expected/actual behavior, and redacted logs. Never attach API keys, complete private conversations, or sensitive page text.

For a non-public vulnerability that may affect user data, avoid posting exploit details first and coordinate through `rt@heihaheihaha.com` from the privacy policy.

By contributing, you agree that your contribution is provided under the repository's [MIT License](./LICENSE).
