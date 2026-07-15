// g-extension/reader_content_extractor.js
(function () {
  "use strict";

  var extractionApi = globalThis.GExtensionExtraction;
  if (!extractionApi || typeof extractionApi.extract !== "function") {
    return {
      schemaVersion: 1,
      requestId: "extract-" + Date.now().toString(36),
      ok: false,
      source: {
        url: "",
        title: "",
        capturedAt: new Date().toISOString(),
        charset: "",
        lang: "",
        dir: ""
      },
      extraction: {
        requestedMode: "reader",
        strategy: "none",
        fallbackUsed: false
      },
      content: {
        text: "",
        readerText: "",
        fullText: "",
        charCount: 0,
        truncated: false,
        anyTruncated: false,
        readerTruncated: false,
        fullTextTruncated: false
      },
      metadata: {
        byline: "",
        siteName: "",
        publishedTime: "",
        excerpt: ""
      },
      warnings: [],
      error: {
        code: "EXTRACTION_CORE_UNAVAILABLE",
        phase: "setup",
        message: "The extraction core is not loaded.",
        retryable: true
      }
    };
  }

  return extractionApi.extract({ mode: "reader" });
})();
