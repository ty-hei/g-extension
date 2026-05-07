// g-extension/regex_content_extractor.js
(function () {
  function sendRegexSource(payload) {
    chrome.runtime.sendMessage({
      action: "regexPageContentExtracted",
      ...payload
    });
  }

  if (typeof Readability !== 'function') {
    sendRegexSource({
      error: "Readability.js 库未能加载。"
    });
    return;
  }

  let article = null;
  try {
    article = new Readability(document.cloneNode(true)).parse();
  } catch (e) {
    sendRegexSource({
      error: "使用 Readability 处理页面失败: " + e.message,
      url: document.location.href
    });
    return;
  }

  const readabilityText = article && article.textContent ? article.textContent.trim() : "";
  const fullText = document.body && document.body.innerText ? document.body.innerText.trim() : "";

  if (!readabilityText && !fullText) {
    sendRegexSource({
      error: "无法提取可用于正则匹配的网页内容。",
      url: document.location.href
    });
    return;
  }

  sendRegexSource({
    title: article?.title || document.title || "N/A",
    url: document.location.href,
    readabilityText,
    fullText,
    warning: readabilityText ? "" : "Readability.js 提取失败，已使用全文作为后备。"
  });
})();
