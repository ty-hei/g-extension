# Smart Sidebar Assistant

[![Version](https://img.shields.io/badge/version-1.3.1-blue.svg)](./manifest.json)
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

#### 3. Efficient Workflow
- **Prompt Templates & Shortcuts**:
    - **Custom Templates**: Create, edit, and save your frequently used prompt templates on a dedicated management page.
    - **`{{text}}` Placeholder**: Use the `{{text}}` placeholder in your templates. When you select text on a webpage, the template will automatically populate it, greatly improving the efficiency of repetitive tasks.
    - **Quick Invocation**: Frequently used templates are displayed as shortcut buttons in the sidebar for one-click access.
- **Seamless Text Handling**: Select text on a webpage, and it will automatically appear in the sidebar's quote area. You can directly ask questions about the text or apply a prompt template with a single click.
- **Conversation Management**:
    - **Split Conversation**: When switching topics, you can split the current conversation with one click, archiving it and starting a new session.
    - **Archive Conversations**: Archive important conversations or individual Q&A pairs for future reference.
    - **History Tracking**: All non-temporary conversations are recorded and can be managed and searched on the archive page.

#### 4. High Customizability
- **Flexible API Configuration**: Supports adding multiple API configurations (for Google Gemini or any OpenAI-compatible API) and setting any one as active at any time.
- **Custom Models**: You can specify the exact model name for each API configuration (e.g., `gemini-1.5-flash-latest`, `gpt-4o`).
- **OpenAI Compatibility**: For OpenAI-compatible APIs, you can customize the API Endpoint URL to connect to any service that adheres to the standard.

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

## 🔧 Tech Stack
- **Core**: HTML, CSS, JavaScript (ES6+)
- **Browser APIs**: Chrome Extension Manifest V3, Side Panel API, Context Menus API, Storage API
- **Content Extraction**: [Mozilla/Readability.js](https://github.com/mozilla/readability)
- **Markdown Rendering**: [Marked.js](https://marked.js.org/)

## Future Plans
- **Feature Enhancements**:
    - Optimize the management and search functionality for conversation history.
    - Explore more practical AI application scenarios based on user feedback.

## 🤝 Contribution & Feedback
Feel free to contribute to this project by submitting Issues or Pull Requests. If you have any questions or suggestions, please don't hesitate to raise them!
