# 故障排查 / Troubleshooting

[中文](#中文) · [English](#english)

<a id="中文"></a>

## 中文

### 先做这四项检查

1. 在 `chrome://version` 确认 Chrome 120 或更高版本。
2. 如果使用源码版，在 `chrome://extensions` 点击扩展卡片上的“重新加载”，随后刷新目标网页。只重新加载扩展不会把新内容脚本自动注入已经打开的页面。
3. 在扩展详情中检查“网站访问权限”。处理本地文件时还要开启“允许访问文件网址”。
4. 打开“选项”，确认当前配置包含 API Key、模型名称；OpenAI 兼容配置还必须有完整 Endpoint。点击“测试连接”，保存并确认该配置标记为“当前活动”。

### 无法在页面中提取内容

- `chrome://` 页面、Chrome Web Store、新标签页等受保护页面不允许扩展注入脚本。请在普通 HTTP(S) 页面重试。
- 浏览器内置 PDF、跨域 iframe、未渲染的虚拟列表和 Shadow DOM 内部内容不保证能被完整提取。
- 动态页面可能在初次加载后才渲染正文。等待或滚动到内容出现，再点击“刷新网页内容”或重新总结。
- Readability 只识别正文。正则工具的“网页内容”为空或缺少导航/评论时，可勾选“完整可见文本”；这会同时带入页眉、页脚等噪声。
- 当前页包含超过 50,000 个 DOM 元素时，插件会跳过 Readability 并尝试回退到可见文本。
- `file:` 页面需要 Chrome 的“允许访问文件网址”；链接总结只接受无内嵌用户名/密码的 HTTP(S) URL。

### API 配置或聊天失败

| 现象 | 检查 |
| --- | --- |
| 首次使用提示配置不完整 | 补齐 Key、模型；OpenAI 兼容类型还要补 Endpoint，然后保存并设为活动配置 |
| 401 / 403 | API Key 无效、权限不足，或服务商拒绝当前模型 |
| 429 | 服务商额度、速率限制或账户计费状态 |
| 5xx | 服务商暂时异常；稍后重试并查看其状态页 |
| “测试连接”成功但聊天失败 | 测试连接是非流式请求；聊天 Endpoint 还必须兼容 OpenAI Chat Completions 的 `stream: true`、SSE `data:` 行和 `[DONE]` |
| 有 HTTP 200 但没有内容 | 模型/Endpoint 的响应 JSON 或 SSE 格式不兼容，或服务商返回空流 |
| 请求突然停止 | 侧边栏和存档页流式请求总限 2 分钟；连续 30 秒没有流数据会中止 |

Gemini 配置只需要 Key 和服务商提供的有效模型 ID。OpenAI 兼容配置的 Endpoint 应是服务商文档给出的完整 Chat Completions 地址，而不是控制台首页或 API 根目录。

页面/链接总结不会携带已有聊天历史；普通聊天和在存档中继续对话会携带最近 40,000 字符的上下文。若问题只出现在很长的对话中，可分割对话后重试。

### 多行正则没有结果

多行内容可以提取，但 `m` 和 `s` 的作用不同：

- `m` 让 `^` 和 `$` 匹配每一行的开头与结尾，不会让点号跨行。
- `s` 让 `.` 匹配换行。
- 工具会自动补 `g`，因此会查找全部命中。

逐行提取标题：

```regex
/^标题[:：][ \t]*(.+)$/gm
```

提取两个标记之间的多行块：

```regex
/BEGIN\n(.*?)\nEND/gs
```

常见问题：

- 正则可以写成普通 pattern，也可以写成 `/pattern/flags`。flags 输入框有非空内容时，以输入框为准。
- 支持 `d g i m s u v y`；不能重复，`u` 与 `v` 不能同时使用。
- 有非空捕获组时，结果只输出捕获内容；多个捕获组会产生多个结果项。仅用于分组结构时请用 `(?:...)`。
- 逐行空白建议使用 `[ \t]`，避免 `\s` 意外跨过换行。
- 复杂嵌套量词可能触发 1 秒 Worker 超时。缩小到 Readability 正文、增加明确边界并避免类似 `(.*)+` 的灾难性回溯。
- 源文本最多 200,000 字符，pattern 最多 10,000 字符，输出最多 1,000 次命中和 100,000 个字符；达到上限会显示截断状态。

完整语法和操作见[使用指南](./user-guide.md#正则多行提取)。

### 链接总结失败或一直等待

- 最多同时运行 3 个链接提取任务；等待现有任务结束后再试。
- 每个链接提取总限 30 秒。需要登录、反自动化、重定向很多或客户端渲染很慢的网站可能超时。
- 临时标签页会使用当前 Chrome profile 的 Cookie/登录状态访问目标站点；不要在提取中手动关闭它。
- 在发起操作的同一 Chrome 窗口打开侧边栏。任务按窗口交付，其他窗口不会领取结果。
- 任务结果通常保留约 10 分钟供恢复；活动 claim 或等待重试时清理会适当延后。
- 会话存储采用 7 MiB 内部预算，并为活动任务预留结果空间。待处理结果过多或页面过大时，先消费/等待现有任务再试。

### 图片分析失败

- 先在同一窗口打开侧边栏，再右键图片选择分析；图片右键动作本身不会可靠地为一个尚未连接的侧边栏保留消息。
- 当前模型必须支持图片输入。插件可向 Gemini 或 OpenAI 兼容格式发送图片，但“接口兼容”不等于“该模型支持视觉”。
- 图片源站必须允许浏览器取得实际图片响应；响应 MIME 应为 `image/*`。
- 图片上限为 10 MiB，下载超时为 30 秒。过期 URL、防盗链或需要额外认证的图片可能失败。

### 历史、配置或隐私疑问

- API 配置（包括 Key）、活动配置、语言和正则设置位于 `chrome.storage.sync`，可能由 Chrome 同步到登录同一 Google 账户的浏览器。密码输入框只隐藏屏幕显示；插件没有对 Key 再做应用层加密。
- 聊天、存档和 Prompt 模板位于 `chrome.storage.local`。普通聊天最多保留最近 50 个会话。
- 链接任务 URL、状态和结果暂存在 `chrome.storage.session`，供后台休眠后恢复。
- “提取全文”和正则预览/复制本身不调用 AI；用户发送引用、发送“设计正则”准备的请求、总结、聊天或图片分析时，相关数据才会发到当前 AI 服务。
- 删除配置请使用选项页；删除聊天和存档请分别使用侧边栏和存档页的清除功能。删除前请确认不再需要这些数据，项目目前没有内置导出/恢复功能。

详细边界见[架构说明](./architecture.md#信任边界)和[中文隐私政策](../privacy_policy/privacy_policy_zh.html)。

### 开发环境与测试

**找不到 Chrome/Chromium**

设置可执行文件路径后重试：

```bash
CHROME_BIN="/path/to/chrome" npm run test:browser
```

runner 也识别 `CHROME_PATH` 和 `CHROMIUM_BIN`。确认该文件可执行，并能独立运行 `--version`。

**浏览器烟测报监听权限错误**

runner 需要在 `127.0.0.1` 随机端口启动临时服务器。部分沙箱会以 `EPERM`/权限错误阻止本地监听；请在允许 loopback 监听的本机或 CI 环境运行，而不是关闭测试断言。

**Node 测试通过但扩展仍使用旧行为**

Node 测试不会重新加载已安装扩展。回到 `chrome://extensions` 重新加载，再刷新目标网页和扩展页面。

**进一步诊断**

在 `chrome://extensions` 的扩展详情中打开 Service Worker 检查器。常见链接任务错误码包括：

| 错误码 | 含义 |
| --- | --- |
| `LINK_CONCURRENCY_LIMIT` | 已达到 3 个活动任务 |
| `LINK_STORAGE_BUDGET_EXCEEDED` | session 预算不足 |
| `TIMEOUT` | 超过链接提取期限 |
| `TAB_CLOSED` | 临时标签页被关闭 |
| `RESULT_TOO_LARGE` | 终态结果无法在预算内保存 |
| `OPEN_LINK_FAILED` | 无法创建或访问临时标签页 |
| `INJECTION_FAILED` | 无法向页面注入提取器 |
| `NO_TEXT_CONTENT` | 页面没有可用的正文/可见文本 |

报告问题时请提供 Chrome 版本、扩展版本、复现步骤、页面类型、API 类型、可公开的错误文本和相关控制台日志；不要附上 API Key、完整私人对话或敏感网页原文。

<a id="english"></a>

## English

### First checks

1. Confirm Chrome 120+ at `chrome://version`.
2. For a source install, reload the extension at `chrome://extensions`, then refresh the target page. Reloading the extension does not inject the new content script into an already-open page.
3. Check site access in the extension details. Enable file-URL access separately for local files.
4. In Options, complete and activate the configuration and run **Test Connection**. OpenAI-compatible configurations require a full Chat Completions endpoint.

### Extraction problems

Chrome internal pages, the Chrome Web Store, and new-tab pages block script injection. Built-in PDFs, cross-origin iframes, virtualized lists, and closed page Shadow DOM are not guaranteed to extract completely. Wait for dynamic content, then refresh the regex source or retry. Switch from reader text to full visible text when necessary, understanding that navigation and footer noise will be included.

Readability is skipped above 50,000 DOM elements and falls back to visible text. File pages require file-URL permission. Link summaries accept credential-free HTTP(S) URLs only.

### API problems

- 401/403: check the key, provider permissions, and model access.
- 429: check quota, rate limits, and billing.
- 5xx: check the provider and retry later.
- A successful connection test does not guarantee streaming chat compatibility. The test is non-streaming; chat requires OpenAI Chat Completions `stream: true`, SSE `data:` records, and `[DONE]` for compatible endpoints.
- A 200 response with no text usually indicates an empty or incompatible JSON/SSE format.
- Side-panel and archive streams stop after two minutes total or 30 seconds without stream data.

Current-page and link summaries exclude prior chat history. Ordinary chat and continuing an archived conversation include the newest 40,000 characters of context.

### Multiline regex

Use `m` for per-line `^`/`$`; use `s` when `.` must cross line breaks. Global matching is added automatically.

```regex
/^Title:[ \t]*(.+)$/gm
/BEGIN\n(.*?)\nEND/gs
```

Patterns may be raw or `/pattern/flags`. A non-empty flags field overrides literal flags. Supported flags are `d g i m s u v y`; duplicates are invalid and `u` cannot be combined with `v`. Non-empty capture groups become the output, so use `(?:...)` for structural grouping. The limits are 200,000 source characters, 10,000 pattern characters, 1,000 hits, 100,000 output characters, and a one-second Worker timeout.

### Link and image problems

Link extraction is limited to three concurrent jobs and 30 seconds per job. Do not close its inactive temporary tab, and keep the side panel in the initiating Chrome window. Terminal results are normally retained for about ten minutes. Slow client-rendered, authenticated, or anti-bot pages may fail.

For image analysis, open the side panel in the same window first. The active model must support image input. The image response must be obtainable as `image/*`, no larger than 10 MiB, and downloadable within 30 seconds.

### Storage and privacy

API configurations including keys are stored in `chrome.storage.sync` and may be synchronized by Chrome; the password field only hides on-screen display and is not application-level encryption. Chat, archives, and prompts use `chrome.storage.local`; link jobs use `chrome.storage.session`. Full-visible-text extraction and regex preview/copy are local. Data is sent to the active AI service only when the user submits an AI operation.

### Test environment

Set `CHROME_BIN`, `CHROME_PATH`, or `CHROMIUM_BIN` if the browser runner cannot locate Chrome. It also needs permission to listen on a random loopback port. After Node tests, remember to reload the installed extension and refresh target pages before manual verification.

For deeper diagnosis, inspect the service worker from `chrome://extensions`. Include Chrome and extension versions, reproducible steps, page type, API type, safe error text, and relevant logs in a bug report. Never include API keys, private conversation history, or sensitive page content.
