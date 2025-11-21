// g-extension/archive.js
document.addEventListener('DOMContentLoaded', async function () {
    let archivedChats = [];
    let currentLanguage = 'zh'; // Default
    let currentApiKey = '';
    let currentApiType = 'gemini';
    let currentApiEndpoint = '';
    let currentModelName = 'gemini-1.5-flash';
    let activeChat = null; // Track active chat for sending messages
    let streamingArchiveMessageElement = null; // Track the DOM element being streamed to
    let isArchiveUserScrolling = false; // Track if user has manually scrolled
    let archiveScrollCheckTimeout = null; // Debounce scroll detection

    // --- API Initialization ---
    async function initializeApi() {
        try {
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

            if (activeConfig) {
                currentApiKey = activeConfig.apiKey;
                currentApiType = activeConfig.apiType;
                currentApiEndpoint = activeConfig.apiEndpoint || '';
                currentModelName = activeConfig.modelName;
            }
        } catch (e) {
            console.error("Error loading API configuration:", e);
        }
    }

    // --- DOM Elements ---
    const chatListContainer = document.getElementById('chat-list');
    const archivedChatsListDiv = chatListContainer; // Alias for compatibility
    const chatDetailContainer = document.getElementById('chat-detail-container');
    const clearAllArchivedButton = document.getElementById('clearAllArchivedButton');
    const archiveInputContainer = document.getElementById('archive-input-container');
    const archiveChatInput = document.getElementById('archive-chat-input');
    const archiveSendBtn = document.getElementById('archive-send-btn');

    // Detect when user manually scrolls in archive
    const archiveChatContainer = document.querySelector('.chat-detail-view');
    if (archiveChatContainer) {
        archiveChatContainer.addEventListener('wheel', () => {
            isArchiveUserScrolling = true;
            clearTimeout(archiveScrollCheckTimeout);
            // Reset after 2 seconds of no scrolling
            archiveScrollCheckTimeout = setTimeout(() => {
                isArchiveUserScrolling = false;
            }, 2000);
        });
    }

    // --- Initialize API ---
    await initializeApi();

    // --- Event Listeners for Chat Input ---
    if (archiveSendBtn) {
        archiveSendBtn.addEventListener('click', handleSendMessage);
    }
    if (archiveChatInput) {
        archiveChatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
        // Auto-resize textarea
        archiveChatInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }

    const translations = {
        zh: {
            archiveTitle: "已存档的对话",
            loadingArchive: "正在加载存档...",
            clearAllArchives: "清空所有存档",
            noArchives: "没有已存档的对话。",
            qaPair: "问答",
            chatStarted: "对话始于",
            chatStartedAI: "对话始于 (AI)",
            archivedAt: "存档于",
            deleteFromArchive: "删除",
            confirmDeleteChat: '确定要从存档中删除这个对话 ("{title}") 吗？此操作无法撤销。',
            confirmClearAll: "确定要永久删除所有已存档的对话吗？此操作无法撤销。",
            you: "你",
            ai: "AI",
            contentUnavailable: "内容不可用",
            selectChatToView: "请选择一个对话查看详情",
            continueChat: "继续对话",
            chatRestored: "对话已恢复到历史记录。请打开侧边栏继续聊天。",
            errorConfigIncomplete: "API配置不完整，请在设置中检查。",
            thinking: "思考中..."
        },
        en: {
            archiveTitle: "Archived Chats",
            loadingArchive: "Loading archives...",
            clearAllArchives: "Clear All Archives",
            noArchives: "No archived chats found.",
            qaPair: "Q&A",
            chatStarted: "Chat started with",
            chatStartedAI: "Chat started with (AI)",
            archivedAt: "Archived at",
            deleteFromArchive: "Delete",
            confirmDeleteChat: 'Are you sure you want to delete this chat ("{title}")? This cannot be undone.',
            confirmClearAll: "Are you sure you want to permanently delete ALL archived chats? This cannot be undone.",
            you: "You",
            ai: "AI",
            contentUnavailable: "Content unavailable",
            selectChatToView: "Select a chat to view details",
            continueChat: "Continue Chat",
            chatRestored: "Chat restored to history. Open sidebar to continue."
        }
    };

    function t(key) {
        return translations[currentLanguage][key] || translations['zh'][key] || key;
    }

    function updateInterfaceLanguage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[currentLanguage][key]) {
                el.textContent = translations[currentLanguage][key];
            }
        });
        document.title = t('archiveTitle');
    }

    // Load language setting
    const configResult = await chrome.storage.sync.get(['interfaceLanguage']);
    if (configResult.interfaceLanguage) {
        currentLanguage = configResult.interfaceLanguage;
    }
    updateInterfaceLanguage();


    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getChatTitle(chat) {
        let titleText = "Archive";
        const firstUserMsg = chat.find(msg => msg.role === 'user' && msg.parts && msg.parts[0] && msg.parts[0].text);
        const firstModelMsg = chat.find(msg => msg.role === 'model' && msg.parts && msg.parts[0] && msg.parts[0].text);

        if (chat.length === 2 && firstUserMsg && firstModelMsg) {
            titleText = `${t('qaPair')}: ${firstUserMsg.parts[0].text.substring(0, 30)}...`;
        } else if (firstUserMsg) {
            titleText = `${t('chatStarted')}: ${firstUserMsg.parts[0].text.substring(0, 30)}...`;
        } else if (firstModelMsg) {
            titleText = `${t('chatStartedAI')}: ${firstModelMsg.parts[0].text.substring(0, 30)}...`;
        } else if (chat[0] && chat[0].parts && chat[0].parts[0] && chat[0].parts[0].text) {
            titleText = (chat[0].role === 'user' ? "User: " : "AI: ") + chat[0].parts[0].text.substring(0, 30) + "...";
        }
        return titleText;
    }

    function renderArchivedChatsList() {
        if (!archivedChatsListDiv) return;
        archivedChatsListDiv.innerHTML = '';

        if (archivedChats.length === 0) {
            archivedChatsListDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">${t('noArchives')}</div>`;
            renderEmptyState();
            return;
        }

        const sortedArchivedChats = [...archivedChats].sort((a, b) => {
            const tsA = a[0]?.timestamp || 0;
            const tsB = b[0]?.timestamp || 0;
            return tsB - tsA;
        });

        sortedArchivedChats.forEach((chat, index) => {
            if (!chat || chat.length === 0) return;

            const chatItem = document.createElement('div');
            chatItem.classList.add('chat-item');

            const titleText = getChatTitle(chat);

            const titleDiv = document.createElement('div');
            titleDiv.classList.add('chat-item-title');
            titleDiv.textContent = titleText;

            const dateDiv = document.createElement('div');
            dateDiv.classList.add('chat-item-date');
            dateDiv.textContent = new Date(chat[0]?.timestamp || Date.now()).toLocaleDateString();

            chatItem.appendChild(titleDiv);
            chatItem.appendChild(dateDiv);

            chatItem.addEventListener('click', () => {
                // Remove active class from all items
                document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
                // Add active class to clicked item
                chatItem.classList.add('active');
                // Render chat details
                renderChatDetails(chat, titleText);
            });

            archivedChatsListDiv.appendChild(chatItem);
        });
    }

    function renderEmptyState() {
        chatDetailContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <p>${t('selectChatToView')}</p>
            </div>
        `;
        if (archiveInputContainer) archiveInputContainer.style.display = 'none';
    }

    // --- API Logic ---
    async function callApi(userMessageContent, currentChat) {
        if (!currentApiKey || !currentModelName) {
            alert(t('errorConfigIncomplete') || "API Configuration missing.");
            return;
        }

        // Add Thinking Message
        const thinkingMsg = { role: 'model', parts: [{ text: t('thinking') || "Thinking..." }], timestamp: Date.now(), isThinking: true };
        currentChat.push(thinkingMsg);
        renderChatDetails(currentChat, currentChat[0].parts[0].text.substring(0, 20)); // Re-render to show thinking

        let endpoint = '';
        let requestBody = {};
        let headers = { 'Content-Type': 'application/json' };

        const historyForAPI = currentChat
            .filter(msg => msg.timestamp < thinkingMsg.timestamp && !msg.isTempStatus && !msg.isThinking)
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

        try {
            let responseText = "";

            if (currentApiType === 'gemini') {
                endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${currentModelName}:streamGenerateContent?key=${currentApiKey}&alt=sse`;
                requestBody = { contents: historyForAPI }; // History already includes the new user message

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                // Remove thinking message
                currentChat.pop();
                const aiMsg = { role: 'model', parts: [{ text: "" }], timestamp: Date.now() };
                currentChat.push(aiMsg);

                // Render the chat to create DOM elements, then grab reference to the new message
                renderChatDetails(currentChat, currentChat[0].parts[0].text.substring(0, 20));
                // Get the last message element (the one we just added)
                const allMessages = chatDetailContainer.querySelectorAll('.message');
                streamingArchiveMessageElement = allMessages[allMessages.length - 1];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.substring(6).trim();
                            if (dataStr === '[DONE]') break;
                            try {
                                const data = JSON.parse(dataStr);
                                if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
                                    const text = data.candidates[0].content.parts[0].text;
                                    responseText += text;
                                    aiMsg.parts[0].text = responseText;
                                    // Update only the streaming message instead of re-rendering
                                    updateStreamingArchiveMessage(responseText);
                                }
                            } catch (e) { /* ignore parse errors */ }
                        }
                    }
                }
            } else if (currentApiType === 'openai') {
                endpoint = currentApiEndpoint;
                headers['Authorization'] = `Bearer ${currentApiKey}`;
                requestBody = {
                    model: currentModelName,
                    messages: historyForAPI,
                    stream: true
                };

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                // Remove thinking message
                currentChat.pop();
                const aiMsg = { role: 'model', parts: [{ text: "" }], timestamp: Date.now() };
                currentChat.push(aiMsg);

                // Render the chat to create DOM elements, then grab reference to the new message
                renderChatDetails(currentChat, currentChat[0].parts[0].text.substring(0, 20));
                // Get the last message element (the one we just added)
                const allMessages = chatDetailContainer.querySelectorAll('.message');
                streamingArchiveMessageElement = allMessages[allMessages.length - 1];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.substring(6).trim();
                            if (dataStr === '[DONE]') break;
                            try {
                                const data = JSON.parse(dataStr);
                                if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                                    const text = data.choices[0].delta.content;
                                    responseText += text;
                                    aiMsg.parts[0].text = responseText;
                                    updateStreamingArchiveMessage(responseText);
                                }
                            } catch (e) { /* ignore */ }
                        }
                    }
                }
            }

            // Apply markdown formatting to the final message
            finalizeStreamingArchiveMessage();
            saveArchivedChats(); // Save after response

        } catch (error) {
            console.error("API Error:", error);
            currentChat.pop(); // Remove thinking
            currentChat.push({ role: 'model', parts: [{ text: `Error: ${error.message}` }], timestamp: Date.now() });
            renderChatDetails(currentChat, currentChat[0].parts[0].text.substring(0, 20));
        }
    }

    async function handleSendMessage() {
        const text = archiveChatInput.value.trim();
        if (!text) return;

        // Find current chat
        // We need to know WHICH chat is active. 
        // renderChatDetails doesn't store the active chat index globally.
        // Let's store it in a variable when rendering.
        if (!activeChat) return;

        archiveChatInput.value = '';
        archiveChatInput.style.height = 'auto';

        // Add User Message
        activeChat.push({ role: 'user', parts: [{ text: text }], timestamp: Date.now() });
        renderChatDetails(activeChat, activeChat[0].parts[0].text.substring(0, 20));

        // Scroll to bottom
        const msgContainer = document.querySelector('.chat-detail-view');
        if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

        await callApi(text, activeChat);
    }

    // Efficiently update only the streaming message content
    function updateStreamingArchiveMessage(text) {
        if (!streamingArchiveMessageElement) return;

        const contentWrapper = streamingArchiveMessageElement.querySelector('.message-content');
        if (contentWrapper) {
            // Use plain text during streaming for performance
            contentWrapper.textContent = text;

            // Auto-scroll if user hasn't manually scrolled
            const msgContainer = document.querySelector('.chat-detail-view');
            if (!isArchiveUserScrolling && msgContainer) {
                msgContainer.scrollTop = msgContainer.scrollHeight;
            }
        }
    }

    // Apply markdown to the final streamed message
    function finalizeStreamingArchiveMessage() {
        if (!streamingArchiveMessageElement) return;

        const contentWrapper = streamingArchiveMessageElement.querySelector('.message-content');
        if (contentWrapper) {
            const text = contentWrapper.textContent;
            try {
                contentWrapper.innerHTML = marked.parse(text);
            } catch (e) {
                console.error("Error parsing final markdown:", e);
                const escaped = text.replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
                contentWrapper.innerHTML = escaped.replace(/\n/g, '<br>');
            }
        }
        streamingArchiveMessageElement = null;
        isArchiveUserScrolling = false; // Reset for next stream
    }

    function renderChatDetails(chat, titleText) {
        activeChat = chat; // Set active chat
        chatDetailContainer.innerHTML = '';

        // Show input container
        if (archiveInputContainer) archiveInputContainer.style.display = 'block';

        const headerDiv = document.createElement('div');
        headerDiv.classList.add('chat-header');

        const titleH2 = document.createElement('h2');
        titleH2.classList.add('chat-title-large');
        titleH2.textContent = titleText;

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = t('deleteFromArchive');
        deleteBtn.classList.add('action-btn');
        deleteBtn.style.color = '#ef4444';
        deleteBtn.style.borderColor = '#ef4444';

        deleteBtn.onclick = () => {
            if (confirm(t('confirmDeleteChat').replace('{title}', titleText))) {
                const originalIndex = archivedChats.findIndex(originalChat => originalChat === chat);
                if (originalIndex !== -1) {
                    archivedChats.splice(originalIndex, 1);
                    saveArchivedChats();
                    renderArchivedChatsList();
                    renderEmptyState();
                    activeChat = null;
                }
            }
        };

        const actionsDiv = document.createElement('div');
        actionsDiv.appendChild(deleteBtn);

        headerDiv.appendChild(titleH2);
        headerDiv.appendChild(actionsDiv);
        chatDetailContainer.appendChild(headerDiv);

        // Messages
        chat.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message', msg.role === 'user' ? 'user-message' : 'ai-message');

            const roleLabel = msg.role === 'user' ? t('you') : t('ai');
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const msgHeader = document.createElement('div');
            msgHeader.classList.add('message-header');

            const infoSpan = document.createElement('span');
            infoSpan.textContent = `${roleLabel} • ${timeStr}`;
            msgHeader.appendChild(infoSpan);

            // Copy Button
            const copyBtn = document.createElement('button');
            copyBtn.classList.add('copy-btn');
            copyBtn.innerHTML = '📋'; // Simple icon, can be SVG
            copyBtn.title = 'Copy';
            copyBtn.onclick = async () => {
                if (msg.parts && msg.parts[0] && typeof msg.parts[0].text === 'string') {
                    try {
                        await navigator.clipboard.writeText(msg.parts[0].text);
                        const originalText = copyBtn.innerHTML;
                        copyBtn.innerHTML = '✅';
                        setTimeout(() => copyBtn.innerHTML = originalText, 2000);
                    } catch (err) {
                        console.error('Failed to copy:', err);
                    }
                }
            };
            msgHeader.appendChild(copyBtn);

            let contentHtml = t('contentUnavailable');
            if (msg.parts && msg.parts[0] && typeof msg.parts[0].text === 'string') {
                // Use marked to render Markdown
                try {
                    contentHtml = marked.parse(msg.parts[0].text);
                } catch (e) {
                    console.error("Markdown parse error:", e);
                    contentHtml = escapeHtml(msg.parts[0].text).replace(/\n/g, '<br>');
                }
            }

            const msgContent = document.createElement('div');
            msgContent.classList.add('message-content', 'markdown-body'); // Add markdown-body class for styling
            msgContent.innerHTML = contentHtml;

            messageDiv.appendChild(msgHeader);
            messageDiv.appendChild(msgContent);
            chatDetailContainer.appendChild(messageDiv);
        });
    }

    function loadArchivedChats() {
        chrome.storage.local.get(['geminiArchivedChats'], (result) => {
            if (result.geminiArchivedChats) {
                archivedChats = result.geminiArchivedChats;
            } else {
                archivedChats = [];
            }
            renderArchivedChatsList();
        });
    }

    function saveArchivedChats() {
        chrome.storage.local.set({ 'geminiArchivedChats': archivedChats });
    }

    if (clearAllArchivedButton) {
        clearAllArchivedButton.addEventListener('click', () => {
            if (confirm(t('confirmClearAll'))) {
                archivedChats = [];
                saveArchivedChats();
                renderArchivedChatsList();
                renderEmptyState();
            }
        });
    }

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.geminiArchivedChats) {
            archivedChats = changes.geminiArchivedChats.newValue || [];
            renderArchivedChatsList();
            // If the currently viewed chat is deleted (not in new list), show empty state
            // This is a bit complex to track perfectly without IDs, but re-rendering list is safe.
            // For now, let's just keep the view if possible or reset if list is empty.
            if (archivedChats.length === 0) {
                renderEmptyState();
            }
        }
        if (namespace === 'sync' && changes.interfaceLanguage) {
            currentLanguage = changes.interfaceLanguage.newValue || 'zh';
            updateInterfaceLanguage();
            renderArchivedChatsList();
            renderEmptyState();
        }
    });

    loadArchivedChats();
});