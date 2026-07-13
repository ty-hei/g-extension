// g-extension/content_script.js

const MAX_SELECTED_TEXT_CHARS = 200000;
const MAX_DRAG_DATA_CHARS = 16384;
const MAX_URL_CHARS = 8192;

function takeSafePrefix(value, maxChars) {
    let end = Math.min(value.length, maxChars);
    if (end > 0 && end < value.length) {
        const previous = value.charCodeAt(end - 1);
        const next = value.charCodeAt(end);
        if (previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end -= 1;
    }
    return value.slice(0, end);
}

// Read a selection only while this window has a connected side panel.
document.addEventListener('mouseup', async () => {
    try {
        const permission = await chrome.runtime.sendMessage({ action: 'shouldCaptureSelection' });
        if (!permission?.capture) return;

        const selectedText = takeSafePrefix(window.getSelection()?.toString().trim() || '', MAX_SELECTED_TEXT_CHARS);
        if (!selectedText) return;

        await chrome.runtime.sendMessage({
            action: 'TEXT_SELECTED_FROM_PAGE',
            text: selectedText
        });
    } catch (_) {
        // The extension may be reloading or the side panel may have just closed.
    }
});

// === Link Drag & Drop Preview Window ===
let previewBox = null;
let previewRoot = null;
let currentDraggedLink = null;
let isDraggingLink = false;

// Create floating preview box
function createPreviewBox() {
    if (previewBox) return;

    previewBox = document.createElement('div');
    previewBox.id = 'g-extension-link-preview';
    previewBox.dataset.gExtensionUi = 'true';
    previewBox.style.display = 'none'; // Hidden by default
    previewRoot = previewBox.attachShadow({ mode: 'closed' });
    const previewContent = document.createElement('div');
    previewContent.innerHTML = `
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

    const style = document.createElement('style');
    style.textContent = `
        :host {
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
            animation: g-extension-slide-in 0.3s;
        }
        @keyframes g-extension-slide-in {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        :host(.drag-over) {
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
            :host {
                background: #292a2d;
                border-color: #8ab4f8;
            }
            :host(.drag-over) {
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

    previewRoot.appendChild(style);
    previewRoot.appendChild(previewContent);
    document.body.appendChild(previewBox);

    // Event listeners
    const closeBtn = previewRoot.querySelector('.g-preview-close');
    closeBtn.addEventListener('click', () => {
        hidePreviewBox();
    });

    const summarizeBtn = previewRoot.querySelector('.g-preview-summarize-btn');
    summarizeBtn.addEventListener('click', async () => {
        if (currentDraggedLink) {
            try {
                await chrome.runtime.sendMessage({ action: 'openSidePanel' });
                const response = await chrome.runtime.sendMessage({
                    action: 'summarizeLinkTarget',
                    url: currentDraggedLink,
                    linkText: currentDraggedLink
                });
                if (!response?.accepted) throw new Error(response?.error || 'Link extraction was rejected.');
                hidePreviewBox();
            } catch (error) {
                summarizeBtn.textContent = '无法处理此链接';
                summarizeBtn.title = error instanceof Error ? error.message : String(error);
                setTimeout(() => {
                    summarizeBtn.textContent = '总结此链接';
                    summarizeBtn.removeAttribute('title');
                }, 3000);
            }
        }
    });

    // Drag events on preview box
    previewContent.addEventListener('dragover', (e) => {
        e.preventDefault();
        previewBox.classList.add('drag-over');
    });

    previewContent.addEventListener('dragleave', () => {
        previewBox.classList.remove('drag-over');
    });

    previewContent.addEventListener('drop', async (e) => {
        e.preventDefault();
        previewBox.classList.remove('drag-over');

        const url = normalizeHttpUrl(
            e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
        );
        if (url) {
            currentDraggedLink = url;
            showLinkInfo(url);

            // Open sidebar when link is dropped
            await chrome.runtime.sendMessage({ action: 'openSidePanel' });
        }
    });
}

function normalizeHttpUrl(rawUrl) {
    try {
        if (typeof rawUrl !== 'string' || rawUrl.length > MAX_DRAG_DATA_CHARS) return null;
        const candidate = rawUrl
            .split(/\r?\n/)
            .find(line => line.trim() && !line.trim().startsWith('#'))
            ?.trim();
        if (!candidate || candidate.length > MAX_URL_CHARS) return null;
        const parsed = new URL(candidate || '');
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        if (parsed.username || parsed.password) return null;
        if (parsed.href.length > MAX_URL_CHARS) return null;
        return parsed.href;
    } catch (_) {
        return null;
    }
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
    const hint = previewRoot.querySelector('.g-preview-hint');
    const linkInfo = previewRoot.querySelector('.g-preview-link-info');
    const linkText = previewRoot.querySelector('.g-preview-link-text');

    hint.style.display = 'none';
    linkInfo.style.display = 'block';
    linkText.textContent = url;
}

function resetPreviewBox() {
    if (!previewBox) return;

    const hint = previewRoot.querySelector('.g-preview-hint');
    const linkInfo = previewRoot.querySelector('.g-preview-link-info');

    hint.style.display = 'block';
    linkInfo.style.display = 'none';
    currentDraggedLink = null;
}

// Listen for drag events on links
document.addEventListener('dragstart', (e) => {
    const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (link && normalizeHttpUrl(link.href)) {
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
