// g-extension/archive.js
document.addEventListener('DOMContentLoaded', async function () {
    let archivedChats = [];
    let currentLanguage = 'zh'; // Default
    let currentApiKey = '';
    let currentApiType = 'gemini';
    let currentApiEndpoint = '';
    let currentModelName = globalThis.GExtensionApi?.DEFAULT_GEMINI_MODEL || 'gemini-3.5-flash';
    let activeChat = null; // Track active chat for sending messages
    let activeChatIdentity = null;
    let isArchiveRequestInFlight = false;
    let streamingArchiveMessageElement = null; // Track the DOM element being streamed to
    let isArchiveUserScrolling = false; // Track if user has manually scrolled
    let archiveScrollCheckTimeout = null; // Debounce scroll detection
    const MAX_ARCHIVE_HISTORY_CHARS = 40000;
    const ARCHIVE_API_TIMEOUT_MS = 2 * 60 * 1000;
    const ARCHIVE_STREAM_IDLE_TIMEOUT_MS = 30 * 1000;
    const MAX_ARCHIVE_RESPONSE_BYTES = 2 * 1024 * 1024;
    const MAX_ARCHIVE_RESPONSE_CHARS = 200000;

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

    function snapshotCurrentApiConfig() {
        return GExtensionApi.snapshotConfiguration({
            apiKey: currentApiKey,
            apiType: currentApiType,
            apiEndpoint: currentApiEndpoint,
            modelName: currentModelName
        }, { allowLoopbackHttp: true });
    }

    // --- DOM Elements ---
    const chatListContainer = document.getElementById('chat-list');
    const archivedChatsListDiv = chatListContainer; // Alias for compatibility
    const chatDetailContainer = document.getElementById('chat-detail-container');
    const clearAllArchivedButton = document.getElementById('clearAllArchivedButton');
    const archiveInputContainer = document.getElementById('archive-input-container');
    const archiveChatInput = document.getElementById('archive-chat-input');
    const archiveSendBtn = document.getElementById('archive-send-btn');
    const archiveCount = document.getElementById('archive-count');

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
            thinking: "思考中...",
            archiveCount: "{count} 个对话",
            openArchive: "打开存档对话",
            copyMessage: "复制消息",
            storageError: "本地对话存储失败"
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
            chatRestored: "Chat restored to history. Open sidebar to continue.",
            errorConfigIncomplete: "API configuration incomplete. Please check settings.",
            thinking: "Thinking...",
            archiveCount: "{count} conversations",
            openArchive: "Open archived conversation",
            copyMessage: "Copy message",
            storageError: "Local conversation storage failed"
        }
    };

    function t(key) {
        return (translations[currentLanguage] && translations[currentLanguage][key]) || translations['zh'][key] || key;
    }

    function updateInterfaceLanguage() {
        document.documentElement?.setAttribute('lang', currentLanguage === 'zh' ? 'zh-CN' : 'en');
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translatedText = t(key);
            if (translatedText !== key) {
                el.textContent = translatedText;
            }
        });
        document.title = t('archiveTitle');
        archiveSendBtn?.setAttribute('aria-label', currentLanguage === 'zh' ? '发送消息' : 'Send message');
        updateArchiveCount();
    }

    function updateArchiveCount() {
        if (archiveCount) {
            archiveCount.textContent = t('archiveCount').replace('{count}', archivedChats.length);
        }
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

    function getChatIdentity(chat) {
        const firstMessage = Array.isArray(chat) ? chat[0] : null;
        if (!firstMessage) return null;
        if (typeof firstMessage.archiveConversationId !== 'string' || !firstMessage.archiveConversationId) {
            const randomPart = globalThis.crypto?.randomUUID
                ? globalThis.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            firstMessage.archiveConversationId = `archive-${randomPart}`;
        }
        return firstMessage.archiveConversationId;
    }

    async function conversationStoreRequest(action, payload = {}) {
        const response = await chrome.runtime.sendMessage({ action, ...payload });
        if (!response?.success) throw new Error(response?.error || 'Conversation storage request failed.');
        return response;
    }

    function reportStorageError(error) {
        console.error('Archive: conversation storage failed', error);
        if (archiveCount) archiveCount.textContent = `${t('storageError')}: ${error.message}`;
    }

    function persistArchivedChat(chat, identity = getChatIdentity(chat)) {
        if (!identity || !Array.isArray(chat)) return;
        const index = archivedChats.findIndex(candidate => getChatIdentity(candidate) === identity);
        if (index >= 0) archivedChats[index] = chat;
        activeChat = chat;
        activeChatIdentity = identity;
        void conversationStoreRequest('conversationStoreUpsert', {
            kind: 'archive',
            id: identity,
            messages: chat
        }).catch(reportStorageError);
    }

    function renderArchivedChatsList() {
        if (!archivedChatsListDiv) return;
        archivedChatsListDiv.innerHTML = '';
        updateArchiveCount();

        if (archivedChats.length === 0) {
            archivedChatsListDiv.innerHTML = `<div class="empty-list">${t('noArchives')}</div>`;
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

            const chatItem = document.createElement('button');
            chatItem.type = 'button';
            chatItem.classList.add('chat-item');

            const titleText = getChatTitle(chat);
            chatItem.setAttribute('aria-label', `${t('openArchive')}: ${titleText}`);

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
    function removeChatMessage(chat, message) {
        const index = chat.indexOf(message);
        if (index >= 0) chat.splice(index, 1);
    }

    function buildBoundedArchiveHistory(historySnapshot, apiType) {
        const candidates = historySnapshot.filter(msg =>
            !msg.isTempStatus && !msg.isThinking && !msg.excludeFromApiHistory
        );
        const selected = [];
        let remaining = MAX_ARCHIVE_HISTORY_CHARS;
        for (let index = candidates.length - 1; index >= 0 && remaining > 0; index -= 1) {
            const message = candidates[index];
            const text = (message.parts || []).map(part => part.text || '').join('\n');
            const boundedText = text.length > remaining ? text.slice(text.length - remaining) : text;
            selected.unshift({ role: message.role, text: boundedText });
            remaining -= boundedText.length;
        }
        return selected.map(message => apiType === 'openai'
            ? { role: message.role === 'model' ? 'assistant' : message.role, content: message.text }
            : { role: message.role, parts: [{ text: message.text }] }
        );
    }

    function archiveTimeoutError() {
        const error = new Error('API request timed out.');
        error.name = 'TimeoutError';
        return error;
    }

    function archiveStreamError(code, message) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    async function readArchiveStreamChunk(reader, controller) {
        let timeout;
        try {
            return await Promise.race([
                reader.read(),
                new Promise((_, reject) => {
                    timeout = setTimeout(() => {
                        controller.abort();
                        reject(archiveTimeoutError());
                    }, ARCHIVE_STREAM_IDLE_TIMEOUT_MS);
                })
            ]);
        } finally {
            clearTimeout(timeout);
        }
    }

    async function consumeArchiveSse(reader, controller, onPayload) {
        const decoder = new TextDecoder();
        let buffer = '';
        let streamComplete = false;
        let responseBytes = 0;
        while (!streamComplete) {
            const { done, value } = await readArchiveStreamChunk(reader, controller);
            responseBytes += value?.byteLength || 0;
            if (responseBytes > MAX_ARCHIVE_RESPONSE_BYTES) {
                throw archiveStreamError('API_RESPONSE_TOO_LARGE', 'API response exceeded the safe size limit.');
            }
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = done ? '' : lines.pop();
            for (const rawLine of lines) {
                const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
                if (!line.startsWith('data:')) continue;
                const dataText = line.slice(5).trimStart();
                if (dataText === '[DONE]') {
                    streamComplete = true;
                    break;
                }
                let payload;
                try {
                    payload = JSON.parse(dataText);
                } catch (error) {
                    console.warn('Archive: invalid SSE payload', error);
                    continue;
                }
                onPayload(payload);
            }
            if (done) break;
        }
        return { doneMarkerSeen: streamComplete };
    }

    async function callApi(userMessageContent, chat) {
        const chatIdentity = getChatIdentity(chat);
        let apiConfig;
        try {
            apiConfig = snapshotCurrentApiConfig();
        } catch (_) {
            alert(t('errorConfigIncomplete') || "API Configuration missing.");
            persistArchivedChat(chat, chatIdentity);
            return false;
        }

        const historySnapshot = chat
            .filter(msg => !msg.isTempStatus && !msg.isThinking && !msg.excludeFromApiHistory)
            .map(msg => ({ ...msg, parts: (msg.parts || []).map(part => ({ ...part })) }));
        const lastHistoryMessage = historySnapshot[historySnapshot.length - 1];
        const lastHistoryText = lastHistoryMessage?.parts?.map(part => part.text || '').join('\n') || '';
        if (lastHistoryMessage?.role !== 'user' || lastHistoryText !== userMessageContent) {
            historySnapshot.push({ role: 'user', parts: [{ text: userMessageContent }], timestamp: Date.now() });
        }

        const { apiType, apiKey, apiEndpoint, modelName } = apiConfig;
        const historyForAPI = buildBoundedArchiveHistory(historySnapshot, apiType);
        const thinkingMsg = { role: 'model', parts: [{ text: t('thinking') || "Thinking..." }], timestamp: Date.now(), isThinking: true };
        chat.push(thinkingMsg);
        renderChatDetails(chat, getChatTitle(chat));

        const headers = { 'Content-Type': 'application/json' };
        let endpoint;
        let requestBody;
        if (apiType === 'gemini') {
            const geminiRequest = GExtensionApi.buildGeminiRequest(apiKey, modelName, 'streamGenerateContent', { stream: true });
            endpoint = geminiRequest.endpoint;
            Object.assign(headers, geminiRequest.headers);
            requestBody = { contents: historyForAPI };
        } else if (apiType === 'openai') {
            endpoint = apiEndpoint;
            headers.Authorization = `Bearer ${apiKey}`;
            requestBody = { model: modelName, messages: historyForAPI, stream: true };
        } else {
            removeChatMessage(chat, thinkingMsg);
            chat.push({ role: 'model', parts: [{ text: `Error: unsupported API type ${apiType}` }], timestamp: Date.now() });
            persistArchivedChat(chat, chatIdentity);
            renderChatDetails(chat, getChatTitle(chat));
            return false;
        }

        const controller = new AbortController();
        let requestTimedOut = false;
        let reader = null;
        let aiMsg = null;
        const totalTimeout = setTimeout(() => {
            requestTimedOut = true;
            controller.abort();
        }, ARCHIVE_API_TIMEOUT_MS);
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (!response.body) throw new Error('The API response did not include a readable stream.');

            removeChatMessage(chat, thinkingMsg);
            aiMsg = {
                role: 'model',
                parts: [{ text: '' }],
                timestamp: Date.now(),
                isStreaming: true,
                excludeFromApiHistory: true
            };
            chat.push(aiMsg);
            renderChatDetails(chat, getChatTitle(chat));
            const allMessages = chatDetailContainer.querySelectorAll('.message');
            streamingArchiveMessageElement = allMessages[allMessages.length - 1];
            reader = response.body.getReader();

            let responseText = '';
            let providerFinished = false;
            const streamState = await consumeArchiveSse(reader, controller, data => {
                if (apiType === 'gemini' && data.candidates?.some(candidate => candidate.finishReason)) {
                    providerFinished = true;
                }
                if (apiType === 'openai' && data.choices?.some(choice => choice.finish_reason)) {
                    providerFinished = true;
                }
                const chunkText = apiType === 'gemini'
                    ? data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || ''
                    : data.choices?.[0]?.delta?.content || '';
                if (!chunkText) return;
                if (responseText.length + chunkText.length > MAX_ARCHIVE_RESPONSE_CHARS) {
                    throw archiveStreamError('API_RESPONSE_TOO_LARGE', 'API response exceeded the safe size limit.');
                }
                responseText += chunkText;
                aiMsg.parts[0].text = responseText;
                updateStreamingArchiveMessage(responseText, streamingArchiveMessageElement);
            });
            if (!responseText) throw new Error('The API returned an empty stream.');
            if (!streamState.doneMarkerSeen && !providerFinished) {
                throw archiveStreamError('API_STREAM_INCOMPLETE', 'API stream ended before a completion marker was received.');
            }

            delete aiMsg.isStreaming;
            delete aiMsg.excludeFromApiHistory;
            finalizeStreamingArchiveMessage(streamingArchiveMessageElement);
            persistArchivedChat(chat, chatIdentity);
            return true;
        } catch (error) {
            console.error("API Error:", error);
            removeChatMessage(chat, thinkingMsg);
            if (aiMsg) removeChatMessage(chat, aiMsg);
            const message = requestTimedOut || error?.name === 'AbortError' || error?.name === 'TimeoutError'
                ? 'Error: API request timed out.'
                : `Error: ${error.message}`;
            chat.push({
                role: 'model',
                parts: [{ text: message }],
                timestamp: Date.now(),
                excludeFromApiHistory: true
            });
            renderChatDetails(chat, getChatTitle(chat));
            persistArchivedChat(chat, chatIdentity);
            return false;
        } finally {
            clearTimeout(totalTimeout);
            if (reader) {
                try {
                    await reader.cancel();
                } catch (_) {
                    // The stream may already be closed or aborted.
                }
            }
        }
    }

    async function handleSendMessage() {
        if (isArchiveRequestInFlight) return;
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
        const requestChat = activeChat;
        const requestChatIdentity = activeChatIdentity || getChatIdentity(requestChat);
        requestChat.push({ role: 'user', parts: [{ text: text }], timestamp: Date.now() });
        renderChatDetails(requestChat, getChatTitle(requestChat));
        persistArchivedChat(requestChat, requestChatIdentity);

        // Scroll to bottom
        const msgContainer = document.querySelector('.chat-detail-view');
        if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;

        isArchiveRequestInFlight = true;
        if (archiveSendBtn) archiveSendBtn.disabled = true;
        if (archiveChatInput) archiveChatInput.disabled = true;
        try {
            await callApi(text, requestChat);
        } finally {
            isArchiveRequestInFlight = false;
            if (archiveSendBtn) archiveSendBtn.disabled = false;
            if (archiveChatInput) archiveChatInput.disabled = false;
        }
    }

    // Efficiently update only the streaming message content
    function updateStreamingArchiveMessage(text, messageElement = streamingArchiveMessageElement) {
        if (!messageElement) return;

        const contentWrapper = messageElement.querySelector('.message-content');
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
    function finalizeStreamingArchiveMessage(messageElement = streamingArchiveMessageElement) {
        if (!messageElement) return;

        const contentWrapper = messageElement.querySelector('.message-content');
        if (contentWrapper) {
            const text = contentWrapper.textContent;
            try {
                contentWrapper.innerHTML = renderSafeMarkdown(text);
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
        activeChatIdentity = getChatIdentity(chat);
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
        deleteBtn.classList.add('action-btn', 'danger');

        deleteBtn.onclick = () => {
            if (confirm(t('confirmDeleteChat').replace('{title}', titleText))) {
                const chatIdentity = getChatIdentity(chat);
                const originalIndex = archivedChats.findIndex(originalChat => getChatIdentity(originalChat) === chatIdentity);
                if (originalIndex !== -1) {
                    archivedChats.splice(originalIndex, 1);
                    void conversationStoreRequest('conversationStoreDelete', {
                        kind: 'archive',
                        id: chatIdentity
                    }).catch(reportStorageError);
                    renderArchivedChatsList();
                    renderEmptyState();
                    activeChat = null;
                    activeChatIdentity = null;
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
            copyBtn.title = t('copyMessage');
            copyBtn.setAttribute('aria-label', t('copyMessage'));
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
                if (msg.role === 'model' && typeof renderSafeMarkdown === 'function') {
                    try {
                        contentHtml = renderSafeMarkdown(msg.parts[0].text);
                    } catch (e) {
                        console.error("Markdown parse error:", e);
                        contentHtml = escapeHtml(msg.parts[0].text).replace(/\n/g, '<br>');
                    }
                } else {
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

    async function loadArchivedChats() {
        try {
            const result = await conversationStoreRequest('conversationStoreList', { kind: 'archive' });
            archivedChats = result.records.map(record => {
                if (record.messages[0]) record.messages[0].archiveConversationId = record.id;
                return record.messages;
            });
            let identityAdded = false;
            archivedChats.forEach(chat => {
                const firstMessage = Array.isArray(chat) ? chat[0] : null;
                if (firstMessage && !firstMessage.archiveConversationId) {
                    getChatIdentity(chat);
                    identityAdded = true;
                }
            });
            if (identityAdded) saveArchivedChats();
            renderArchivedChatsList();
        } catch (error) {
            archivedChats = [];
            renderArchivedChatsList();
            reportStorageError(error);
        }
    }

    function saveArchivedChats() {
        archivedChats.forEach(chat => {
            const identity = getChatIdentity(chat);
            if (!identity) return;
            void conversationStoreRequest('conversationStoreUpsert', {
                kind: 'archive',
                id: identity,
                messages: chat
            }).catch(reportStorageError);
        });
    }

    if (clearAllArchivedButton) {
        clearAllArchivedButton.addEventListener('click', () => {
            if (confirm(t('confirmClearAll'))) {
                archivedChats = [];
                activeChat = null;
                activeChatIdentity = null;
                void conversationStoreRequest('conversationStoreClear', { kind: 'archive' })
                    .catch(reportStorageError);
                renderArchivedChatsList();
                renderEmptyState();
            }
        });
    }

    chrome.runtime.onMessage.addListener((message, sender) => {
        const isBackgroundSender = sender?.id === chrome.runtime.id && !sender.tab &&
            (!sender.url || sender.url === chrome.runtime.getURL('background.js'));
        if (message?.type === 'CONVERSATION_STORE_CHANGED' && message.kind === 'archive' && isBackgroundSender) {
            const selectedIdentity = activeChatIdentity;
            void loadArchivedChats().then(() => {
                const reboundChat = selectedIdentity
                    ? archivedChats.find(chat => getChatIdentity(chat) === selectedIdentity) || null
                    : null;
                if (reboundChat) {
                    activeChat = reboundChat;
                    activeChatIdentity = selectedIdentity;
                    renderChatDetails(reboundChat, getChatTitle(reboundChat));
                } else if (selectedIdentity || archivedChats.length === 0) {
                    activeChat = null;
                    activeChatIdentity = null;
                    renderEmptyState();
                }
            });
        }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.interfaceLanguage) {
            currentLanguage = changes.interfaceLanguage.newValue || 'zh';
            updateInterfaceLanguage();
            renderArchivedChatsList();
            renderEmptyState();
        }
        if (namespace === 'sync' && (changes.apiConfigurations || changes.activeConfigurationId)) {
            void initializeApi();
        }
    });

    loadArchivedChats();
});
