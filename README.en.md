# Smart Sidebar Assistant

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](./manifest.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**An intelligent assistant that seamlessly integrates the power of Large Language Models (LLMs) into your browser's sidebar, designed to revolutionize your web browsing, information retrieval, and content creation experience.**

---

## ✨ Core Features

Smart Sidebar Assistant is more than just a simple chat window; it's an efficient toolkit integrated with multiple practical features.

#### 1. Deep Interaction & AI Conversations
- **Streamed Responses**: AI answers appear word by word, providing instant feedback and a smoother interaction without waiting for the full response.
- **Fluent Conversations**: Engage in real-time, continuous dialogues with any language model you configure (like Gemini, GPT series, etc.).
- **Context-Aware**: The conversation remembers previous interactions, enabling more intelligent and coherent communication.
- **Multi-Model Support**: Easily configure and switch between different AI models in the options to suit various needs.
- **Smart Error Handling**: Provides clear, friendly error messages for invalid API keys, network interruptions, or exceeded quotas to help you quickly identify issues.

#### 2. Powerful Content Processing
- **One-Click Page Summary**: Extract the current page's main article with [Mozilla's Readability.js](https://github.com/mozilla/readability), preserving paragraph, block, and `<br>` boundaries as multiline plain text, then send it to your configured AI service. If reader extraction is unavailable, the extension falls back to visible page text.
- **Deep Link Analysis**: Drag a link to the preview window or use the context menu. The extension opens an inactive temporary tab, extracts the article with Readability (falling back to visible text), and closes the tab when the job finishes or times out. Up to three link extractions may run concurrently; additional requests are rejected with a visible error instead of opening more tabs.
- **Image Recognition & Analysis**: Analyze any image on a webpage using the context menu, leveraging the multimodal capabilities of Gemini.
- **Full Visible Text Quoting**: Read the current page's visible `body.innerText` and place it in the sidebar as a local quote. This action does not require an API configuration; the text is sent externally only if you later submit it to an AI service.
- **Advanced Regex Extraction**: Preview reader text or full visible text and run JavaScript regular expressions—including multiline `m` and dot-all `s` modes—locally in a Web Worker. A one-second timeout and result limits prevent runaway expressions from freezing the sidebar.

#### 3. Efficient Workflow
- **Prompt Templates & Shortcuts**:
    - **Custom Templates**: Create, edit, and save your frequently used prompt templates on a dedicated management page.
    - **`{{text}}` Placeholder**: Use the `{{text}}` placeholder in your templates. When you select text on a webpage, the template will automatically populate it, greatly improving the efficiency of repetitive tasks.
    - **Quick Invocation**: Frequently used templates are displayed as shortcut buttons in the sidebar for one-click access.
- **Seamless Text Handling**: While the sidebar is open, selected webpage text appears in its quote area. Selection capture is disabled when no sidebar is connected to that browser window.
- **Conversation Management**:
    - **Split Conversation**: When switching topics, you can split the current conversation with one click, archiving it and starting a new session.
    - **Archive Conversations**: Archive important conversations or individual Q&A pairs for future reference in a refreshed two-pane archive workspace.
    - **History Tracking**: All non-temporary conversations are recorded and can be managed and searched on the archive page.

#### 4. High Customizability
- **Flexible API Configuration**: Supports adding multiple API configurations (for Google Gemini or any OpenAI-compatible API) and setting any one as active at any time.
- **Custom Models**: You can specify the exact model name for each API configuration (e.g., `gemini-1.5-flash-latest`, `gpt-4o`).
- **OpenAI Compatibility**: For OpenAI-compatible APIs, you can customize the API Endpoint URL to connect to any service that adheres to the standard.
- **Advanced Feature Toggle**: Keep the regex extraction tool hidden by default and enable it only when needed from the Options page.

## 🚀 Installation & Configuration

**Requirement:** Chrome 120 or later. Version 1.4.0 uses the Manifest V3 Side Panel, session storage, alarms, and Web Worker workflow tested against this baseline.

#### Method 1: Install from Chrome Web Store (Recommended)

[**👉 Click here to install from the Chrome Web Store**](https://chromewebstore.google.com/detail/eomfjfhjglppmkefbnhfmmdfciemlfie?utm_source=item-share-cb)

After installation, proceed to **Step 2** if you want to use AI summaries or chat. Local full-text and regex extraction do not require an API key.

---
#### Method 2: Load from Source (for Developers)

##### Step 1: Load the Extension
1.  Download or clone all project files to your local machine.
2.  Open `chrome://extensions` in Chrome 120 or later.
3.  Enable **"Developer mode"** in the top right corner.
4.  Click "Load unpacked" and select the project folder you downloaded.

##### Step 2: Configure the API
1.  After installation, right-click the Smart Sidebar Assistant icon in your browser's toolbar and select "Options".
2.  On the configuration page, click "Add/Edit Configuration".
3.  Fill in the following information:
    - **Configuration Name**: Give your configuration an easily recognizable name (e.g., "My Gemini Key").
    - **API Key**: Paste the API key you obtained from your AI service provider.
    - **API Type**: Choose "Google Gemini" or "OpenAI-Compatible API".
    - **API Endpoint URL**: (Required only for OpenAI-compatible type) Enter the service's endpoint address.
    - **Model Name**: Enter the specific model ID you wish to use.
4.  Save the configuration and set it as active to use summaries and chat. Local full-text and regex extraction remain available without an API configuration.

## 🛠️ How to Use
- **Open Sidebar**: Click the extension icon in the browser toolbar.
- **Summarize/Analyze**: Use “Summarize Current Page” in the sidebar, right-click a link to summarize that link, or right-click an image to analyze it.
- **Process Text**: Open the sidebar, then select text on a webpage to place it in the quote area.
- **Summarize Links**: Drag a link from a webpage to the preview box that appears in the bottom-right corner, then click summarize.
- **Extract Full Visible Text**: Use “Extract Full Text” to create a local quote without calling an AI service.
- **Extract with Regex**: Enable the regex tool in Options, open it from the sidebar's More Actions menu, refresh page content, adjust your pattern and flags, then copy the matched result.

## 🔐 Permissions & Data Flow

- **`activeTab` + `scripting`**: Run the user-requested extractor in the selected tab.
- **`tabs`**: Resolve the correct tab/window and create, monitor, then close the inactive temporary tab used for link extraction.
- **`alarms`**: Enforce link-extraction timeouts, wake expired delivery leases/retries, and clean up completed job records even if the service worker sleeps.
- **`storage`**: Sync API/regex settings, store local chat history, and temporarily retain pending link jobs in `chrome.storage.session` so the sidebar can recover them.
- **`contextMenus` + `sidePanel`**: Provide link/image actions and open results in the initiating window's sidebar.
- **`<all_urls>` host access**: Support extraction and opt-in selection/link tools on arbitrary user-chosen pages, plus user-configured OpenAI-compatible endpoints. A host permission allows access; it does not by itself send page content anywhere.
- Page extraction and regex matching happen in the browser. Page/link summaries and chat content are sent directly from your browser to the AI endpoint you configured; they do not pass through a developer-operated server.
- **Resource bounds**: Extracted text fields are limited to 200,000 characters. AI-bound text is truncated after 120,000 source characters, ordinary chat context sent with a request is limited to the most recent 40,000 characters, and fetched images are limited to 10 MB. Regex previews are limited to 1,000 matches and 100,000 output characters. Link-job session data has a 7 MB internal budget with space reserved before opening a tab. AI requests stop after two minutes total or 30 seconds without stream data.
- **Summary isolation and recovery**: Page/link summary requests exclude existing chat history and include a safety instruction that treats webpage content as untrusted data. A terminal link result remains in session storage for recovery for up to about 10 minutes; claiming does not delete it. After a non-empty AI response completes successfully, the sidebar acknowledges and removes the record. Failed AI delivery releases the claim for a later retry.

## 🔧 Tech Stack
- **Core**: HTML, CSS, JavaScript (ES6+)
- **Browser APIs**: Chrome Extension Manifest V3 (Chrome 120+), Side Panel API, Context Menus API, Storage API, Alarms API, Web Workers
- **Content Extraction**: [Mozilla/Readability.js](https://github.com/mozilla/readability)
- **Markdown Rendering**: [Marked.js](https://marked.js.org/)

## 📝 Changelog

#### v1.4.0 (Current)
- **Unified extraction**: Readability summaries now share a structured extraction pipeline with multiline block-boundary preservation, visible-text fallback, source metadata, hard size limits, and explicit truncation warnings.
- **Local full-text and regex tools**: Full visible text extraction no longer requires an API configuration. Regex previews run locally in a disposable Worker with a one-second timeout and bounded output.
- **Resilient link jobs**: Link summaries use inactive temporary tabs, window-scoped request IDs, session-backed claim/ack recovery, a limit of three concurrent extractions, a 30-second extraction timeout, and roughly 10-minute terminal-result retention. Successful AI delivery acknowledges and removes the corresponding job.
- **Privacy and safety**: Text selection is captured only while a sidebar is connected in that browser window, and model Markdown is rendered through an HTML allowlist sanitizer.
- **Platform baseline**: Raised the minimum supported browser version to Chrome 120 and documented each requested permission.

#### v1.3.2
- **Setup Onboarding Fixes**:
    - Added a clearer first-run onboarding card when no API configuration exists, guiding users directly to the Options page.
    - Improved handling for incomplete API configurations so missing API keys, endpoints, or model names are explained in the sidebar before chat actions run.
- **Chat Input Improvements**:
    - The chat input now auto-resizes while typing, making longer prompts easier to compose.
    - Refined the chat input placeholder for both English and Chinese interfaces.

#### v1.3.1
- **Advanced Extraction Tools**:
    - Added an optional sidebar Regex Extract Tool. Enable it in Options, preview page content, adjust a JavaScript regex, ask AI to design a regex from the tool, and copy matches to the clipboard.
    - Kept “Extract Full Text” focused on quoting page text for chat, so regex extraction is a separate advanced workflow.
- **Archive Refresh**:
    - Redesigned the archive page with a cleaner two-pane workspace, archive count, polished message cards, and improved dark mode.
- **Experience Upgrades**:
    - Fixed jitter during streamed AI responses.
    - Added smarter auto-scroll behavior that follows AI output while pausing when you scroll up to read history.
- **Enhanced Link Summarization**:
    - Restored link drag-and-drop preview from the bottom-right floating window.
    - Added the "Summarize Link" context menu action.
- **Detail Improvements**:
    - Page summary requests now include the page title and URL in chat history for better context.

#### v1.3.0
- Added English and Chinese interface switching.
- Added system dark mode support.
- Added API configuration connection testing.
- Improved prompt shortcut cleanup, default configuration naming, and localized preset prompts.

#### v1.2.1
- Initial public release features, including page summaries, link drag-and-drop preview, and chat archiving.

## Future Plans
- **Feature Enhancements**:
    - Optimize the management and search functionality for conversation history.
    - Explore more practical AI application scenarios based on user feedback.

## 🤝 Contribution & Feedback
Feel free to contribute to this project by submitting Issues or Pull Requests. If you have any questions or suggestions, please don't hesitate to raise them!
