# 智能侧边栏助手用户指南 / Smart Sidebar Assistant User Guide

[中文](#chinese) | [English](#english)

<a id="chinese"></a>

## 中文

本指南适用于扩展 v1.4.0，最低要求 Chrome 120。聊天、网页总结、链接总结和图片分析需要用户自行配置 AI 服务；可见全文提取和正则预览可以完全在浏览器本地使用。

## 5 分钟开始使用

1. 从 Chrome 网上应用店安装扩展；如果从源码加载，请打开 `chrome://extensions`，开启“开发者模式”，选择“加载已解压的扩展程序”，然后选择仓库根目录。
2. 右键扩展图标并选择“选项”。如果只需要本地全文或正则提取，可以跳过 API 配置。
3. 在“添加/编辑配置”中填写 API 信息，先点“测试连接”，再点“保存配置”。第一份配置会自动成为当前活动配置；保存多份配置后，可在配置列表中选择“设为活动”。
4. 点击浏览器工具栏中的扩展图标打开侧边栏。
5. 选择一种操作：
   - 点“总结当前网页”，提取正文并交给当前 AI 总结；
   - 点“提取全文作为引用”，只在本地读取页面可见文本；
   - 在网页中选中文字，再输入问题或使用 Prompt 快捷方式；
   - 用链接右键菜单或拖拽预览总结链接；
   - 在“更多操作”中管理 Prompt、存档和正则工具。

扩展无法读取 Chrome 内部页面、Chrome 网上应用店等浏览器禁止扩展注入的页面。在这些页面上，请切换到普通的 `http://` 或 `https://` 网页重试。

## 配置 AI API

选项页支持保存多份配置并随时切换活动配置。各字段含义如下：

- **配置名称**：可选，仅用于区分配置；留空时扩展会自动生成名称。
- **API 密钥**：必填，由所选 AI 服务提供商签发。
- **API 类型**：选择“Google Gemini”或“OpenAI 兼容 API”。
- **API Endpoint URL**：仅 OpenAI 兼容类型必填。应填写可直接接受 `POST` 请求的完整聊天补全地址，例如服务商提供的 `/v1/chat/completions` Endpoint，而不是服务商首页。
- **模型名称**：必填，必须与服务商支持的模型 ID 完全一致。
- **测试连接**：使用当前表单发送一个很小的测试请求；测试成功不会自动保存配置。
- **保存配置 / 设为活动**：保存后，聊天和 AI 工具会使用当前活动配置。

Gemini 的请求地址由扩展根据模型名称自动生成。OpenAI 兼容服务还需要支持扩展使用的请求格式；聊天使用流式响应，图片分析要求当前模型和 Endpoint 支持图像输入。

API 配置（包括 API 密钥）保存在 `chrome.storage.sync`，可能通过登录的 Chrome 账户同步到其他设备。不要在共享的 Chrome 配置文件中保存不希望共享的密钥。

## 当前网页、选区与本地全文

### 总结当前网页

“总结当前网页”会优先使用 Readability 提取文章正文，并保留段落、块元素和 `<br>` 的多行边界；正文不可用时回退到页面可见文本。点击后，只有提取出的正文进入当前 AI 请求；页面标题和 URL 仅显示在本地聊天记录中，并被排除在 API 历史之外。摘要请求不会附带既有聊天历史，并会把网页内容标记为不可信数据。

单个提取文本字段最多保留 200,000 个字符；发送给 AI 的源文本最多保留 120,000 个字符，超出部分会截断并显示提示。

### 提取全文作为引用

“提取全文作为引用”读取当前页面可见的 `body.innerText`，并把结果放入侧边栏引用区。这个提取动作本身不会调用 AI。只有在之后点击“发送”时，引用和问题才会发往当前 AI Endpoint。

### 处理选中文字

先打开对应浏览器窗口的侧边栏，再在网页中选择文字；选区会出现在引用区。侧边栏关闭时，扩展不会捕获选区。可以复制、清除引用，也可以输入问题后发送。普通聊天请求最多携带最近 40,000 个字符的历史上下文。

## 正则多行提取

### 开启与使用

1. 打开“选项”页，在“高级设置”中启用侧边栏正则提取工具并保存通用设置。
2. 打开目标网页和侧边栏，点齿轮按钮进入“更多操作” → “正则提取工具”。
3. 默认源文本优先使用 Readability 正文；勾选“完整可见文本”后优先使用页面 `body.innerText`。首选内容不可用时会回退到另一种来源。
4. 输入表达式和 flags。匹配结果会在本地 Web Worker 中自动刷新；页面变化后可点“刷新网页内容”。
5. 点“复制匹配结果”复制结果。点“设计正则”只会把带有页面文本的设计请求填入聊天输入框；除非随后主动点击“发送”，否则不会调用 AI。发送时它按普通聊天处理，可能携带最近的对话上下文，也不会自动获得页面/链接摘要使用的历史隔离与网页安全指令。

### `m` 与 `s` 的区别

`m` 是 multiline 模式，只改变 `^` 和 `$`：它们可以匹配每一行的开头和结尾。`m` 不会让点号 `.` 跨越换行。

例如，页面文本为：

```text
标题：第一行
内容：第一段
继续第二行
结束
```

表达式 `^标题[:：][ \t]*(.+)$` 配合 flag `m`，可匹配“标题”这一行；捕获组输出 `第一行`。这里使用 `[ \t]`，避免 `\s` 把换行也当作空白。

`s` 是 dot-all 模式，让 `.` 也能匹配换行。表达式 `内容[:：][ \t]*(.*?)\n结束` 配合 flag `s`，可跨行捕获：

```text
第一段
继续第二行
```

需要同时用行首/行尾定位并跨行匹配时，可以组合 `ms`，例如 `^内容[:：][ \t]*(.*?)^结束$`。

### 表达式格式、flags 与捕获组

支持两种输入方式：

```text
^标题[:：][ \t]*(.+)$
```

并在 flags 输入框填写 `im`；或者直接使用 JavaScript literal 形式：

```text
/^标题[:：][ \t]*(.+)$/im
```

输入 literal 时，工具会把末尾 flags 同步到 flags 输入框。支持 `d g i m s u v y`，不能重复，`u` 与 `v` 不能同时使用；为了返回全部结果，执行时会自动补上 `g`。

如果表达式产生非空捕获组，工具输出捕获组内容；没有可输出的非空捕获组时，输出完整匹配。多个结果在预览区中分隔显示。

### 正则限制

- 源文本最多 200,000 个字符；表达式最多 10,000 个字符。
- 最多处理 1,000 次匹配并输出 1,000 个值。
- 匹配结果文本最多 100,000 个字符。
- 每次预览在独立 Worker 中运行，超过 1 秒即终止。
- 页面原文、表达式和匹配结果均在本地处理；复制结果不会向外发送数据。

## 链接总结

可以通过两种方式发起：

- 右键网页链接并选择“总结链接网页”；
- 把 `http://` 或 `https://` 链接拖入页面右下角的预览框，再点“总结此链接”。

扩展会打开一个非活动的临时标签页访问目标链接，优先用 Readability 提取正文，失败时回退到可见文本，然后关闭临时标签页并把内容交给当前 AI 总结。目标网站仍会像处理普通页面访问一样处理 Cookie、登录状态、访问日志及其自身隐私规则。

最多可同时运行 3 个链接提取任务，每个提取任务最长约 30 秒；超出的并发请求会直接显示错误，不会继续打开标签页。终态结果会在 `chrome.storage.session` 中暂存以便侧边栏恢复，完成约 10 分钟后尝试清理；有效的领取或重试等待会推迟清理。AI 成功返回非空结果后，任务记录会被立即确认并删除。

## 图片分析

1. 先打开侧边栏。
2. 右键网页图片并选择图片分析菜单项；图片预览会出现在侧边栏。
3. 输入希望模型完成的任务并点击“发送”；如果不输入文字，扩展会使用默认的图片描述请求。

图片在发送时由浏览器获取并编码，然后直接交给当前 AI Endpoint。图片上限为 10 MiB，当前模型及 Endpoint 必须支持多模态图像输入。图片预览或发送可能让图片所在网站看到浏览器对资源的访问；仅选择图片但不点击“发送”不会把图片提交给 AI。

## Prompt 与对话存档

### Prompt 模板

在侧边栏打开“更多操作” → “管理 Prompt”，可以新增和编辑模板，也可以删除自定义模板。模板中的 `{{text}}` 会在应用快捷方式时替换为当前选区；快捷方式只把处理后的内容放入输入框，不会自动发送。Prompt 模板保存在 `chrome.storage.local`。

### 历史与存档

- “分割当前对话”会把当前对话存档，并开始一段新对话。
- AI 回复旁的存档按钮可单独存档相邻的一组问答。
- “查看已存档对话”会打开存档页，可查看、继续对话、删除单个存档或清空全部存档。
- 侧边栏输入区旁的垃圾桶用于清除普通聊天历史；它与存档页的“清空所有存档”是不同操作。

普通聊天历史、Prompt 和存档保存在 `chrome.storage.local`。当前存档页不提供全文搜索。

## 数据何时离开浏览器

以下操作不会因为操作本身向 AI 发送内容；其中全文和正则处理完全在本地完成，图片预览仍可能请求图片源站：

- “提取全文作为引用”；
- 正则源文本读取、匹配预览与复制；
- 在侧边栏打开时捕获选区；
- 编辑 Prompt、查看普通历史或存档；
- 选择图片并显示预览，但尚未点击“发送”。

以下操作会直接从浏览器向配置的第三方 AI Endpoint 发出请求：

- 发送普通聊天、选区引用或全文引用；
- “总结当前网页”；
- 链接内容提取完成后的总结；
- 点击“发送”提交所选图片；
- 在正则工具中点“设计正则”后，再主动发送已生成的设计请求；该请求按普通聊天处理，可能同时携带最近的对话上下文；
- 在选项页点击“测试连接”。

链接总结还会先访问目标网站，图片分析会获取目标图片资源。数据不经过扩展开发者运营的中转服务器，但 AI 服务商、目标网站和 Chrome 同步服务会分别按其政策处理收到的数据。详细说明见[隐私政策](../privacy_policy/privacy_policy_zh.html)。

---

<a id="english"></a>

## English

This guide applies to extension v1.4.0 and requires Chrome 120 or later. Chat, page summaries, link summaries, and image analysis require an AI service configured by the user. Full visible-text extraction and regex previews can be used entirely inside the browser.

## Get started in five minutes

1. Install the extension from the Chrome Web Store. To load it from source, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository root.
2. Right-click the extension icon and choose **Options**. You may skip API setup if you only need local full-text or regex extraction.
3. Fill in **Add/Edit Configuration**, choose **Test Connection**, and then choose **Save Configuration**. The first saved configuration becomes active automatically; when several configurations exist, use **Set Active** in the list.
4. Click the extension icon in the browser toolbar to open the side panel.
5. Choose an action:
   - Select **Summarize Current Page** to extract the article and send it to the active AI service;
   - Select **Extract Full Text** to read visible page text locally;
   - Select text on the page, then ask a question or apply a prompt shortcut;
   - Use a link context menu or the drag preview to summarize a link;
   - Open **More Actions** to manage prompts, archives, and the regex tool.

The extension cannot read Chrome internal pages, the Chrome Web Store, or other pages where the browser prohibits extension injection. Switch to a regular `http://` or `https://` page in that case.

## Configure an AI API

The Options page can store several configurations and switch the active one at any time:

- **Configuration Name**: Optional and used only to identify the configuration. The extension generates one when this field is empty.
- **API Key**: Required and issued by the selected AI provider.
- **API Type**: Choose **Google Gemini** or **OpenAI-Compatible API**.
- **API Endpoint URL**: Required only for the OpenAI-compatible type. Enter the complete chat-completions URL that accepts a `POST` request, such as the provider's `/v1/chat/completions` endpoint, rather than its home page.
- **Model Name**: Required and must exactly match a model ID supported by the provider.
- **Test Connection**: Sends a very small request using the current form. A successful test does not save the configuration.
- **Save Configuration / Set Active**: Chat and AI tools use the active saved configuration.

The extension constructs the Gemini request URL from the model name. An OpenAI-compatible service must support the request format used by the extension: chat uses streaming responses, and image analysis requires a model and endpoint that accept image input.

API configurations, including API keys, are stored in `chrome.storage.sync` and may be synchronized to other devices through the signed-in Chrome account. Do not store a key in a shared Chrome profile if you do not want it synchronized.

## Current pages, selections, and local full text

### Summarize the current page

**Summarize Current Page** first uses Readability to extract the article while preserving multiline paragraph, block, and `<br>` boundaries. It falls back to visible page text when reader extraction is unavailable. Only the extracted body enters the active AI request; the page title and URL are shown in local chat history and excluded from API history. Summary requests exclude existing chat history and label webpage content as untrusted data.

Each extracted text field is limited to 200,000 characters. AI-bound source text is limited to 120,000 characters; the extension truncates larger input and displays a warning.

### Extract full text as a quote

**Extract Full Text** reads the current page's visible `body.innerText` and places it in the side panel's quote area. Extraction itself does not call an AI service. The quote and question leave the browser only after you select **Send**.

### Work with selected text

Open the side panel for the relevant browser window before selecting text on the page. The selection then appears in the quote area. The extension does not capture selections while that window has no connected side panel. You can copy or clear the quote, or submit it with a question. A normal chat request carries at most the most recent 40,000 characters of chat history.

## Multiline regex extraction

### Enable and use the tool

1. Open **Options**, enable the sidebar regex extraction tool under **Advanced Settings**, and save the general settings.
2. Open the target page and side panel, then choose the gear button → **More Actions** → **Regex Extract Tool**.
3. The source prefers the Readability article by default. Enable **Full visible text** to prefer the page's `body.innerText`. If the preferred source is unavailable, the tool falls back to the other one.
4. Enter a pattern and flags. A local Web Worker refreshes the preview automatically; choose **Refresh Page Content** after the page changes.
5. Choose **Copy Matches** to copy the result. **Design Regex** only fills the chat input with a design request that contains page text; it does not call AI unless you then choose **Send**. On send it behaves like ordinary chat, may include recent context, and does not automatically receive the history isolation or webpage-safety instruction used for page/link summaries.

### How `m` differs from `s`

`m` is multiline mode. It changes only `^` and `$`, allowing them to match the start and end of each line. It does not make dot `.` cross a newline.

For this page text:

```text
Title: First line
Content: First paragraph
Continued on the second line
End
```

The pattern `^Title:[ \t]*(.+)$` with flag `m` matches the title line, and its capture group outputs `First line`. `[ \t]` is used so whitespace matching cannot cross a line break.

`s` is dot-all mode and allows `.` to match newline characters. The pattern `Content:[ \t]*(.*?)\nEnd` with flag `s` captures across lines:

```text
First paragraph
Continued on the second line
```

Combine them as `ms` when a pattern needs both per-line anchors and cross-line dots, for example `^Content:[ \t]*(.*?)^End$`.

### Pattern formats, flags, and captures

You can enter a plain pattern:

```text
^Title:[ \t]*(.+)$
```

and put `im` in the flags field, or use a JavaScript literal:

```text
/^Title:[ \t]*(.+)$/im
```

When a literal is entered, the tool synchronizes its trailing flags into the flags field. Supported flags are `d g i m s u v y`; flags cannot repeat, and `u` and `v` cannot be combined. Execution adds `g` automatically so all matches can be returned.

When a pattern produces non-empty capture groups, the tool outputs the captured values. If there is no non-empty captured value, it outputs the full match. Multiple results are separated in the preview.

### Regex limits

- Source text is limited to 200,000 characters and a pattern to 10,000 characters.
- The tool processes at most 1,000 matches and outputs at most 1,000 values.
- Result text is limited to 100,000 characters.
- Each preview runs in a disposable Worker and is stopped after one second.
- Page text, patterns, previews, and copied matches are processed locally and are not sent elsewhere by those actions.

## Link summaries

Start a link summary in either way:

- Right-click a page link and choose **Summarize Link**;
- Drag an `http://` or `https://` link into the preview in the lower-right corner, then choose **Summarize This Link**.

The extension opens an inactive temporary tab to visit the link, extracts the article with Readability or falls back to visible text, closes the tab, and sends the result to the active AI service for summarization. The target site still processes cookies, login state, access logs, and the visit itself under its own policies.

At most three link extractions run concurrently, and each extraction has a timeout of about 30 seconds. Requests beyond the concurrency limit show an error without opening another tab. A terminal result remains in `chrome.storage.session` for recovery and is scheduled for cleanup about ten minutes after completion; an active claim or retry delay postpones cleanup. A successful non-empty AI response acknowledges and removes the job immediately.

## Image analysis

1. Open the side panel first.
2. Right-click an image and choose the image-analysis menu item. Its preview appears in the side panel.
3. Enter an instruction and choose **Send**. With no instruction, the extension uses a default image-description request.

On send, the browser fetches and encodes the image and submits it directly to the active AI endpoint. Images are limited to 10 MiB, and the active model and endpoint must support multimodal image input. Previewing or sending may cause the image host to see a resource request. Selecting an image without choosing **Send** does not submit it to AI.

## Prompts and conversation archives

### Prompt templates

Choose **More Actions** → **Manage Prompts** to add and edit templates, and to delete custom templates. A template's `{{text}}` placeholder is replaced by the current selection when its shortcut is applied. A shortcut only fills the chat input and does not send automatically. Prompt templates are stored in `chrome.storage.local`.

### History and archives

- **Split Chat** archives the current conversation and starts a new one.
- The archive action beside an AI answer can archive the adjacent question-and-answer pair.
- **Archived Chats** opens the archive page, where you can read or continue a conversation, delete one archive, or clear all archives.
- The trash button beside the side-panel input clears ordinary chat history. It is separate from **Clear All Archives** on the archive page.

Ordinary chat history, prompts, and archives are stored in `chrome.storage.local`. The current archive page does not provide full-text search.

## When data leaves the browser

These actions do not send content to AI by themselves. Full-text and regex work is entirely local; an image preview may still request the image host:

- **Extract Full Text**;
- Reading regex source text, previewing matches, and copying matches;
- Capturing a selection while the side panel is open;
- Editing prompts or viewing ordinary history and archives;
- Selecting and previewing an image without choosing **Send**.

These actions send a request directly from the browser to the configured third-party AI endpoint:

- Sending normal chat, selected text, or a full-text quote;
- **Summarize Current Page**;
- Summarization after a link has been extracted;
- Choosing **Send** with a selected image;
- Sending the request prepared by **Design Regex**; it is handled as ordinary chat and may also include recent conversation context;
- Choosing **Test Connection** on the Options page.

A link summary also visits the target website first, and image analysis fetches the target image resource. Data does not pass through a relay server operated by the extension developer, but the AI provider, target site, and Chrome synchronization service process the data they receive under their respective policies. See the [Privacy Policy](../privacy_policy/index.html) for details.
