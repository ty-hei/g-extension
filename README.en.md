# Smart Sidebar Assistant

[![Version](https://img.shields.io/badge/version-1.3.2-blue.svg)](./manifest.json)
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
- **One-Click Page Summary**: Instantly summarize the core content of the current page to quickly grasp the main points. It uses [Mozilla's Readability.js](https://github.com/mozilla/readability) to intelligently distinguish main content from ads, navigation, and other irrelevant elements.
- **Deep Link Analysis**: No need to open a new tab. Simply drag a link to the preview window at the bottom right of the page, or use the context menu, to extract and summarize the content of the linked page.
- **Image Recognition & Analysis**: Analyze any image on a webpage using the context menu, leveraging the multimodal capabilities of Gemini.
- **Full-Page Quoting**: Extract the entire text content of the current page with one click and add it as a quote to the sidebar, allowing you to ask questions or process the full text.
- **Advanced Regex Extraction**: Enable the optional sidebar regex tool in Options to preview webpage text, tune JavaScript regular expressions, ask AI to design a regex, and copy matched content directly to the clipboard.

#### 3. Efficient Workflow
- **Prompt Templates & Shortcuts**:
    - **Custom Templates**: Create, edit, and save your frequently used prompt templates on a dedicated management page.
    - **`{{text}}` Placeholder**: Use the `{{text}}` placeholder in your templates. When you select text on a webpage, the template will automatically populate it, greatly improving the efficiency of repetitive tasks.
    - **Quick Invocation**: Frequently used templates are displayed as shortcut buttons in the sidebar for one-click access.
- **Seamless Text Handling**: Select text on a webpage, and it will automatically appear in the sidebar's quote area. You can directly ask questions about the text or apply a prompt template with a single click.
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

#### Method 1: Install from Chrome Web Store (Recommended)

[**👉 Click here to install from the Chrome Web Store**](https://chromewebstore.google.com/detail/eomfjfhjglppmkefbnhfmmdfciemlfie?utm_source=item-share-cb)

After installation, please proceed to **Step 2** to configure your API key.

---
#### Method 2: Load from Source (for Developers)

##### Step 1: Load the Extension
1.  Download or clone all project files to your local machine.
2.  Open the extension management page in your Chrome / Edge browser (`chrome://extensions` or `edge://extensions`).
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
4.  Save the configuration. **Ensure that you have at least one configuration and that it is set to "Active"**, otherwise the extension will not work.

## 🛠️ How to Use
- **Open Sidebar**: Click the extension icon in the browser toolbar.
- **Summarize/Analyze**: Right-click anywhere on a webpage and use context menu items like "Summarize" or "Analyze Image".
- **Process Text**: Select a piece of text on a webpage with your mouse, and it will automatically appear in the sidebar for processing.
- **Summarize Links**: Drag a link from a webpage to the preview box that appears in the bottom-right corner, then click summarize.
- **Extract with Regex**: Enable the regex tool in Options, open it from the sidebar's More Actions menu, refresh page content, adjust your pattern and flags, then copy the matched result.

## 🔧 Tech Stack
- **Core**: HTML, CSS, JavaScript (ES6+)
- **Browser APIs**: Chrome Extension Manifest V3, Side Panel API, Context Menus API, Storage API
- **Content Extraction**: [Mozilla/Readability.js](https://github.com/mozilla/readability)
- **Markdown Rendering**: [Marked.js](https://marked.js.org/)

## 📝 Changelog

#### v1.3.2 (Current)
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
