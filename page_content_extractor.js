// g-extension/page_content_extractor.js
(function () {
  // 检查 Readability 是否已加载
  if (typeof Readability !== 'function') {
    chrome.runtime.sendMessage({
      action: "extractedPageContent",
      error: "Readability.js 库未能加载。"
    });
    return;
  }

  // 使用文档的克隆来避免副作用
  const documentClone = document.cloneNode(true);
  let article;
  try {
    article = new Readability(documentClone).parse();
  } catch (e) {
    console.error("运行 Readability 时出错: ", e);
    // 如果 Readability 本身抛出错误，则发送错误消息
    chrome.runtime.sendMessage({
      action: "extractedPageContent",
      error: "使用 Readability 处理页面失败: " + e.message,
    });
    return;
  }

  if (article && article.textContent) {
    chrome.runtime.sendMessage({
      action: "extractedPageContent",
      content: article.textContent,
      title: article.title
    });
  } else {
    // 如果 Readability 未返回任何内容，则回退到 body.innerText
    const fallbackContent = document.body && document.body.innerText ? document.body.innerText.trim() : "";
    if (fallbackContent) {
      chrome.runtime.sendMessage({
        action: "extractedPageContent",
        content: fallbackContent,
        title: document.title || "N/A",
        warning: "Readability.js 提取失败，已使用全文作为后备。内容质量可能有所不同。"
      });
    } else {
      chrome.runtime.sendMessage({
        action: "extractedPageContent",
        error: "无法使用 Readability 提取主要内容，也无法回退到页面全文。",
        url: document.location.href
      });
    }
  }
})();