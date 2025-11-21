// g-extension/content_script.js

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageContentForSummarize") {
        // Simple extraction for now, can be improved with Readability if injected
        const content = document.body.innerText;
        sendResponse({ contentForSummary: content });
    }
    return true;
});

// Listen for text selection to send to sidebar
document.addEventListener('mouseup', () => {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length > 0) {
        chrome.runtime.sendMessage({
            action: "TEXT_SELECTED_FROM_PAGE",
            text: selectedText
        });
    }
});

// === Link Drag & Drop Preview Window ===
let previewBox = null;
let currentDraggedLink = null;
let isDraggingLink = false;

// Create floating preview box
function createPreviewBox() {
    if (previewBox) return;

    previewBox = document.createElement('div');
    previewBox.id = 'g-extension-link-preview';
    previewBox.style.display = 'none'; // Hidden by default
    previewBox.innerHTML = `
        <div class="g-preview-header">
            <strong>🔗 链接预览</strong>
            <button class="g-preview-close" title="关闭">×</button>
        </div>
        <div class="g-preview-content">
            <p class="g-preview-hint">拖动链接到这里</p>
            <div class="g-preview-link-info" style="display: none;">
                <p class="g-preview-link-text"></p>
                <button class="g-preview-summarize-btn">总结此链接</button>
            </div>
        </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        #g-extension-link-preview {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 280px;
            background: white;
            border: 2px solid #4285f4;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
            transition: all 0.3s;
            animation: slideIn 0.3s;
        }
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        #g-extension-link-preview.drag-over {
            background: #e8f0fe;
            transform: scale(1.05);
            border-color: #1967d2;
        }
        .g-preview-header {
            padding: 12px 16px;
            background: #4285f4;
            color: white;
            border-radius: 10px 10px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .g-preview-header strong {
            font-size: 13px;
            font-weight: 600;
        }
        .g-preview-close {
            background: transparent;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            line-height: 1;
            opacity: 0.8;
            transition: opacity 0.2s;
        }
        .g-preview-close:hover {
            opacity: 1;
        }
        .g-preview-content {
            padding: 16px;
        }
        .g-preview-hint {
            text-align: center;
            color: #5f6368;
            margin: 20px 0;
            font-size: 13px;
        }
        .g-preview-link-info {
            text-align: center;
        }
        .g-preview-link-text {
            font-size: 12px;
            color: #202124;
            margin-bottom: 12px;
            word-break: break-all;
            line-height: 1.4;
        }
        .g-preview-summarize-btn {
            background: #4285f4;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.2s;
            width: 100%;
        }
        .g-preview-summarize-btn:hover {
            background: #1967d2;
        }
        @media (prefers-color-scheme: dark) {
            #g-extension-link-preview {
                background: #292a2d;
                border-color: #8ab4f8;
            }
            #g-extension-link-preview.drag-over {
                background: #3c4043;
            }
            .g-preview-header {
                background: #8ab4f8;
                color: #202124;
            }
            .g-preview-close {
                color: #202124;
            }
            .g-preview-hint {
                color: #9aa0a6;
            }
            .g-preview-link-text {
                color: #e8eaed;
            }
            .g-preview-summarize-btn {
                background: #8ab4f8;
                color: #202124;
            }
            .g-preview-summarize-btn:hover {
                background: #aecbfa;
            }
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(previewBox);

    // Event listeners
    const closeBtn = previewBox.querySelector('.g-preview-close');
    closeBtn.addEventListener('click', () => {
        hidePreviewBox();
    });

    const summarizeBtn = previewBox.querySelector('.g-preview-summarize-btn');
    summarizeBtn.addEventListener('click', async () => {
        if (currentDraggedLink) {
            // Open sidebar first
            await chrome.runtime.sendMessage({ action: 'openSidePanel' });

            // Then send summarize request
            chrome.runtime.sendMessage({
                action: 'summarizeLinkTarget',
                url: currentDraggedLink,
                linkText: currentDraggedLink
            });
            hidePreviewBox();
        }
    });

    // Drag events on preview box
    previewBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        previewBox.classList.add('drag-over');
    });

    previewBox.addEventListener('dragleave', () => {
        previewBox.classList.remove('drag-over');
    });

    previewBox.addEventListener('drop', async (e) => {
        e.preventDefault();
        previewBox.classList.remove('drag-over');

        const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
        if (url && url.startsWith('http')) {
            currentDraggedLink = url;
            showLinkInfo(url);

            // Open sidebar when link is dropped
            await chrome.runtime.sendMessage({ action: 'openSidePanel' });
        }
    });
}

function showPreviewBox() {
    if (!previewBox) createPreviewBox();
    previewBox.style.display = 'block';
    resetPreviewBox();
}

function hidePreviewBox() {
    if (previewBox) {
        previewBox.style.display = 'none';
        resetPreviewBox();
    }
}

function showLinkInfo(url) {
    const hint = previewBox.querySelector('.g-preview-hint');
    const linkInfo = previewBox.querySelector('.g-preview-link-info');
    const linkText = previewBox.querySelector('.g-preview-link-text');

    hint.style.display = 'none';
    linkInfo.style.display = 'block';
    linkText.textContent = url;
}

function resetPreviewBox() {
    if (!previewBox) return;

    const hint = previewBox.querySelector('.g-preview-hint');
    const linkInfo = previewBox.querySelector('.g-preview-link-info');

    hint.style.display = 'block';
    linkInfo.style.display = 'none';
    currentDraggedLink = null;
}

// Listen for drag events on links
document.addEventListener('dragstart', (e) => {
    // Check if dragging a link
    if (e.target.tagName === 'A' && e.target.href) {
        isDraggingLink = true;
        showPreviewBox();
    }
});

document.addEventListener('dragend', () => {
    if (isDraggingLink) {
        isDraggingLink = false;
        // Hide preview box after a delay if no link was dropped
        setTimeout(() => {
            if (!currentDraggedLink) {
                hidePreviewBox();
            }
        }, 300);
    }
});

// Initialize preview box structure when page loads (but keep it hidden)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPreviewBox);
} else {
    createPreviewBox();
}
