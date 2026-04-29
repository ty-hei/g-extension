# Smart Sidebar Assistant / 智能侧边栏助手

[![Version](https://img.shields.io/badge/version-1.3.1-blue.svg)](./manifest.json)
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
* **One-Click Summarization**: Instantly summarize the current webpage's core content using [Mozilla's Readability.js](https://github.com/mozilla/readability).
* **Link Analysis**: Drag and drop links to the preview window (bottom right) or use the context menu to summarize linked content without opening new tabs.
* **Image Analysis**: Analyze images on webpages using Gemini's multimodal capabilities via the context menu.
* **Full Text Extraction**: Extract and quote the full text of a webpage for further questioning.

#### 3. Efficient Workflow
* **Prompt Templates**: Manage custom prompt templates. Use the `{{text}}` placeholder to automatically fill in selected text.
* **Seamless Selection**: Select text on any webpage to automatically quote it in the sidebar for immediate processing.
* **Chat Management**: Split conversations to archive current context and start fresh. Manage and view archived chats anytime.
* **User Experience**: Auto-clearing of quoted text after prompt application, and auto-generated configuration names.

#### 4. Customization & Internationalization
* **I18n Support**: Switch between **English** and **Chinese** interfaces.
* **Dark Mode**: Fully supports system-wide Dark Mode for comfortable night-time usage.
* **Flexible API Config**: Support for Google Gemini and OpenAI-compatible APIs (custom endpoints allowed).
* **Connection Testing**: Test your API configuration connectivity directly in the settings page.

### 🚀 Installation

#### Method 1: Install from Chrome Web Store (Recommended)

[**👉 Click here to install from the Chrome Web Store**](https://chromewebstore.google.com/detail/eomfjfhjglppmkefbnhfmmdfciemlfie?utm_source=item-share-cb)

---
#### Method 2: Load from Source (for Developers)

1.  Clone or download this repository.
2.  Open Chrome/Edge Extensions page (`chrome://extensions`).
3.  Enable **Developer mode**.
4.  Click **Load unpacked** and select the project directory.
5.  Right-click the extension icon, select **Options**, and configure your API Key.

---

### 📝 Changelog

#### v1.3.1 (Current)
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
* **一键网页总结**: 基于 [Mozilla's Readability.js](https://github.com/mozilla/readability) 算法，精准提取并总结网页核心内容。
* **链接深度解析**: 拖拽链接至右下角预览窗口，或通过右键菜单，直接总结链接指向的内容。
* **图片识别与分析**: 利用 Gemini 多模态能力分析网页图片。
* **网页全文引用**: 一键提取全文作为引用，方便基于全文提问。

#### 3. 高效工作流
* **Prompt 模板**: 自定义快捷指令。支持 `{{text}}` 占位符，自动填充网页选中文本。
* **无缝选文处理**: 网页选中文本自动进入侧边栏引用区域。
* **对话管理**: 支持分割对话、对话存档与历史回溯。
* **体验优化**: 应用快捷指令后自动清除引用文本，配置名称支持自动生成。

#### 4. 高度可定制化
* **多语言支持**: 支持 **中文** 和 **英文** 界面切换。
* **夜间模式**: 完美支持系统级深色模式 (Dark Mode)。
* **灵活 API 配置**: 支持 Google Gemini 及任何 OpenAI 兼容接口（可自定义 Endpoint）。
* **连接测试**: 配置页面新增“测试连接”功能，确保 API 设置正确。

### 🚀 安装与配置

#### 方法一：从 Chrome 网上应用店安装（推荐）

[**👉 点击此处从 Chrome 网上应用店安装**](https://chromewebstore.google.com/detail/eomfjfhjglppmkefbnhfmmdfciemlfie?utm_source=item-share-cb)

---
#### 方法二：源码加载（适合开发者）

1.  下载或克隆本项目。
2.  打开浏览器扩展管理页面 (`chrome://extensions`)。
3.  开启 **“开发者模式”**。
4.  点击 **“加载已解压的扩展程序”**，选择项目文件夹。
5.  右键点击扩展图标，选择 **“选项”** 配置 API Key。

---

### 📝 更新日志 (Changelog)

#### v1.3.1 (Current)
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
* Chrome Extension Manifest V3
* Side Panel API, Context Menus API, Storage API
* [Mozilla/Readability.js](https://github.com/mozilla/readability)
* [Marked.js](https://marked.js.org/)