// g-extension/background.js
let geminiApiKey = null;

async function loadApiKey() {
  try {
    const result = await chrome.storage.sync.get(['geminiApiKey']);
    if (result.geminiApiKey) {
      geminiApiKey = result.geminiApiKey;
      // console.log("Background: Gemini API Key loaded.");
    } else {
      console.warn("Background: Gemini API Key not found in storage.");
    }
  } catch (e) {
    console.error("Background: Error loading API Key:", e);
  }
}

// Create context menu item
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "analyzeImageWithGemini",
    title: "用 Gemini 分析图片",
    contexts: ["image"]
  });
  console.log("Background: Context menu for image analysis created.");
});

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyzeImageWithGemini" && info.srcUrl) {
    chrome.runtime.sendMessage({
      type: "IMAGE_SELECTED_FOR_SIDEBAR",
      imageUrl: info.srcUrl
    }, response => {
      if (chrome.runtime.lastError) {
        console.log("Background: Error sending image to sidebar, perhaps sidebar is not open or responding.", chrome.runtime.lastError.message);
      } else {
        // console.log("Background: Image URL sent to sidebar.", response);
      }
    });
  }
});


(async () => {
  await loadApiKey();
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error("Background: Failed to set side panel behavior:", error);
  }
})();

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.geminiApiKey) {
    geminiApiKey = changes.geminiApiKey.newValue;
    // console.log("Background: Gemini API Key updated.");
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getAndSummarizePage") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0 || !tabs[0].id) {
        sendResponse({ error: "无法确定活动标签页。" });
        return;
      }
      const activeTabId = tabs[0].id;
      chrome.tabs.sendMessage(activeTabId, { action: "getPageContentForSummarize" }, (pageResponse) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: "获取页面内容失败 (CS通讯错误): " + chrome.runtime.lastError.message });
          return;
        }
        if (pageResponse && typeof pageResponse.contentForSummary === 'string') {
          sendResponse({ contentForSummary: pageResponse.contentForSummary });
        } else {
          sendResponse({ error: "未能从页面获取内容 (CS数据无效或格式错误)。" });
        }
      });
    });
    return true;
  } else if (request.action === "extractActiveTabContent") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0 || !tabs[0].id) {
            sendResponse({ success: false, error: "无法确定活动标签页。" });
            return;
        }
        const activeTabId = tabs[0].id;
        const tabUrl = tabs[0].url;

        // 检查是否为不支持的页面 (如 Chrome 网上商店, about:blank 等)
        if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('about:') || tabUrl.startsWith('https://chrome.google.com/webstore')) {
           sendResponse({ success: false, error: "无法在此类特殊页面上运行脚本。" });
           // 同时直接通知侧边栏
           chrome.runtime.sendMessage({
              type: "EXTRACT_CONTENT_ERROR",
              message: "无法在此类特殊页面上运行脚本。"
           });
           return;
        }

        chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            files: ["libs/Readability.js", "page_content_extractor.js"]
        }, (injectionResults) => {
            if (chrome.runtime.lastError) {
                console.error("Background: 注入提取脚本时出错:", chrome.runtime.lastError.message);
                sendResponse({ success: false, error: "无法注入提取脚本: " + chrome.runtime.lastError.message });
                // 同时通知侧边栏
                chrome.runtime.sendMessage({
                    type: "EXTRACT_CONTENT_ERROR",
                    message: "无法注入提取脚本: " + chrome.runtime.lastError.message
                });
            } else {
                // 脚本将自行发送消息，因此这里只需确认注入已开始。
                sendResponse({ success: true });
            }
        });
    });
    return true; // 异步
  } else if (request.action === "TEXT_SELECTED_FROM_PAGE") {
    // Forward message to sidebar (if open)
    chrome.runtime.sendMessage({ type: "TEXT_SELECTED_FOR_SIDEBAR", text: request.text });
    sendResponse({ status: "Text selected event forwarded" }); // Removed "to sidebar" as it's a general broadcast
    return true;
  } else if (request.action === "summarizeLinkTarget") {
    const linkUrl = request.url;
    const linkText = request.linkText || linkUrl; // Use link text if provided
    // console.log("Background: Received summarizeLinkTarget for:", linkUrl, "Link Text:", linkText);
    sendResponse({ status: "Processing link summarization..." });

    chrome.runtime.sendMessage({ type: "LINK_SUMMARIZATION_STARTED", url: linkUrl, title: linkText });

    chrome.tabs.create({ url: linkUrl, active: false }, (newTab) => {
      if (chrome.runtime.lastError || !newTab || !newTab.id) {
        console.error("Background: Error creating new tab:", chrome.runtime.lastError?.message);
        chrome.runtime.sendMessage({ type: "SHOW_LINK_SUMMARY_ERROR", message: "无法打开链接: " + (chrome.runtime.lastError?.message || "Unknown error"), url: linkUrl, title: linkText });
        return;
      }
      const tempTabId = newTab.id;

      function tabUpdateListener(tabId, changeInfo, tab) {
        if (tabId === tempTabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(tabUpdateListener);
          // console.log("Background: Temporary tab loaded:", linkUrl);
          chrome.scripting.executeScript({
            target: { tabId: tempTabId },
            files: ["libs/Readability.js", "link_content_extractor.js"]
          }, (injectionResults) => {
            if (chrome.runtime.lastError) {
              console.error("Background: Error injecting scripts:", chrome.runtime.lastError.message);
              chrome.runtime.sendMessage({ type: "SHOW_LINK_SUMMARY_ERROR", message: "无法提取内容 (注入失败): " + chrome.runtime.lastError.message, url: linkUrl, title: linkText });
              chrome.tabs.remove(tempTabId).catch(e => console.warn("BG: Failed to remove temp tab post-injection-error", e));
            }
            // link_content_extractor.js will send "extractedLinkContent"
          });
        }
      }
      chrome.tabs.onUpdated.addListener(tabUpdateListener);
      // Timeout for tab loading, in case 'complete' never fires for some pages
      setTimeout(() => {
        chrome.tabs.get(tempTabId, (tabDetails) => {
          if (tabDetails && tabDetails.status && !tabDetails.status.includes('complete')) { // If tab still exists and isn't complete
            chrome.tabs.onUpdated.removeListener(tabUpdateListener);
            console.warn(`Background: Timeout waiting for tab ${tempTabId} to load complete for ${linkUrl}. Attempting injection anyway or closing.`);
            chrome.runtime.sendMessage({ type: "SHOW_LINK_SUMMARY_ERROR", message: "页面加载超时，无法提取内容。", url: linkUrl, title: linkText });
            chrome.tabs.remove(tempTabId).catch(e => console.warn("BG: Failed to remove temp tab post-timeout", e));
          } else if (!tabDetails) { // Tab was closed or crashed before timeout
            chrome.tabs.onUpdated.removeListener(tabUpdateListener);
            console.warn(`Background: Tab ${tempTabId} for ${linkUrl} was closed or crashed before loading.`);
            // Error message might have already been sent by other handlers if it was a crash.
          }
        });
      }, 20000); // 20 seconds timeout
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
        linkTitle: extractedTitle, // Use title from Readability
        warning: warning
      });
    }
    sendResponse({status: "Link content processed."});
    return true;
  }

  return false; // Return false for synchronous onMessage listeners or if not handled.
});

console.log("Background script (gemini-sidebar with sidePanel) started.");