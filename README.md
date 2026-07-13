# Smart Sidebar Assistant / 智能侧边栏助手

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](./manifest.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[English](#english) | [中文](#chinese)

---

<a name="english"></a>
## 🇬🇧 English Introduction

**Smart Sidebar Assistant** seamlessly integrates powerful Large Language Model (LLM) capabilities into your browser sidebar, revolutionizing your web browsing, information retrieval, and content creation experience.

### ✨ Key Features

#### 1. Deep Interaction & AI Chat
* **Streaming Response**: AI responses are displayed in real-time with a typewriter effect for fluid interaction.
* **Continuous Conversation**: Engage in continuous chats with configured models (Gemini, GPT-4o, etc.) with context awareness.
* **Multi-Model Support**: Easily switch between different AI models in the options page.
* **Robust Error Handling**: Friendly error messages for invalid API keys, network issues, or quota limits.

#### 2. Powerful Content Processing
* **One-Click Summarization**: Extract the current page's main article with [Mozilla's Readability.js](https://github.com/mozilla/readability), preserving paragraph, block, and `<br>` boundaries as multiline plain text, then send it to your configured AI service; if reader extraction is unavailable, the extension falls back to visible page text.
* **Link Analysis**: Drag a link to the preview window or use the context menu. The extension opens an inactive temporary tab, extracts the article with Readability (falling back to visible text), and closes the tab when the job finishes or times out. Up to three link extractions may run concurrently; additional requests are rejected with a visible error instead of opening more tabs.
* **Image Analysis**: Analyze images on webpages using Gemini's multimodal capabilities via the context menu.
* **Full Visible Text Extraction**: Read the current page's visible `body.innerText` and place it in the sidebar as a local quote. This action does not require an API configuration; the text is sent externally only if you later submit it to an AI service.
* **Advanced Regex Extraction**: Preview reader text or full visible text and run JavaScript regular expressions—including multiline `m` and dot-all `s` modes—locally in a Web Worker. A one-second timeout and result limits prevent runaway expressions from freezing the sidebar.

#### 3. Efficient Workflow
* **Prompt Templates**: Manage custom prompt templates. Use the `{{text}}` placeholder to automatically fill in selected text.
* **Seamless Selection**: While the sidebar is open, select text on a webpage to quote it for immediate processing. Selection capture is disabled when no sidebar is connected to that browser window.
* **Chat Management**: Split conversations to archive current context and start fresh. Manage and view archived chats anytime in the refreshed archive workspace.
* **User Experience**: Auto-clearing of quoted text after prompt application, and auto-generated configuration names.

#### 4. Customization & Internationalization
* **I18n Support**: Switch between **English** and **Chinese** interfaces.
* **Dark Mode**: Fully supports system-wide Dark Mode for comfortable night-time usage.
* **Flexible API Config**: Support for Google Gemini and OpenAI-compatible APIs (custom endpoints allowed).
* **Connection Testing**: Test your API configuration connectivity directly in the settings page.

### 🚀 Installation

**Requirement:** Chrome 120 or later. Version 1.4.0 uses the Manifest V3 Side Panel, session storage, alarms, and Web Worker workflow tested against this baseline.

#### Method 1: Install from Chrome Web Store (Recommended)

[**👉 Click here to install from the Chrome Web Store**](https://chromewebstore.google.com/detail/eomfjfhjglppmkefbnhfmmdfciemlfie?utm_source=item-share-cb)

---
#### Method 2: Load from Source (for Developers)

1.  Clone or download this repository.
2.  Open the extensions page in Chrome 120+ (`chrome://extensions`).
3.  Enable **Developer mode**.
4.  Click **Load unpacked** and select the project directory.
5.  Right-click the extension icon and select **Options** to configure an API key for summaries and chat. Local full-text and regex extraction work without an API configuration.

---

### 🔐 Permissions & Data Flow

* **`activeTab` + `scripting`**: Run the user-requested extractor in the selected tab.
* **`tabs`**: Resolve the correct tab/window and create, monitor, then close the inactive temporary tab used for link extraction.
* **`alarms`**: Enforce link-extraction timeouts, wake expired delivery leases/retries, and clean up completed job records even if the service worker sleeps.
* **`storage`**: Sync API/regex settings, store local chat history, and temporarily retain pending link jobs in `chrome.storage.session` so the sidebar can recover them.
* **`contextMenus` + `sidePanel`**: Provide link/image actions and open the result in the initiating window's sidebar.
* **`<all_urls>` host access**: Support extraction and opt-in selection/link tools on arbitrary user-chosen pages, plus user-configured OpenAI-compatible endpoints. A host permission allows access; it does not by itself send page content anywhere.
* Page extraction and regex matching happen in the browser. Page/link summaries and chat content are sent directly from your browser to the AI endpoint you configured; they do not pass through a developer-operated server.
* **Resource bounds**: Extracted text fields are limited to 200,000 characters. AI-bound text is truncated after 120,000 source characters, ordinary chat context sent with a request is limited to the most recent 40,000 characters, and fetched images are limited to 10 MB. Regex previews are limited to 1,000 matches and 100,000 output characters. Link-job session data has a 7 MB internal budget with space reserved before opening a tab. AI requests stop after two minutes total or 30 seconds without stream data.
* **Summary isolation and recovery**: Page/link summary requests exclude existing chat history and include a safety instruction that treats webpage content as untrusted data. A terminal link result remains in session storage for recovery for up to about 10 minutes; claiming does not delete it. After a non-empty AI response completes successfully, the sidebar acknowledges and removes the record. Failed AI delivery releases the claim for a later retry.

---

### 📝 Changelog

#### v1.4.0 (Current)
* **Unified extraction**: Readability summaries now share a structured extraction pipeline with multiline block-boundary preservation, visible-text fallback, source metadata, hard size limits, and explicit truncation warnings.
* **Local full-text and regex tools**: Full visible text extraction no longer requires an API configuration. Regex previews run locally in a disposable Worker with a one-second timeout and bounded output.
* **Resilient link jobs**: Link summaries use inactive temporary tabs, window-scoped request IDs, session-backed claim/ack recovery, a limit of three concurrent extractions, a 30-second extraction timeout, and roughly 10-minute terminal-result retention. Successful AI delivery acknowledges and removes the corresponding job.
* **Privacy and safety**: Text selection is captured only while a sidebar is connected in that browser window, and model Markdown is rendered through an HTML allowlist sanitizer.
* **Platform baseline**: Raised the minimum supported browser version to Chrome 120 and documented each requested permission.

#### v1.3.2
* **🧭 Setup Onboarding Fixes**:
    * Added a clearer first-run onboarding card when no API configuration exists, guiding users directly to the Options page.
    * Improved handling for incomplete API configurations so missing API keys, endpoints, or model names are explained in the sidebar before chat actions run.
* **💬 Chat Input Improvements**:
    * The chat input now auto-resizes while typing, making longer prompts easier to compose.
    * Refined the chat input placeholder for both English and Chinese interfaces.

#### v1.3.1
* **🧰 Advanced Extraction Tools**:
    * Added an optional sidebar Regex Extract Tool. Enable it in Options, preview page content, adjust a JavaScript regex, ask AI to design a regex from the tool, and copy matches to the clipboard.
    * Kept “Extract Full Text” focused on quoting page text for chat, so regex extraction is a separate advanced workflow.
* **🗂 Archive Refresh**:
    * Redesigned the archive page with a cleaner two-pane workspace, archive count, polished message cards, and improved dark mode.
* **🚀 Experience Upgrades**:
    * **Smoother Streaming**: Fixed the jitter issue during AI responses for a silky-smooth reading experience.
    * **Smart Auto-Scroll**: The chat window now intelligently scrolls with AI output but pauses automatically when you scroll up to read history.
* **🔗 Enhanced Link Summarization**:
    * **Drag & Drop Preview**: Restored the link drag-and-drop preview! Drag any link to the floating window in the bottom-right to summarize it and auto-open the sidebar.
    * **Context Menu**: Added "Summarize Link" to the context menu for easier access.
* **📝 Detail Improvements**:
    * Page summary requests now include the page title and URL in the chat history for better context.

#### v1.3.0
* **🌍 Internationalization**: Added full support for English and Chinese languages. Users can switch languages in the Options page.
* **🌙 Dark Mode**: The interface now automatically adapts to the system's dark/light color scheme.
* **🔌 Connection Test**: Added a "Test Connection" button in the API configuration page to verify settings before saving.
* **✨ UX Improvements**:
    * Automatically clear the quoted text preview after applying a prompt shortcut.
    * Auto-generate a configuration name (timestamped) if left empty during setup.
    * Preset prompts (Translate/Summarize) now adapt to the selected interface language.

#### v1.2.1
* Initial public release features (Page summary, Link Drag-and-Drop, Chat archiving).

---

<a name="chinese"></a>
## 🇨🇳 中文介绍

**智能侧边栏助手** 将强大的大型语言模型（LLM）能力无缝集成到您浏览器侧边栏，旨在革新您的网页浏览、信息获取和内容创作体验。

### ✨ 核心功能

#### 1. 深度交互 & AI 对话
* **流式响应**: AI 的回答以打字机效果逐字显示，交互流畅。
* **流畅对话**: 支持上下文记忆，与 Gemini、GPT 系列等模型进行连续对话。
* **多模型支持**: 在选项中轻松配置和切换不同的 AI 模型。
* **智能错误提示**: 清晰友好的错误提示，帮助快速定位网络或 Key 问题。

#### 2. 强大的内容处理
* **一键网页总结**: 使用 [Mozilla's Readability.js](https://github.com/mozilla/readability) 提取当前页面正文，将段落、块元素和 `<br>` 边界保留为多行纯文本后发送至您配置的 AI 服务；若正文提取不可用，则回退到页面完整可见文本。
* **链接深度解析**: 拖拽链接至右下角预览窗口，或通过右键菜单发起任务。插件会打开一个非活动的临时后台标签页，使用 Readability 提取正文（失败时回退到可见文本），并在完成或超时后关闭标签页。最多同时运行 3 个链接提取任务；超出的请求会显示错误，不会继续打开标签页。
* **图片识别与分析**: 利用 Gemini 多模态能力分析网页图片。
* **网页可见全文引用**: 读取当前页面的可见 `body.innerText` 并在侧边栏中作为本地引用。此操作无需 API 配置；只有在您后续主动发送给 AI 时，文本才会离开本地浏览器。
* **高级正则提取**: 可预览 Readability 正文或完整可见文本，并在本地 Web Worker 中执行 JavaScript 正则，包括多行 `m` 与 dot-all `s` 模式。1 秒超时和结果上限可避免异常表达式卡死侧边栏。

#### 3. 高效工作流
* **Prompt 模板**: 自定义快捷指令。支持 `{{text}}` 占位符，自动填充网页选中文本。
* **无缝选文处理**: 仅当当前浏览器窗口的侧边栏已打开时，网页选中文本才会进入引用区域；侧边栏关闭后不会捕获选区。
* **对话管理**: 支持分割对话、对话存档与历史回溯，并提供更清爽的存档工作区。
* **体验优化**: 应用快捷指令后自动清除引用文本，配置名称支持自动生成。

#### 4. 高度可定制化
* **多语言支持**: 支持 **中文** 和 **英文** 界面切换。
* **夜间模式**: 完美支持系统级深色模式 (Dark Mode)。
* **灵活 API 配置**: 支持 Google Gemini 及任何 OpenAI 兼容接口（可自定义 Endpoint）。
* **连接测试**: 配置页面新增“测试连接”功能，确保 API 设置正确。

### 🚀 安装与配置

**系统要求：** Chrome 120 或更高版本。v1.4.0 以该版本作为 Manifest V3 侧边栏、会话存储、定时任务和 Web Worker 工作流的最低支持基线。

#### 方法一：从 Chrome 网上应用店安装（推荐）

[**👉 点击此处从 Chrome 网上应用店安装**](https://chromewebstore.google.com/detail/eomfjfhjglppmkefbnhfmmdfciemlfie?utm_source=item-share-cb)

---
#### 方法二：源码加载（适合开发者）

1.  下载或克隆本项目。
2.  使用 Chrome 120+ 打开扩展管理页面 (`chrome://extensions`)。
3.  开启 **“开发者模式”**。
4.  点击 **“加载已解压的扩展程序”**，选择项目文件夹。
5.  右键点击扩展图标，选择 **“选项”**，为总结和聊天配置 API Key。本地可见全文与正则提取无需 API 配置。

---

### 🔐 权限与数据流说明

* **`activeTab` + `scripting`**：在用户指定的标签页中按需运行提取器。
* **`tabs`**：定位正确的窗口/标签页，并创建、监控和关闭用于链接提取的非活动临时标签页。
* **`alarms`**：即使后台 Service Worker 休眠，也能执行链接提取超时、领取租约/重试唤醒和任务记录清理。
* **`storage`**：同步 API/正则设置、在本地保存聊天记录，并使用 `chrome.storage.session` 临时保存待处理链接任务，以便侧边栏恢复领取。
* **`contextMenus` + `sidePanel`**：提供链接/图片右键操作，并在发起操作的窗口中打开侧边栏。
* **`<all_urls>` 主机权限**：支持在用户选择的任意网页上进行提取及可选的选区/链接操作，也支持用户自定义的 OpenAI 兼容 Endpoint。获得主机权限本身不会自动向外发送网页内容。
* 页面提取和正则匹配在浏览器本地进行；页面/链接总结和聊天内容会由浏览器直接发送到您配置的 AI Endpoint，不经过开发者运营的服务器。
* **资源上限**：每个提取文本字段最多保留 200,000 字符；发送给 AI 的文本会在 120,000 个源字符后截断；普通聊天请求最多携带最近 40,000 字符的历史上下文；下载处理的图片上限为 10 MB。正则预览最多返回 1,000 个匹配和 100,000 个结果字符。链接任务会话数据使用 7 MB 内部预算，并在打开标签页前预留结果空间；AI 请求总时限为 2 分钟，流式响应连续 30 秒无数据时会终止。
* **摘要隔离与恢复**：页面/链接摘要请求不会携带既有聊天历史，并附带将网页内容视为不可信数据的安全指令。链接终态结果会在会话存储中保留最多约 10 分钟供恢复；“领取”本身不会删除记录。AI 成功返回非空响应后，侧边栏才确认并删除任务；AI 发送失败时会释放领取状态以便稍后重试。

---

### 📝 更新日志 (Changelog)

#### v1.4.0 (Current)
* **统一提取管线**：Readability 摘要与可见文本回退采用统一结构化结果，保留正文块边界的多行结构，并包含来源元数据、硬性大小上限和明确的截断提示。
* **本地全文与正则工具**：可见全文提取不再要求 API 配置；正则预览在一次性 Worker 中本地运行，具有 1 秒超时和输出上限。
* **可靠的链接任务**：链接总结使用非活动临时标签页、窗口级请求 ID、会话级领取/确认恢复协议、最多 3 个并发提取、30 秒提取超时与约 10 分钟终态保留；AI 成功返回后会确认并删除对应任务。
* **隐私与安全**：仅在对应窗口侧边栏已连接时捕获选区；模型 Markdown 通过 HTML allowlist 清洗后再渲染。
* **平台基线**：最低支持版本提升至 Chrome 120，并补充各项权限用途说明。

#### v1.3.2
* **🧭 配置引导修复**:
    * 新增更清晰的首次使用引导卡片，在尚未创建 API 配置时可直接进入选项页完成设置。
    * 优化不完整 API 配置的处理逻辑，在聊天操作执行前提示缺少的 API Key、Endpoint 或模型名称。
* **💬 聊天输入优化**:
    * 聊天输入框现在会随输入内容自动增高，编写长 Prompt 更顺手。
    * 优化中英文界面的聊天输入占位提示。

#### v1.3.1
* **🧰 高级提取工具**:
    * 新增可选的侧边栏正则提取工具。可在选项页启用，预览网页内容、调试 JavaScript 正则、调用 AI 辅助设计正则，并复制匹配结果。
    * “提取全文作为引用”保持原有聊天引用用途，正则提取作为独立高级工作流提供。
* **🗂 存档页焕新**:
    * 重设计存档页面，提供更清爽的双栏工作区、存档数量显示、消息卡片与深色模式优化。
* **🚀 体验升级**:
    * **流畅输出**: 彻底修复了 AI 回复时的抖动问题，带来丝般顺滑的阅读体验。
    * **智能滚屏**: 聊天窗口现在会智能跟随 AI 输出滚动，但当您向上查看历史时会自动暂停，互不打扰。
* **🔗 链接总结增强**:
    * **拖拽预览回归**: 重新上线了链接拖拽预览功能！拖动任意链接到右下角悬浮窗，即可快速总结，并自动打开侧边栏。
    * **右键菜单**: 新增“总结链接网页”右键菜单项，操作更便捷。
* **📝 细节优化**:
    * 网页总结请求现在会在历史记录中包含页面标题和 URL，方便回溯。

#### v1.3.0
* **🌍 国际化支持**: 全面支持中英文界面切换，可在选项页进行设置。
* **🌙 夜间模式**: 侧边栏界面现在会根据系统的深色/浅色模式自动调整配色。
* **🔌 连接测试**: 选项页面新增“测试连接”按钮，方便用户在保存前验证 API 配置是否通畅。
* **✨ 体验优化**:
    * 点击 Prompt 快捷方式并应用后，自动清除下方的引用文本，防止重复发送。
    * 添加配置时，如果未填写名称，系统将自动生成一个带时间戳的默认名称。
    * 预设的 Prompt（翻译/总结）现在会跟随界面语言自动切换。

#### v1.2.1
* 基础功能发布（网页总结、链接拖拽预览、对话存档等）。

---

## 🔧 技术栈 / Tech Stack
* HTML, CSS, JavaScript (ES6+)
* Chrome Extension Manifest V3 (Chrome 120+)
* Side Panel API, Context Menus API, Storage API, Alarms API, Web Workers
* [Mozilla/Readability.js](https://github.com/mozilla/readability)
* [Marked.js](https://marked.js.org/)
