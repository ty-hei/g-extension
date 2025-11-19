// g-extension/sidebar.js

// --- 全局变量 ---
let currentApiKey = null;
let currentApiType = 'gemini'; // Default to Gemini
let currentApiEndpoint = ''; // For OpenAI-compatible APIs
let currentModelName = 'gemini-1.5-flash-latest'; // Default model
let currentLanguage = 'zh'; // Default language

let currentChat = [];
let allChats = [];
let archivedChats = [];
let currentSelectedText = null;
let currentSelectedImageUrl = null;
let promptTemplates = [];

// --- 翻译字典 ---
const translations = {
    zh: {
        summarizePage: "总结当前网页",
        extractContent: "提取全文作为引用",
        splitChat: "分割当前对话",
        viewArchived: "查看已存档对话",
        managePrompts: "管理 Prompt",
        promptShortcuts: "Prompt 快捷方式:",
        clearImage: "清除图片",
        quoteContent: "引用内容:",
        clear: "清除",
        send: "发送",
        inputPlaceholder: "输入消息或使用快捷方式...",
        errorConfigIncomplete: '错误：当前活动的API配置不完整。请<a href="#" id="open-options-link">检查插件选项</a>。',
        configLoaded: '已加载配置',
        noConfigFound: '错误：未找到任何API配置或未设置活动配置。请<a href="#" id="open-options-link">在插件选项中添加并设置一个活动配置</a>。',
        loadConfigFail: '错误：加载API配置失败。',
        historyCleared: '所有对话历史已清除。',
        confirmClearHistory: "确定要清除所有对话历史吗？此操作无法撤销。",
        configUpdated: 'API 配置已更新。',
        switchedConfig: '已切换到配置',
        invalidConfig: '未找到有效的活动API配置。请在选项中设置。',
        splitChatSuccess: '对话已分割并存档。新的对话已开始。',
        archiveSuccess: '该问答已存档。',
        archiveFail: '存档失败：未能找到对应的用户问题。',
        textSelected: "引用内容",
        imageSelected: "图片已选择",
        extractFail: "提取失败",
        extractSuccess: "✅ 提取成功",
        summarizeRequest: "总结请求",
        summarizeLinkWarning: "注意",
        summarizeLinkFail: "无法总结",
        linkSummaryProcessing: "正在总结链接",
        processingWait: "请稍候。",
        inputEmpty: '请输入消息或选择图片/文本后再发送。',
        noContent: '没有有效内容发送。',
        summarizePageRequest: '(正在请求总结当前网页...)',
        summarizePageEmpty: "页面内容为空或未能提取到有效文本进行总结。",
        summarizeErrorUnknown: "总结错误: 从背景脚本收到未知响应。",
        extracting: '正在提取页面主要内容...',
        thinking: '正在思考中...',
        loadImage: '正在加载并处理图片...',
        noContentToSend: "没有内容可以发送给AI。",
        requestFail: "请求构建失败",
        apiAuthFail: "API 认证失败",
        apiRateLimit: "API 请求频率超限",
        apiServerErr: "AI 服务端出现临时错误",
        apiCallFail: "API 调用失败",
        streamEmpty: 'API返回了空的流式响应。请检查API服务商的状态或稍后再试。',
        networkErr: '网络连接失败。请检查您的网络连接并重试。',
        apiCommErr: '与API通讯时发生错误。',
        describeImage: "请描述这张图片。",
        viewArchivedBtnCount: "查看已存档对话",
        prompt_summarize_link: `请使用中文，清晰、简洁且全面地总结以下链接 ({title}{url}) 的主要内容。专注于核心信息，忽略广告、导航栏、页脚等非主要内容。如果内容包含技术信息或代码，请解释其核心概念和用途。如果是一篇文章，请提炼主要观点和论据。总结应易于理解，并抓住内容的精髓。\n\n链接内容文本如下：\n"{text}"`,
        prompt_summarize_page: `请使用中文，清晰、简洁且全面地总结以下网页内容。如果内容包含技术信息或代码，请解释其核心概念和用途。如果是一篇文章，请提炼主要观点和论据。总结应易于理解，并抓住内容的精髓。\n\n网页内容如下：\n"{text}"`,
        user_msg_about_quote: `关于以下引用内容：\n"{quote}"\n\n我的问题/指令是：\n"{msg}"`
    },
    en: {
        summarizePage: "Summarize Page",
        extractContent: "Extract Full Text",
        splitChat: "Split Chat",
        viewArchived: "Archived Chats",
        managePrompts: "Manage Prompts",
        promptShortcuts: "Prompt Shortcuts:",
        clearImage: "Clear Image",
        quoteContent: "Quote:",
        clear: "Clear",
        send: "Send",
        inputPlaceholder: "Type a message or use shortcuts...",
        errorConfigIncomplete: 'Error: Active API configuration incomplete. Please <a href="#" id="open-options-link">check options</a>.',
        configLoaded: 'Config Loaded',
        noConfigFound: 'Error: No active API configuration found. Please <a href="#" id="open-options-link">add one in options</a>.',
        loadConfigFail: 'Error: Failed to load API config.',
        historyCleared: 'Chat history cleared.',
        confirmClearHistory: "Are you sure you want to clear all chat history? This cannot be undone.",
        configUpdated: 'API Configuration Updated.',
        switchedConfig: 'Switched to config',
        invalidConfig: 'No valid active configuration found.',
        splitChatSuccess: 'Chat split and archived. New conversation started.',
        archiveSuccess: 'Q&A pair archived.',
        archiveFail: 'Archive failed: User question not found.',
        textSelected: "Quote content",
        imageSelected: "Image selected",
        extractFail: "Extraction Failed",
        extractSuccess: "✅ Extraction Success",
        summarizeRequest: "Summary Request",
        summarizeLinkWarning: "Note",
        summarizeLinkFail: "Cannot summarize",
        linkSummaryProcessing: "Summarizing link",
        processingWait: "Please wait.",
        inputEmpty: 'Please enter a message or select content.',
        noContent: 'No valid content to send.',
        summarizePageRequest: '(Requesting page summary...)',
        summarizePageEmpty: "Page content is empty or could not be extracted.",
        summarizeErrorUnknown: "Summary Error: Unknown response from background.",
        extracting: 'Extracting page content...',
        thinking: 'Thinking...',
        loadImage: 'Loading and processing image...',
        noContentToSend: "No content to send to AI.",
        requestFail: "Request build failed",
        apiAuthFail: "API Auth Failed",
        apiRateLimit: "API Rate Limit Exceeded",
        apiServerErr: "AI Server Temporary Error",
        apiCallFail: "API Call Failed",
        streamEmpty: 'API returned empty stream response.',
        networkErr: 'Network connection failed.',
        apiCommErr: 'Error communicating with API.',
        describeImage: "Please describe this image.",
        viewArchivedBtnCount: "Archived Chats",
        prompt_summarize_link: `Please summarize the main content of the following link ({title}{url}) clearly, concisely, and comprehensively in English. Focus on core information, ignoring ads and nav bars. If technical, explain core concepts. If an article, extract main arguments. Make it easy to understand.\n\nLink text:\n"{text}"`,
        prompt_summarize_page: `Please summarize the following webpage content clearly, concisely, and comprehensively in English. Focus on core information. If technical, explain core concepts. If an article, extract main arguments. Make it easy to understand.\n\nPage content:\n"{text}"`,
        user_msg_about_quote: `Regarding the following quote:\n"{quote}"\n\nMy question/instruction is:\n"{msg}"`
    }
};

// Helper to get text based on current language
function t(key) {
    return translations[currentLanguage][key] || translations['zh'][key] || key;
}

// --- DOM 元素获取 ---
let chatOutput, chatInput, sendMessageButton, summarizePageButton, extractContentButton,
    selectedTextPreview, selectedTextContent, clearSelectedTextButton,
    selectedImagePreviewContainer, clearSelectedImageButton,
    clearAllHistoryButton,
    splitChatButton, viewArchivedChatsButton,
    managePromptsButton, promptShortcutsContainer;


// --- 初始化和API Key加载 ---
async function initialize() {
    chatOutput = document.getElementById('chatOutput');
    chatInput = document.getElementById('chatInput');
    sendMessageButton = document.getElementById('sendMessageButton');
    summarizePageButton = document.getElementById('summarizePageButton');
    extractContentButton = document.getElementById('extractContentButton');
    selectedTextPreview = document.getElementById('selectedTextPreview');
    selectedTextContent = document.getElementById('selectedTextContent');
    clearSelectedTextButton = document.getElementById('clearSelectedTextButton');
    selectedImagePreviewContainer = document.getElementById('selectedImagePreviewContainer');
    clearSelectedImageButton = document.getElementById('clearSelectedImageButton');
    clearAllHistoryButton = document.getElementById('clearAllHistoryButton');
    splitChatButton = document.getElementById('splitChatButton');
    viewArchivedChatsButton = document.getElementById('viewArchivedChatsButton');
    managePromptsButton = document.getElementById('managePromptsButton');
    promptShortcutsContainer = document.getElementById('promptShortcuts');


    if (typeof marked !== 'object' || marked === null || typeof marked.parse !== 'function') {
        console.warn("Marked Library Test - marked is not an object or marked.parse is not a function.");
    }

    // Load Configuration and Language
    try {
        const result = await chrome.storage.sync.get(['apiConfigurations', 'activeConfigurationId', 'interfaceLanguage']);
        const configs = result.apiConfigurations || [];
        const activeId = result.activeConfigurationId;
        
        // Set Language
        if (result.interfaceLanguage) {
            currentLanguage = result.interfaceLanguage;
        }
        updateInterfaceLanguage(); // Apply translations to UI

        let activeConfig = null;
        if (activeId && configs.length > 0) {
            activeConfig = configs.find(c => c.id === activeId);
        }
        if (!activeConfig && configs.length > 0) {
            activeConfig = configs[0];
            console.warn("No active configuration found or ID mismatch, defaulting to the first available configuration.");
        }

        if (activeConfig) {
            currentApiKey = activeConfig.apiKey;
            currentApiType = activeConfig.apiType;
            currentApiEndpoint = activeConfig.apiEndpoint || '';
            currentModelName = activeConfig.modelName;
            
            if (!currentApiKey || !currentModelName || (currentApiType === 'openai' && !currentApiEndpoint)) {
                 addMessageToChat({ role: 'model', parts: [{text: t('errorConfigIncomplete')}], timestamp: Date.now() }); 
                 disableInputs(); 
            } else {
                const tempStatusMsg = addMessageToChat({ role: 'model', parts: [{text: `${t('configLoaded')}: "${activeConfig.configName}" (${activeConfig.apiType})`}], timestamp: Date.now(), isTempStatus: true });
                setTimeout(() => removeMessageByContentCheck(msg => msg.isTempStatus && msg.timestamp === tempStatusMsg.timestamp), 3000);
                enableInputs();
            }
        } else {
            addMessageToChat({ role: 'model', parts: [{text: t('noConfigFound')}], timestamp: Date.now() }); 
            disableInputs();
        }

    } catch (e) {
        console.error("Sidebar: Error loading API configuration:", e);
        addMessageToChat({ role: 'model', parts: [{text: t('loadConfigFail')}], timestamp: Date.now() });
        disableInputs();
    }

    await loadArchivedChats();
    loadChatHistory();
    await loadPromptTemplates();

    if (!currentChat || currentChat.length === 0) {
        renderCurrentChat();
    }

    if (sendMessageButton) sendMessageButton.addEventListener('click', handleSendMessage);

    if (chatInput) {
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                sendMessageButton.click();
            }
        });
    }

    if (summarizePageButton) summarizePageButton.addEventListener('click', handleSummarizeCurrentPage);
    if (extractContentButton) extractContentButton.addEventListener('click', handleExtractContent);
    if (clearSelectedTextButton) clearSelectedTextButton.addEventListener('click', clearSelectedTextPreview);
    if (clearSelectedImageButton) clearSelectedImageButton.addEventListener('click', clearSelectedImagePreview);
    if (clearAllHistoryButton) {
        clearAllHistoryButton.addEventListener('click', () => {
            if (confirm(t('confirmClearHistory'))) {
                allChats = [];
                currentChat = [];
                saveChatHistory();
                renderCurrentChat();
                addMessageToChat({ role: 'model', parts: [{text: t('historyCleared')}], timestamp: Date.now() });
            }
        });
    }

    if (splitChatButton) splitChatButton.addEventListener('click', handleSplitChat);
    if (viewArchivedChatsButton) {
        viewArchivedChatsButton.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('archive.html') });
        });
    }
    if (managePromptsButton) {
        managePromptsButton.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('prompts.html') });
        });
    }

    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === 'sync') {
             if (changes.interfaceLanguage) {
                currentLanguage = changes.interfaceLanguage.newValue || 'zh';
                updateInterfaceLanguage();
                // Also reload prompts just in case defaults change (though defaults are currently hardcoded in prompt loader logic)
            }

            if (changes.apiConfigurations || changes.activeConfigurationId) {
                const result = await chrome.storage.sync.get(['apiConfigurations', 'activeConfigurationId']);
                const configs = result.apiConfigurations || [];
                const activeId = result.activeConfigurationId;
                let activeConfig = null;

                if (activeId && configs.length > 0) {
                    activeConfig = configs.find(c => c.id === activeId);
                }
                if (!activeConfig && configs.length > 0) {
                     activeConfig = configs[0];
                }
                
                let configStatusMessage = t('configUpdated');
                if (activeConfig) {
                    currentApiKey = activeConfig.apiKey;
                    currentApiType = activeConfig.apiType;
                    currentApiEndpoint = activeConfig.apiEndpoint || '';
                    currentModelName = activeConfig.modelName;
                    configStatusMessage = `${t('switchedConfig')}: "${activeConfig.configName}" (${activeConfig.apiType})`;

                    if (!currentApiKey || !currentModelName || (currentApiType === 'openai' && !currentApiEndpoint)) {
                        addMessageToChat({ role: 'model', parts: [{text: t('errorConfigIncomplete')}], timestamp: Date.now() }); 
                        disableInputs(); 
                    } else {
                        enableInputs();
                    }
                } else {
                    currentApiKey = null;
                    currentApiType = 'gemini';
                    currentApiEndpoint = '';
                    currentModelName = '';
                    configStatusMessage = t('invalidConfig');
                    disableInputs();
                }
                 addMessageToChat({ role: 'model', parts: [{text: configStatusMessage}], timestamp: Date.now() });
            }
        }
        if (namespace === 'local') {
            if (changes.geminiChatHistory) {
                allChats = (changes.geminiChatHistory.newValue || []).map(chat => chat.filter(msg => !msg.isTempStatus && !msg.isThinking));
            }
            if (changes.geminiArchivedChats) {
                archivedChats = changes.geminiArchivedChats.newValue || [];
                updateArchivedChatsButtonCount();
            }
            if (changes.promptTemplates) {
                await loadPromptTemplates();
            }
        }
    });
    chrome.runtime.onMessage.addListener(handleRuntimeMessages);
}

function updateInterfaceLanguage() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLanguage][key]) {
            // Preserve icons/structure if needed, for simple text buttons just replace
            if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
                 el.textContent = translations[currentLanguage][key];
            } else {
                 // For more complex structure, might need specific handling, but textContent is usually fine for buttons
                 // Special handling for specific IDs if they contain icons not in translation string
                 el.textContent = translations[currentLanguage][key];
            }
        }
    });
    
    if (chatInput) chatInput.placeholder = t('inputPlaceholder');
    updateArchivedChatsButtonCount();
}

async function loadPromptTemplates() {
    const result = await chrome.storage.local.get(['promptTemplates']);
    const presets = [
        { id: 'preset-translate', name: '翻译/Translate', content: '请将以下文本翻译成[目标语言] (Translate to [Language])：\n\n{{text}}', isPreset: true },
        { id: 'preset-summarize', name: '总结/Summarize', content: '请总结以下文本的主要内容 (Summarize this)：\n\n{{text}}', isPreset: true }
    ];

    if (result.promptTemplates && result.promptTemplates.length > 0) {
        promptTemplates = result.promptTemplates;
        presets.forEach(presetDef => {
            const existing = promptTemplates.find(p => p.id === presetDef.id);
            if (!existing) {
                promptTemplates.unshift({ ...presetDef });
            } else {
                existing.isPreset = true;
            }
        });
    } else {
        promptTemplates = [...presets];
        await chrome.storage.local.set({ promptTemplates: promptTemplates });
    }
    promptTemplates.forEach(p => {
        if (!presets.some(presetDef => presetDef.id === p.id)) {
            p.isPreset = false;
        }
    });

    renderPromptShortcuts();
}

function renderPromptShortcuts() {
    if (!promptShortcutsContainer) return;
    promptShortcutsContainer.innerHTML = '';

    const sortedPrompts = [...promptTemplates].sort((a, b) => {
        if (a.isPreset && !b.isPreset) return -1;
        if (!a.isPreset && b.isPreset) return 1;
        return a.name.localeCompare(b.name);
    });

    sortedPrompts.forEach(template => {
        const button = document.createElement('button');
        button.classList.add('prompt-shortcut-button');
        button.textContent = template.name;
        button.title = template.content.substring(0, 100) + (template.content.length > 100 ? '...' : '');
        button.addEventListener('click', () => applyPromptTemplate(template));
        promptShortcutsContainer.appendChild(button);
    });
}

function applyPromptTemplate(template) {
    let content = template.content;
    if (currentSelectedText && content.includes("{{text}}")) {
        content = content.replace(/{{text}}/g, currentSelectedText);
    }
    chatInput.value = content;
    chatInput.focus();
    chatInput.scrollTop = chatInput.scrollHeight;
}

function displaySelectedImagePreview(imageUrl) {
    if (selectedImagePreviewContainer && imageUrl) {
        selectedImagePreviewContainer.innerHTML = `<img src="${imageUrl}" alt="Selected image preview" style="max-width: 100%; max-height: 150px; object-fit: contain; border: 1px solid var(--border-color); border-radius: var(--border-radius);">`;
        selectedImagePreviewContainer.style.display = 'block';
        if (clearSelectedImageButton) clearSelectedImageButton.style.display = 'block';
        chatInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        clearSelectedImagePreview();
    }
}

function clearSelectedImagePreview() {
    currentSelectedImageUrl = null;
    if (selectedImagePreviewContainer) {
        selectedImagePreviewContainer.innerHTML = '';
        selectedImagePreviewContainer.style.display = 'none';
    }
    if (clearSelectedImageButton) clearSelectedImageButton.style.display = 'none';
}

function updateArchivedChatsButtonCount() {
    if (viewArchivedChatsButton) {
        viewArchivedChatsButton.textContent = `${t('viewArchivedBtnCount')} (${archivedChats.length})`;
    }
}

function handleSplitChat() {
    const chatToProcess = currentChat.filter(msg => !(msg.isThinking || msg.isTempStatus));

    if (chatToProcess.length > 0) {
        const archivedCopy = chatToProcess.map(m => {
            const {isThinking, isTempStatus, archived, ...rest} = m;
            return rest;
        });
        archivedChats.unshift(archivedCopy);
        saveArchivedChats();

        let alreadyInAllChats = false;
        if (allChats.length > 0 && JSON.stringify(allChats[0]) === JSON.stringify(chatToProcess)) {
            alreadyInAllChats = true;
        }
        if (!alreadyInAllChats) {
            allChats.unshift([...chatToProcess]);
            if (allChats.length > 50) allChats.pop();
            saveChatHistory();
        }
    }

    currentChat = [];
    renderCurrentChat();
    addMessageToChat({ role: 'model', parts: [{text: t('splitChatSuccess')}], timestamp: Date.now() });
    saveCurrentChat();
}


function archiveQaPair(aiMessageIndexInCurrentChat) {
    const aiMessage = currentChat[aiMessageIndexInCurrentChat];
    if (!aiMessage || aiMessage.archived) return;

    let userMessage = null;
    for (let i = aiMessageIndexInCurrentChat - 1; i >= 0; i--) {
        if (currentChat[i].role === 'user' && !currentChat[i].isThinking && !currentChat[i].isTempStatus) {
            userMessage = currentChat[i];
            break;
        }
    }

    if (userMessage && aiMessage) {
        const userMessageCopy = {...userMessage};
        delete userMessageCopy.archived; delete userMessageCopy.isThinking; delete userMessageCopy.isTempStatus;
        const aiMessageCopy = {...aiMessage};
        delete aiMessageCopy.archived; delete aiMessageCopy.isThinking; delete aiMessageCopy.isTempStatus;

        const qaPairToArchive = [userMessageCopy, aiMessageCopy];

        archivedChats.unshift(qaPairToArchive);
        saveArchivedChats();

        aiMessage.archived = true;
        renderCurrentChat();
        saveCurrentChat();

        const tempStatusMsg = addMessageToChat({role: 'model', parts: [{text: t('archiveSuccess')}], timestamp: Date.now(), isTempStatus: true});
        setTimeout(() => {
            const idx = currentChat.findIndex(m => m.timestamp === tempStatusMsg.timestamp && m.isTempStatus);
            if (idx > -1) {
                currentChat.splice(idx, 1);
                renderCurrentChat();
                saveCurrentChat();
            }
        }, 3000);
    } else {
        console.warn("Could not find user message for AI message at index:", aiMessageIndexInCurrentChat);
        const tempErrorMsg = addMessageToChat({role: 'model', parts: [{text: t('archiveFail')}], timestamp: Date.now(), isTempStatus: true});
        setTimeout(() => {
             const idx = currentChat.findIndex(m => m.timestamp === tempErrorMsg.timestamp && m.isTempStatus);
            if (idx > -1) {
                currentChat.splice(idx, 1);
                renderCurrentChat();
                saveCurrentChat();
            }
        }, 3000);
    }
}


function handleRuntimeMessages(request, sender, sendResponse) {
    switch (request.type || request.action) {
        case 'TEXT_SELECTED_FOR_SIDEBAR':
            currentSelectedText = request.text;
            if (selectedTextContent) selectedTextContent.textContent = currentSelectedText.length > 100 ? currentSelectedText.substring(0, 97) + '...' : currentSelectedText;
            if (selectedTextPreview) selectedTextPreview.style.display = 'flex';
            sendResponse({status: "Selected text received in sidebar"});
            break;

        case 'IMAGE_SELECTED_FOR_SIDEBAR':
            currentSelectedImageUrl = request.imageUrl;
            displaySelectedImagePreview(currentSelectedImageUrl);
            sendResponse({status: "Image URL received in sidebar"});
            break;

        case 'extractedPageContent':
            removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text.includes(t('extracting')));
            if (request.error) {
                addMessageToChat({ role: 'model', parts: [{text: `${t('extractFail')}: ${request.error}${request.warning ? ' ('+request.warning+')' : ''}`}], timestamp: Date.now() });
            } else {
                currentSelectedText = request.content;
                if (selectedTextPreview && selectedTextContent) {
                    selectedTextContent.textContent = `${t('textSelected')} (${request.content.length})`;
                    selectedTextPreview.style.display = 'flex';
                }
                const successMsgText = `${t('extractSuccess')} (${request.content.length})` + (request.warning ? ` (${request.warning})` : '');
                const successMsg = addMessageToChat({ role: 'model', parts: [{text: successMsgText}], timestamp: Date.now(), isTempStatus: true });
                setTimeout(() => removeMessageByContentCheck(msg => msg.timestamp === successMsg.timestamp), 6000);
            }
            sendResponse({status: "Page content processed"});
            break;

        case 'EXTRACT_CONTENT_ERROR':
            removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text.includes(t('extracting')));
            addMessageToChat({ role: 'model', parts: [{text: `${t('extractFail')}: ${request.message}`}], timestamp: Date.now() });
            sendResponse({status: "Error notice displayed"});
            break;

        case 'SUMMARIZE_EXTERNAL_TEXT_FOR_SIDEBAR': {
            const { text, linkUrl, linkTitle, warning } = request;
            removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text.includes(t('linkSummaryProcessing')));
            addMessageToChat({ role: 'user', parts: [{text: `${t('summarizeRequest')}：[${linkTitle || 'Link'}](${linkUrl}) (${text?.length || 0})`}], timestamp: Date.now() });
            if (warning) {
                addMessageToChat({ role: 'model', parts: [{text: `${t('summarizeLinkWarning')}: ${warning}`}], timestamp: Date.now() });
            }
            if (!text || text.trim() === "") {
                addMessageToChat({role: 'model', parts: [{text: `${t('summarizeLinkFail')} [${linkTitle || linkUrl}](${linkUrl})`}], timestamp: Date.now() });
                sendResponse({error: "No text provided"});
            } else {
                // Use dynamic prompt from translations
                let prompt = t('prompt_summarize_link');
                prompt = prompt.replace('{title}', linkTitle ? linkTitle + ' - ' : '')
                               .replace('{url}', linkUrl)
                               .replace('{text}', text);
                callApi(prompt, true, null).then(() => sendResponse({status: "Summary initiated"}));
            }
            break;
        }

        case 'SHOW_LINK_SUMMARY_ERROR': {
            const { message, url, title } = request;
            removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text.includes(t('linkSummaryProcessing')));
            addMessageToChat({ role: 'model', parts: [{text: `${t('summarizeLinkFail')} [${title || url}](${url}): ${message}`}], timestamp: Date.now() });
            sendResponse({status: "Error displayed"});
            break;
        }

        case 'LINK_SUMMARIZATION_STARTED': {
            const { url, title } = request;
            removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text.includes(t('linkSummaryProcessing')));
            addMessageToChat({ role: 'model', parts: [{text: `${t('linkSummaryProcessing')}: [${title || url}](${url})... ${t('processingWait')}`}], timestamp: Date.now(), isTempStatus: true });
            sendResponse({status: "Notified user"});
            break;
        }

        case 'TRIGGER_SIDEBAR_PAGE_SUMMARY':
            handleSummarizeCurrentPage();
            sendResponse({ status: "Sidebar initiated page summary." });
            break;
    }
    return true;
}

function removeMessageByContentCheck(conditionFn) {
    const initialLength = currentChat.length;
    currentChat = currentChat.filter(msg => !conditionFn(msg));
    if (currentChat.length < initialLength) {
        renderCurrentChat();
        return true;
    }
    return false;
}


async function handleSendMessage() {
    const messageText = chatInput.value.trim();
    let userMessageForApi = messageText;
    let displayUserMessageInChat = messageText;

    if (currentSelectedText && messageText.includes("{{text}}")) {
        userMessageForApi = messageText.replace(/{{text}}/g, currentSelectedText);
        displayUserMessageInChat = userMessageForApi;
    } else if (currentSelectedText && !messageText.includes("{{text}}") && messageText) {
        let msgStruct = t('user_msg_about_quote');
        userMessageForApi = msgStruct.replace('{quote}', currentSelectedText).replace('{msg}', messageText);
        displayUserMessageInChat = `(${t('quoteContent')} ${currentSelectedText.substring(0,50)}...) ${messageText}`;
    } else if (currentSelectedText && !messageText) {
        userMessageForApi = currentSelectedText;
        displayUserMessageInChat = currentSelectedText;
    }

    const imageUrlToSend = currentSelectedImageUrl;

    if (!userMessageForApi.trim() && !imageUrlToSend) {
        const tempMsg = addMessageToChat({ role: 'model', parts: [{text: t('inputEmpty')}], timestamp: Date.now(), isTempStatus: true });
        setTimeout(() => removeMessageByContentCheck(msg => msg.timestamp === tempMsg.timestamp && msg.isTempStatus), 3000);
        return;
    }

    if (!currentApiKey || !currentModelName || (currentApiType === 'openai' && !currentApiEndpoint)) {
        addMessageToChat({ role: 'model', parts: [{text: t('errorConfigIncomplete')}], timestamp: Date.now() });
        disableInputs(); return;
    }

    let finalDisplayMessage = displayUserMessageInChat;
    let finalApiTextMessage = userMessageForApi;

    if (imageUrlToSend) {
        if (!finalApiTextMessage.trim() && !currentSelectedText) {
            finalDisplayMessage = `(${t('imageSelected')})`;
            finalApiTextMessage = t('describeImage');
        } else {
            finalDisplayMessage = finalDisplayMessage ? `${finalDisplayMessage} (${t('imageSelected')})` : `(${t('imageSelected')})`;
        }
    }

    if (!finalApiTextMessage.trim() && !imageUrlToSend) {
         const tempMsg = addMessageToChat({ role: 'model', parts: [{text: t('noContent')}], timestamp: Date.now(), isTempStatus: true });
         setTimeout(() => removeMessageByContentCheck(msg => msg.timestamp === tempMsg.timestamp && msg.isTempStatus), 3000);
         return;
    }

    addMessageToChat({ role: 'user', parts: [{text: finalDisplayMessage}], timestamp: Date.now() });

    chatInput.value = '';
    clearSelectedTextPreview();
    clearSelectedImagePreview();

    await callApi(finalApiTextMessage, false, imageUrlToSend);
}

function handleSummarizeCurrentPage() {
    if (!currentApiKey || !currentModelName || (currentApiType === 'openai' && !currentApiEndpoint)) {
        addMessageToChat({ role: 'model', parts: [{text: t('errorConfigIncomplete')}], timestamp: Date.now() });
        disableInputs();
        return;
    }
    const summaryRequestText = t('summarizePageRequest');
    addMessageToChat({role: 'user', parts: [{text: summaryRequestText}], timestamp: Date.now(), isTempStatus: true });

    chrome.runtime.sendMessage({ action: "getAndSummarizePage" }, async (response) => {
        removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text === summaryRequestText);

        if (chrome.runtime.lastError) {
            addMessageToChat({role: 'model', parts: [{text: `${t('summarizeLinkFail')} (CS): ${chrome.runtime.lastError.message}`}], timestamp: Date.now() });
            return;
        }

        if (response && typeof response.contentForSummary === 'string') {
            const pageContent = response.contentForSummary;
             if (pageContent.trim() === "") {
                 addMessageToChat({role: 'user', parts: [{text: t('summarizeRequest')}], timestamp: Date.now()});
                 addMessageToChat({role: 'model', parts: [{text: t('summarizePageEmpty')}], timestamp: Date.now() });
                 return;
            }
            let prompt = t('prompt_summarize_page');
            prompt = prompt.replace('{text}', pageContent);
            
            addMessageToChat({role: 'user', parts: [{text: `${t('summarizeRequest')} (${pageContent.length})`}], timestamp: Date.now()});
            await callApi(prompt, true, null);
        } else if (response && response.error) {
            addMessageToChat({role: 'user', parts: [{text: t('summarizeRequest')}], timestamp: Date.now()});
            addMessageToChat({role: 'model', parts: [{text: `${t('summarizeLinkFail')}: ${response.error}`}], timestamp: Date.now() });
        } else {
            addMessageToChat({role: 'user', parts: [{text: t('summarizeRequest')}], timestamp: Date.now()});
            addMessageToChat({role: 'model', parts: [{text: t('summarizeErrorUnknown')}], timestamp: Date.now() });
        }
    });
}

function handleExtractContent() {
    if (!currentApiKey) {
        addMessageToChat({ role: 'model', parts: [{text: t('errorConfigIncomplete')}], timestamp: Date.now() });
        disableInputs();
        return;
    }
    
    const tempStatusMsg = addMessageToChat({role: 'model', parts: [{text: t('extracting')}] , timestamp: Date.now(), isTempStatus: true });

    chrome.runtime.sendMessage({ action: "extractActiveTabContent" }, (response) => {
        if (chrome.runtime.lastError || (response && !response.success)) {
            removeMessageByContentCheck(msg => msg.timestamp === tempStatusMsg.timestamp);
            const errorMessage = response?.error || chrome.runtime.lastError?.message || "Unknown";
            addMessageToChat({role: 'model', parts: [{text: `${t('extractFail')}: ${errorMessage}`}], timestamp: Date.now() });
        }
    });
}


function disableInputs() {
    if (chatInput) chatInput.disabled = true;
    if (sendMessageButton) sendMessageButton.disabled = true;
    if (summarizePageButton) summarizePageButton.disabled = true;
    if (extractContentButton) extractContentButton.disabled = true;
    if (splitChatButton) splitChatButton.disabled = true;
}

function enableInputs() {
    if (chatInput) chatInput.disabled = false;
    if (sendMessageButton) sendMessageButton.disabled = false;
    if (summarizePageButton) summarizePageButton.disabled = false;
    if (extractContentButton) extractContentButton.disabled = false;
    if (splitChatButton) splitChatButton.disabled = false;
}

async function callApi(userMessageContent, isSummary = false, imageUrl = null) {
    if (!currentApiKey || !currentModelName || (currentApiType === 'openai' && !currentApiEndpoint)) {
        addMessageToChat({ role: 'model', parts: [{text: t('errorConfigIncomplete')}], timestamp: Date.now() });
        return;
    }

    const thinkingMessage = addMessageToChat({ role: 'model', parts: [{text: t('thinking')}], timestamp: Date.now(), isThinking: true });

    let endpoint = '';
    let requestBody = {};
    let headers = { 'Content-Type': 'application/json' };

    const historyForAPI = currentChat
        .filter(msg => msg.timestamp < thinkingMessage.timestamp && !msg.isTempStatus && !msg.isThinking && !msg.archived)
        .map(msg => {
            const textContent = msg.parts.map(part => part.text).join('\n');
            if (currentApiType === 'openai') {
                return {
                    role: msg.role === 'model' ? 'assistant' : msg.role,
                    content: textContent
                };
            } else { // Gemini
                return {
                    role: msg.role,
                    parts: [{ text: textContent }]
                };
            }
        });

    // ----- Specific API Request Construction -----
    try {
        if (currentApiType === 'gemini') {
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModelName}:streamGenerateContent?key=${currentApiKey}&alt=sse`;
            const geminiUserParts = [];
            if (userMessageContent && userMessageContent.trim() !== "") {
                geminiUserParts.push({ text: userMessageContent });
            }
            if (imageUrl) {
                 const tempImageStatusMsg = addMessageToChat({ role: 'model', parts: [{text: t('loadImage')}], timestamp: Date.now(), isTempStatus: true });
                try {
                    const response = await fetch(imageUrl);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();
                    const mimeType = blob.type || 'application/octet-stream';
                    if (!mimeType.startsWith('image/')) throw new Error(`Invalid MIME: ${mimeType}`);
                    const base64Data = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.onerror = (error) => reject(new Error("FileReader error: " + error.message));
                        reader.readAsDataURL(blob);
                    });
                    geminiUserParts.push({ inlineData: { mimeType: mimeType, data: base64Data } });
                } finally {
                     if (tempImageStatusMsg) removeMessageByContentCheck(msg => msg.timestamp === tempImageStatusMsg.timestamp);
                }
            }
            if (geminiUserParts.length === 0) throw new Error(t('noContentToSend'));
            requestBody = { contents: [...historyForAPI, { role: "user", parts: geminiUserParts }] };

        } else if (currentApiType === 'openai') {
            endpoint = currentApiEndpoint;
            headers['Authorization'] = `Bearer ${currentApiKey}`;
            const openaiCurrentUserMessageContent = [];
            if (userMessageContent && userMessageContent.trim() !== "") {
                openaiCurrentUserMessageContent.push({ type: "text", text: userMessageContent });
            }
            if (imageUrl) {
                const tempImageStatusMsg = addMessageToChat({ role: 'model', parts: [{text: t('loadImage')}], timestamp: Date.now(), isTempStatus: true });
                try {
                    const response = await fetch(imageUrl);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();
                    const mimeType = blob.type || 'application/octet-stream';
                    if (!mimeType.startsWith('image/')) throw new Error(`Invalid MIME: ${mimeType}`);
                    const base64DataUri = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = (error) => reject(new Error("FileReader error: " + error.message));
                        reader.readAsDataURL(blob);
                    });
                    openaiCurrentUserMessageContent.push({ type: "image_url", image_url: { "url": base64DataUri } });
                } finally {
                    if (tempImageStatusMsg) removeMessageByContentCheck(msg => msg.timestamp === tempImageStatusMsg.timestamp);
                }
            }
            if (openaiCurrentUserMessageContent.length === 0) throw new Error(t('noContentToSend'));
            if (openaiCurrentUserMessageContent.some(c => c.type === 'image_url') && !openaiCurrentUserMessageContent.some(c => c.type === 'text')) {
                openaiCurrentUserMessageContent.unshift({ type: "text", text: t('describeImage') });
            }
            requestBody = {
                model: currentModelName,
                messages: [...historyForAPI, { role: "user", content: openaiCurrentUserMessageContent }],
                stream: true
            };
        } else {
            throw new Error(`API "${currentApiType}" not supported.`);
        }
    } catch (error) {
        removeMessageByContentCheck(msg => msg.isThinking && msg.timestamp === thinkingMessage.timestamp);
        addMessageToChat({ role: 'model', parts: [{text: `${t('requestFail')}: ${error.message}`}], timestamp: Date.now() });
        return;
    }

    // ----- API Call and Streaming Response Handling -----
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        removeMessageByContentCheck(msg => msg.isThinking && msg.timestamp === thinkingMessage.timestamp);

        if (!response.ok) {
            let friendlyErrorMessage = '';
            const errorText = await response.text();
            let errorDetails = '';
            try {
                const errorJson = JSON.parse(errorText);
                errorDetails = errorJson.error?.message || JSON.stringify(errorJson.error);
            } catch {
                errorDetails = errorText.substring(0, 200) + (errorText.length > 200 ? '...' : '');
            }

            switch (response.status) {
                case 401:
                case 403:
                    friendlyErrorMessage = `${t('apiAuthFail')} (${response.status}). <a href="#" id="open-options-link">Check Config</a>.<br><small>${errorDetails}</small>`;
                    break;
                case 429:
                    friendlyErrorMessage = `${t('apiRateLimit')} (429).<br><small>${errorDetails}</small>`;
                    break;
                case 500:
                case 502:
                case 503:
                case 504:
                    friendlyErrorMessage = `${t('apiServerErr')} (${response.status}).<br><small>${errorDetails}</small>`;
                    break;
                default:
                    friendlyErrorMessage = `${t('apiCallFail')} (${response.status}).<br><small>${errorDetails}</small>`;
            }
            addMessageToChat({ role: 'model', parts: [{text: friendlyErrorMessage}], timestamp: Date.now() });
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiResponseText = '';
        let aiMessage = null;
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); 

            for (const line of lines) {
                if (line.trim() === '' || !line.startsWith('data: ')) continue;

                const jsonStr = line.substring(6);
                if (jsonStr === '[DONE]') break;

                try {
                    const data = JSON.parse(jsonStr);
                    let chunkText = '';

                    if (currentApiType === 'gemini') {
                        if (data.candidates && data.candidates[0]?.content?.parts) {
                            chunkText = data.candidates[0].content.parts.map(part => part.text).join("");
                        }
                    } else if (currentApiType === 'openai') {
                        if (data.choices && data.choices[0]?.delta?.content) {
                            chunkText = data.choices[0].delta.content;
                        }
                    }

                    if (chunkText) {
                        if (!aiMessage) {
                            aiMessage = addMessageToChat({ role: 'model', parts: [{text: ''}], timestamp: Date.now() });
                        }
                        aiResponseText += chunkText;
                        aiMessage.parts[0].text = aiResponseText;
                        renderCurrentChat();
                    }
                } catch (error) {
                    console.warn('Error parsing stream chunk:', error, 'Chunk:', jsonStr);
                }
            }
        }
        
        if (aiMessage) {
            if (currentApiType === 'gemini' && buffer.startsWith('data: ')) {
                 try {
                    const finalJson = JSON.parse(buffer.substring(6));
                    if (finalJson.promptFeedback?.blockReason) {
                         aiMessage.parts[0].text += `\n\n[Block Reason: ${finalJson.promptFeedback.blockReason}]`;
                         renderCurrentChat();
                    }
                 } catch(e) { /* Ignore if buffer is not valid JSON */ }
            }
            saveCurrentChat();
        } else {
            addMessageToChat({ role: 'model', parts: [{text: t('streamEmpty')}], timestamp: Date.now() });
        }

    } catch (error) {
        console.error(`Error calling or streaming from ${currentApiType} API:`, error);
        removeMessageByContentCheck(msg => msg.isThinking && msg.timestamp === thinkingMessage.timestamp);
        let friendlyError = t('apiCommErr');
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            friendlyError = t('networkErr');
        } else {
            friendlyError += ` ${error.message}`;
        }
        addMessageToChat({ role: 'model', parts: [{text: friendlyError}], timestamp: Date.now() });
    }
}


function addMessageToChat(message) {
    if (!message.parts || !Array.isArray(message.parts) || message.parts.some(p => typeof p.text !== 'string')) {
        if (typeof message.text === 'string') {
            message.parts = [{ text: message.text }];
        } else if (message.parts && typeof message.parts.text === 'string') {
             message.parts = [{ text: message.parts.text }];
        }
        else {
            console.warn("Correcting invalid message structure for chat:", message);
            message.parts = [{ text: "Invalid message" }];
        }
    }

    if (message.isTempStatus && message.parts[0].text.includes(t('linkSummaryProcessing'))) {
        removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text.includes(t('linkSummaryProcessing')));
    }
     if (message.isTempStatus && message.parts[0].text.includes(t('loadImage'))) {
        removeMessageByContentCheck(msg => msg.isTempStatus && msg.parts[0].text.includes(t('loadImage')));
    }

    const messageWithTimestamp = { ...message, timestamp: message.timestamp || Date.now()};
    currentChat.push(messageWithTimestamp);
    renderCurrentChat();
    if (!message.isTempStatus && !message.isThinking) {
      saveCurrentChat();
    }
    return messageWithTimestamp;
}


function renderCurrentChat() {
    if (!chatOutput) return;
    chatOutput.innerHTML = '';
    currentChat.forEach((msg, index) => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', msg.role === 'user' ? 'user' : 'ai');
        if (msg.isTempStatus) messageDiv.classList.add('temporary-status');
        if (msg.isThinking) messageDiv.classList.add('thinking-status');

        let contentHtml = '';
        const textContent = (msg.parts && msg.parts[0] && typeof msg.parts[0].text === 'string') ? msg.parts[0].text : "";

        if (msg.role === 'model' && typeof marked !== 'undefined' && typeof marked.parse === 'function' && !msg.isTempStatus && !msg.isThinking) {
            try {
                contentHtml = marked.parse(textContent);
            } catch (e) {
                console.error("Error parsing markdown:", e, "for text:", textContent);
                contentHtml = escapeHtml(textContent).replace(/\n/g, '<br>');
            }
        } else {
            contentHtml = escapeHtml(textContent).replace(/\n/g, '<br>');
        }

        const contentWrapper = document.createElement('div');
        contentWrapper.classList.add('message-content-wrapper');
        contentWrapper.innerHTML = contentHtml;
        messageDiv.appendChild(contentWrapper);
        
        const optionsLink = contentWrapper.querySelector('#open-options-link');
        if (optionsLink) {
            optionsLink.addEventListener('click', (e) => {
                e.preventDefault();
                chrome.runtime.openOptionsPage();
            });
        }

        const footerDiv = document.createElement('div');
        footerDiv.classList.add('message-footer');

        const timestampSpan = document.createElement('span');
        timestampSpan.classList.add('timestamp');
        timestampSpan.textContent = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const actionsContainer = document.createElement('div');
        actionsContainer.classList.add('message-actions');

        if (!msg.isThinking && !msg.isTempStatus && textContent) {
            const copyElement = document.createElement('span');
            copyElement.classList.add('copy-action');
            copyElement.innerHTML = '&#x1F4CB;'; // Clipboard icon 📋
            copyElement.title = 'Copy';
            copyElement.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(textContent).then(() => {
                    copyElement.textContent = '✅';
                    setTimeout(() => {
                        copyElement.innerHTML = '&#x1F4CB;';
                    }, 1500);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                });
            };
            actionsContainer.appendChild(copyElement);
        }

        if (msg.role === 'model' && !msg.isThinking && !msg.isTempStatus && !msg.archived) {
            const archiveElement = document.createElement('span');
            archiveElement.classList.add('archive-action');
            archiveElement.innerHTML = '&#x1F4C1;'; // Folder icon 📁
            archiveElement.title = 'Archive';
            archiveElement.onclick = (e) => {
                e.stopPropagation();
                archiveQaPair(index);
            };
            actionsContainer.appendChild(archiveElement);
        } else if (msg.archived) {
            const archivedTextSpan = document.createElement('span');
            archivedTextSpan.classList.add('archived-text');
            archivedTextSpan.textContent = 'Archived';
            actionsContainer.appendChild(archivedTextSpan);
        }

        footerDiv.appendChild(timestampSpan);
        footerDiv.appendChild(actionsContainer);

        messageDiv.appendChild(footerDiv);
        chatOutput.appendChild(messageDiv);
    });
    if (chatOutput.scrollHeight > chatOutput.clientHeight) {
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function clearSelectedTextPreview() {
    currentSelectedText = null;
    if (selectedTextPreview) selectedTextPreview.style.display = 'none';
    if (selectedTextContent) selectedTextContent.textContent = '';
}

function saveChatHistory() {
    const cleanAllChats = allChats.map(chat =>
        chat.filter(msg => !msg.isTempStatus && !msg.isThinking)
    ).filter(chat => chat.length > 0);
    chrome.storage.local.set({ 'geminiChatHistory': cleanAllChats });
}

function saveCurrentChat() {
    const chatToStore = currentChat.filter(msg => !(msg.isThinking || msg.isTempStatus));

    let existingChatIndex = -1;
    if (chatToStore.length > 0 && allChats.length > 0) {
        const firstMessageTimestamp = chatToStore[0].timestamp;
        existingChatIndex = allChats.findIndex(
            histChat => histChat.length > 0 && histChat[0].timestamp === firstMessageTimestamp
        );
    }

    if (chatToStore.length > 0) {
        if (existingChatIndex !== -1) {
            allChats[existingChatIndex] = [...chatToStore];
        } else {
            allChats.unshift([...chatToStore]);
        }
    }
    
    if (allChats.length > 50) {
        allChats = allChats.slice(0, 50);
    }
    saveChatHistory();
}


async function loadChatHistory() {
    return new Promise(resolve => {
        chrome.storage.local.get(['geminiChatHistory'], (result) => {
            if (result.geminiChatHistory) {
                allChats = result.geminiChatHistory.map(chat =>
                    chat.filter(msg => msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string' && !msg.isTempStatus && !msg.isThinking)
                ).filter(chat => chat.length > 0);
            } else {
                allChats = [];
            }

            if (currentChat.length === 0) {
                if (allChats.length > 0) {
                    currentChat = [...allChats[0]];
                } else {
                     currentChat = [];
                }
            }
            renderCurrentChat();
            resolve();
        });
    });
}

async function loadArchivedChats() {
    return new Promise(resolve => {
        chrome.storage.local.get(['geminiArchivedChats'], (result) => {
            if (result.geminiArchivedChats) {
                archivedChats = result.geminiArchivedChats;
            } else {
                archivedChats = [];
            }
            updateArchivedChatsButtonCount();
            resolve();
        });
    });
}

function saveArchivedChats() {
    const cleanArchivedChats = archivedChats.map(chat =>
        chat.map(msg => {
            const {isThinking, isTempStatus, ...rest} = msg;
            return rest;
        })
    );
    chrome.storage.local.set({ 'geminiArchivedChats': cleanArchivedChats }, () => {
        updateArchivedChatsButtonCount();
    });
}

document.addEventListener('DOMContentLoaded', initialize);

document.addEventListener('click', function(event) {
    if (event.target.tagName === 'A' && event.target.href && event.target.href.startsWith('http')) {
        event.preventDefault();
        chrome.tabs.create({ url: event.target.href });
    }
});