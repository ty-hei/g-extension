// g-extension/archive.js
document.addEventListener('DOMContentLoaded', async function() {
    const archivedChatsListDiv = document.getElementById('archivedChatsList');
    const clearAllArchivedButton = document.getElementById('clearAllArchivedButton');
    let archivedChats = [];
    let currentLanguage = 'zh'; // Default

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
            deleteFromArchive: "从此存档中删除",
            confirmDeleteChat: '确定要从存档中删除这个对话 ("{title}") 吗？此操作无法撤销。',
            confirmClearAll: "确定要永久删除所有已存档的对话吗？此操作无法撤销。",
            you: "你",
            ai: "AI",
            contentUnavailable: "内容不可用"
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
            deleteFromArchive: "Delete from archive",
            confirmDeleteChat: 'Are you sure you want to delete this chat ("{title}")? This cannot be undone.',
            confirmClearAll: "Are you sure you want to permanently delete ALL archived chats? This cannot be undone.",
            you: "You",
            ai: "AI",
            contentUnavailable: "Content unavailable"
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

    function renderArchivedChats() {
        if (!archivedChatsListDiv) return;
        archivedChatsListDiv.innerHTML = '';

        if (archivedChats.length === 0) {
            archivedChatsListDiv.innerHTML = `<p>${t('noArchives')}</p>`;
            return;
        }

        const sortedArchivedChats = [...archivedChats].sort((a, b) => {
            const tsA = a[0]?.timestamp || 0;
            const tsB = b[0]?.timestamp || 0;
            return tsB - tsA;
        });

        sortedArchivedChats.forEach((chat, index) => {
            if (!chat || chat.length === 0) return;

            const chatContainer = document.createElement('div');
            chatContainer.classList.add('archived-chat-item');

            let titleText = `Archive ${index + 1}`;
            const firstUserMsg = chat.find(msg => msg.role === 'user' && msg.parts && msg.parts[0] && msg.parts[0].text);
            const firstModelMsg = chat.find(msg => msg.role === 'model' && msg.parts && msg.parts[0] && msg.parts[0].text);

            if (chat.length === 2 && firstUserMsg && firstModelMsg) {
                titleText = `${t('qaPair')}: ${firstUserMsg.parts[0].text.substring(0, 40)}...`;
            } else if (firstUserMsg) {
                titleText = `${t('chatStarted')}: ${firstUserMsg.parts[0].text.substring(0, 40)}...`;
            } else if (firstModelMsg) {
                 titleText = `${t('chatStartedAI')}: ${firstModelMsg.parts[0].text.substring(0, 30)}...`;
            } else if (chat[0] && chat[0].parts && chat[0].parts[0] && chat[0].parts[0].text) {
                titleText = (chat[0].role === 'user' ? "User: " : "AI: ") + chat[0].parts[0].text.substring(0,40) + "...";
            }

            const titleHeader = document.createElement('h3');
            titleHeader.textContent = titleText;
            titleHeader.classList.add('archived-chat-title');
            titleHeader.addEventListener('click', () => {
                const contentDiv = chatContainer.querySelector('.archived-chat-content');
                contentDiv.style.display = contentDiv.style.display === 'none' ? 'block' : 'none';
            });
            chatContainer.appendChild(titleHeader);
            
            const archiveDateSpan = document.createElement('span');
            archiveDateSpan.classList.add('archive-date');
            archiveDateSpan.textContent = `${t('archivedAt')}: ${new Date(chat[0]?.timestamp || Date.now()).toLocaleDateString()}`;
            chatContainer.appendChild(archiveDateSpan);


            const chatContentDiv = document.createElement('div');
            chatContentDiv.classList.add('archived-chat-content');
            chatContentDiv.style.display = 'none'; 

            chat.forEach(msg => {
                const messageDiv = document.createElement('div');
                messageDiv.classList.add('message', msg.role === 'user' ? 'user-message' : 'ai-message');
                
                let contentHtml = t('contentUnavailable');
                if (msg.parts && msg.parts[0] && typeof msg.parts[0].text === 'string') {
                     contentHtml = escapeHtml(msg.parts[0].text).replace(/\n/g, '<br>');
                }
                const roleLabel = msg.role === 'user' ? t('you') : t('ai');
                messageDiv.innerHTML = `<strong>${roleLabel} (${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}):</strong><div class="msg-text-content">${contentHtml}</div>`;
                
                chatContentDiv.appendChild(messageDiv);
            });
            chatContainer.appendChild(chatContentDiv);
            
            const deleteButton = document.createElement('button');
            deleteButton.textContent = t('deleteFromArchive');
            deleteButton.classList.add('delete-archive-btn');
            deleteButton.onclick = (e) => {
                e.stopPropagation();
                if (confirm(t('confirmDeleteChat').replace('{title}', titleText))) {
                    const originalIndex = archivedChats.findIndex(originalChat => originalChat === chat);
                    if (originalIndex !== -1) {
                        archivedChats.splice(originalIndex, 1);
                        saveArchivedChats();
                        renderArchivedChats();
                    }
                }
            };
            chatContainer.appendChild(deleteButton);

            archivedChatsListDiv.appendChild(chatContainer);
        });
    }

    function loadArchivedChats() {
        chrome.storage.local.get(['geminiArchivedChats'], (result) => {
            if (result.geminiArchivedChats) {
                archivedChats = result.geminiArchivedChats;
            } else {
                archivedChats = [];
            }
            renderArchivedChats();
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
                renderArchivedChats();
            }
        });
    }
    
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.geminiArchivedChats) {
            archivedChats = changes.geminiArchivedChats.newValue || [];
            renderArchivedChats();
        }
        if (namespace === 'sync' && changes.interfaceLanguage) {
            currentLanguage = changes.interfaceLanguage.newValue || 'zh';
            updateInterfaceLanguage();
            renderArchivedChats(); // Re-render to update inner texts like "You/AI"
        }
    });

    loadArchivedChats();
});