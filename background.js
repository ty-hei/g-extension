// g-extension/background.js
let geminiApiKey = null;
let currentLanguage = 'zh';

const translations = {
  zh: {
    analyzeImage: "用 Gemini 分析图片",
    errorActiveTab: "无法确定活动标签页。",
    errorCSComm: "获取页面内容失败 (CS通讯错误): ",
    errorContentInvalid: "未能从页面获取内容 (CS数据无效或格式错误)。",
    errorScriptFail: "无法在此类特殊页面上运行脚本。",
    errorInjectFail: "无法注入提取脚本: ",
    linkProcessing: "正在处理链接总结...",
    errorOpenLink: "无法打开链接: ",
    errorExtractFail: "无法提取内容 (注入失败): ",
    errorTimeout: "页面加载超时，无法提取内容。"
  },
  en: {
    analyzeImage: "Analyze image with Gemini",
    errorActiveTab: "Cannot determine active tab.",
    errorCSComm: "Failed to get page content (CS Comm Error): ",
    errorContentInvalid: "Failed to get content (Invalid Data).",
    errorScriptFail: "Cannot run script on this special page.",
    errorInjectFail: "Failed to inject script: ",
    linkProcessing: "Processing link summary...",
    errorOpenLink: "Cannot open link: ",
    errorExtractFail: "Extraction failed (Injection Error): ",
    errorTimeout: "Page load timeout, extraction failed."
  }
};

function t(key) {
  return translations[currentLanguage][key] || translations['zh'][key] || key;
}

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['geminiApiKey', 'interfaceLanguage']);
    if (result.geminiApiKey) {
      geminiApiKey = result.geminiApiKey;
    }
    if (result.interfaceLanguage) {
      currentLanguage = result.interfaceLanguage;
    }
    updateContextMenu();
  } catch (e) {
    console.error("Background: Error loading settings:", e);
  }
}

function updateContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "analyzeImageWithGemini",
      title: t('analyzeImage'),
      contexts: ["image"]
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  loadSettings();
});

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyzeImageWithGemini" && info.srcUrl) {
    chrome.runtime.sendMessage({
      type: "IMAGE_SELECTED_FOR_SIDEBAR",
      imageUrl: info.srcUrl
    }, response => {
      if (chrome.runtime.lastError) {
        console.log("Background: Sidebar not open?", chrome.runtime.lastError.message);
      }
    });
  }
});


(async () => {
  await loadSettings();
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error("Background: Failed to set side panel behavior:", error);
  }
})();

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.geminiApiKey) {
      geminiApiKey = changes.geminiApiKey.newValue;
    }
    if (changes.interfaceLanguage) {
      currentLanguage = changes.interfaceLanguage.newValue || 'zh';
      updateContextMenu();
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getAndSummarizePage") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0 || !tabs[0].id) {
        sendResponse({ error: t('errorActiveTab') });
        return;
      }
      const activeTabId = tabs[0].id;
      chrome.tabs.sendMessage(activeTabId, { action: "getPageContentForSummarize" }, (pageResponse) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: t('errorCSComm') + chrome.runtime.lastError.message });
          return;
        }
        if (pageResponse && typeof pageResponse.contentForSummary === 'string') {
          sendResponse({ contentForSummary: pageResponse.contentForSummary });
        } else {
          sendResponse({ error: t('errorContentInvalid') });
        }
      });
    });
    return true;
  } else if (request.action === "extractActiveTabContent") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0 || !tabs[0].id) {
            sendResponse({ success: false, error: t('errorActiveTab') });
            return;
        }
        const activeTabId = tabs[0].id;
        const tabUrl = tabs[0].url;

        if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('about:') || tabUrl.startsWith('https://chrome.google.com/webstore')) {
           const errMsg = t('errorScriptFail');
           sendResponse({ success: false, error: errMsg });
           chrome.runtime.sendMessage({
              type: "EXTRACT_CONTENT_ERROR",
              message: errMsg
           });
           return;
        }

        chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            files: ["libs/Readability.js", "page_content_extractor.js"]
        }, (injectionResults) => {
            if (chrome.runtime.lastError) {
                const errMsg = t('errorInjectFail') + chrome.runtime.lastError.message;
                sendResponse({ success: false, error: errMsg });
                chrome.runtime.sendMessage({
                    type: "EXTRACT_CONTENT_ERROR",
                    message: errMsg
                });
            } else {
                sendResponse({ success: true });
            }
        });
    });
    return true; 
  } else if (request.action === "TEXT_SELECTED_FROM_PAGE") {
    chrome.runtime.sendMessage({ type: "TEXT_SELECTED_FOR_SIDEBAR", text: request.text });
    sendResponse({ status: "Text selected event forwarded" }); 
    return true;
  } else if (request.action === "summarizeLinkTarget") {
    const linkUrl = request.url;
    const linkText = request.linkText || linkUrl; 
    sendResponse({ status: t('linkProcessing') });

    chrome.runtime.sendMessage({ type: "LINK_SUMMARIZATION_STARTED", url: linkUrl, title: linkText });

    chrome.tabs.create({ url: linkUrl, active: false }, (newTab) => {
      if (chrome.runtime.lastError || !newTab || !newTab.id) {
        const errMsg = t('errorOpenLink') + (chrome.runtime.lastError?.message || "Unknown error");
        chrome.runtime.sendMessage({ type: "SHOW_LINK_SUMMARY_ERROR", message: errMsg, url: linkUrl, title: linkText });
        return;
      }
      const tempTabId = newTab.id;

      function tabUpdateListener(tabId, changeInfo, tab) {
        if (tabId === tempTabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(tabUpdateListener);
          chrome.scripting.executeScript({
            target: { tabId: tempTabId },
            files: ["libs/Readability.js", "link_content_extractor.js"]
          }, (injectionResults) => {
            if (chrome.runtime.lastError) {
              const errMsg = t('errorExtractFail') + chrome.runtime.lastError.message;
              chrome.runtime.sendMessage({ type: "SHOW_LINK_SUMMARY_ERROR", message: errMsg, url: linkUrl, title: linkText });
              chrome.tabs.remove(tempTabId).catch(e => console.warn("BG: Failed to remove temp tab", e));
            }
          });
        }
      }
      chrome.tabs.onUpdated.addListener(tabUpdateListener);
      setTimeout(() => {
        chrome.tabs.get(tempTabId, (tabDetails) => {
          if (tabDetails && tabDetails.status && !tabDetails.status.includes('complete')) { 
            chrome.tabs.onUpdated.removeListener(tabUpdateListener);
            chrome.runtime.sendMessage({ type: "SHOW_LINK_SUMMARY_ERROR", message: t('errorTimeout'), url: linkUrl, title: linkText });
            chrome.tabs.remove(tempTabId).catch(e => console.warn("BG: Failed to remove temp tab", e));
          } else if (!tabDetails) { 
            chrome.tabs.onUpdated.removeListener(tabUpdateListener);
          }
        });
      }, 20000); 
    });
    return true;
  } else if (request.action === "extractedLinkContent") {
    const { content, title: extractedTitle, url: originalUrlFromExtractor, error, warning } = request;
    const tempTabId = sender.tab?.id;

    if (tempTabId) {
      chrome.tabs.remove(tempTabId).catch(e => console.warn("BG: Failed to remove temp tab", tempTabId, e));
    }

    if (error) {
      chrome.runtime.sendMessage({ type: "SHOW_LINK_SUMMARY_ERROR", message: error, url: originalUrlFromExtractor, title: extractedTitle || originalUrlFromExtractor });
    } else {
      chrome.runtime.sendMessage({
        type: "SUMMARIZE_EXTERNAL_TEXT_FOR_SIDEBAR",
        text: content,
        linkUrl: originalUrlFromExtractor,
        linkTitle: extractedTitle, 
        warning: warning
      });
    }
    sendResponse({status: "Link content processed."});
    return true;
  }

  return false; 
});