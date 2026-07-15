// g-extension/extraction_core.js
(function (global) {
  "use strict";

  var SCHEMA_VERSION = 1;
  var DEFAULT_MAX_DOM_NODES = 50000;
  var DEFAULT_MAX_TEXT_CHARS = 200000;
  var DEFAULT_MAX_METADATA_CHARS = 2000;
  var DEFAULT_MAX_URL_CHARS = 8192;
  var DEFAULT_MAX_REQUEST_ID_CHARS = 200;
  var SUPPORTED_MODES = {
    visible: true,
    reader: true,
    both: true
  };

  function createRequestId(providedRequestId) {
    if (typeof providedRequestId === "string" && providedRequestId.trim()) {
      return takeSafePrefix(providedRequestId.trim(), DEFAULT_MAX_REQUEST_ID_CHARS);
    }

    var randomPart = Math.random().toString(36).slice(2, 10);
    return "extract-" + Date.now().toString(36) + "-" + randomPart;
  }

  function normalizePositiveInteger(value, fallback, hardMaximum) {
    var numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) {
      return fallback;
    }
    var integerValue = Math.floor(numberValue);
    if (integerValue <= 0) {
      return fallback;
    }
    return Math.min(integerValue, hardMaximum || fallback);
  }

  function takeSafePrefix(value, maxChars) {
    var end = Math.min(value.length, maxChars);
    if (end > 0 && end < value.length) {
      var previous = value.charCodeAt(end - 1);
      var next = value.charCodeAt(end);
      if (previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) {
        end -= 1;
      }
    }
    return value.slice(0, end);
  }

  function normalizeText(value, maxTextChars) {
    var text = typeof value === "string" ? value : "";
    text = text.replace(/\r\n?/g, "\n").trim();

    var truncated = text.length > maxTextChars;
    if (truncated) {
      text = takeSafePrefix(text, maxTextChars).trimEnd();
    }

    return {
      text: text,
      truncated: truncated
    };
  }

  function normalizeMetadataText(value, maxTextChars) {
    return normalizeText(value, maxTextChars).text;
  }

  function createIssue(code, phase, message, retryable) {
    return {
      code: code,
      phase: phase,
      message: message,
      retryable: Boolean(retryable)
    };
  }

  function readSafely(reader, fallback) {
    try {
      var value = reader();
      return value === undefined || value === null ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function getDocumentSource(documentRef, capturedAt, maxTextChars) {
    var documentElement = readSafely(function () {
      return documentRef && documentRef.documentElement;
    }, null);
    var locationHref = "";

    try {
      locationHref = documentRef && documentRef.location
        ? documentRef.location.href || ""
        : documentRef && documentRef.baseURI
          ? documentRef.baseURI
          : "";
    } catch (_error) {
      locationHref = "";
    }

    return {
      url: normalizeMetadataText(locationHref, DEFAULT_MAX_URL_CHARS),
      title: normalizeMetadataText(
        readSafely(function () { return documentRef && documentRef.title; }, ""),
        Math.min(maxTextChars, DEFAULT_MAX_METADATA_CHARS)
      ),
      capturedAt: capturedAt,
      charset: normalizeMetadataText(
        readSafely(function () {
          return documentRef && (documentRef.characterSet || documentRef.charset);
        }, ""),
        DEFAULT_MAX_METADATA_CHARS
      ),
      lang: normalizeMetadataText(
        readSafely(function () { return documentElement && documentElement.lang; }, ""),
        DEFAULT_MAX_METADATA_CHARS
      ),
      dir: normalizeMetadataText(
        readSafely(function () { return documentElement && documentElement.dir; }, ""),
        DEFAULT_MAX_METADATA_CHARS
      )
    };
  }

  function createBaseResult(options, documentRef, requestedMode, maxTextChars) {
    var capturedAt = new Date().toISOString();
    return {
      schemaVersion: SCHEMA_VERSION,
      requestId: createRequestId(options && options.requestId),
      ok: false,
      source: getDocumentSource(documentRef, capturedAt, maxTextChars),
      extraction: {
        requestedMode: requestedMode,
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
      error: null
    };
  }

  function extractVisibleText(documentRef, maxTextChars, result) {
    var rawText = "";
    var extensionUiNodes = [];
    try {
      if (documentRef && typeof documentRef.querySelectorAll === "function") {
        Array.prototype.slice.call(
          documentRef.querySelectorAll("[data-g-extension-ui]")
        ).forEach(function (node) {
          var previousStyle = node.getAttribute("style");
          var entry = { node: node, previousStyle: previousStyle };
          extensionUiNodes.push(entry);
          node.style.setProperty("display", "none", "important");
        });
      }
      rawText = documentRef && documentRef.body && typeof documentRef.body.innerText === "string"
        ? documentRef.body.innerText
        : "";
    } catch (error) {
      result.warnings.push(createIssue(
        "VISIBLE_EXTRACTION_FAILED",
        "visible",
        error && error.message ? error.message : "Failed to read visible page text.",
        true
      ));
    } finally {
      extensionUiNodes.slice().reverse().forEach(function (entry) {
        try {
          if (entry.previousStyle === null) {
            entry.node.removeAttribute("style");
          } else {
            entry.node.setAttribute("style", entry.previousStyle);
          }
        } catch (restoreError) {
          result.warnings.push(createIssue(
            "EXTENSION_UI_RESTORE_FAILED",
            "visible",
            restoreError && restoreError.message ? restoreError.message : "Failed to restore extension UI styles.",
            false
          ));
        }
      });
    }

    var normalized = normalizeText(rawText, maxTextChars);
    if (normalized.truncated) {
      result.warnings.push(createIssue(
        "VISIBLE_TEXT_TRUNCATED",
        "normalize",
        "Visible page text exceeded the configured character limit.",
        false
      ));
    }
    return normalized;
  }

  function structuredTextFromArticleHtml(articleHtml, documentRef) {
    if (typeof articleHtml !== "string" || !articleHtml || !documentRef || typeof documentRef.createElement !== "function") {
      return "";
    }

    var template = documentRef.createElement("template");
    template.innerHTML = articleHtml;
    var container = template.content || template;
    var blockTags = {
      ADDRESS: true, ARTICLE: true, ASIDE: true, BLOCKQUOTE: true, DD: true, DIV: true,
      DL: true, DT: true, FIELDSET: true, FIGCAPTION: true, FIGURE: true, FOOTER: true,
      FORM: true, H1: true, H2: true, H3: true, H4: true, H5: true, H6: true,
      HEADER: true, HR: true, LI: true, MAIN: true, NAV: true, OL: true, P: true,
      PRE: true, SECTION: true, TABLE: true, TBODY: true, TFOOT: true, THEAD: true,
      TR: true, UL: true
    };

    function readNode(node) {
      if (!node) return "";
      if (node.nodeType === 3) return node.nodeValue || "";
      if (node.nodeType !== 1 && node !== container) return "";
      var tagName = String(node.tagName || "").toUpperCase();
      if (tagName === "SCRIPT" || tagName === "STYLE" || tagName === "NOSCRIPT" || tagName === "TEMPLATE") return "";
      if (tagName === "BR") return "\n";
      var text = "";
      Array.prototype.forEach.call(node.childNodes || [], function (child) {
        text += readNode(child);
      });
      if (tagName === "TD" || tagName === "TH") return text + "\t";
      return blockTags[tagName] ? "\n" + text + "\n" : text;
    }

    return readNode(container);
  }

  function countDomNodes(documentRef, result) {
    try {
      return documentRef.getElementsByTagName("*").length;
    } catch (error) {
      result.warnings.push(createIssue(
        "DOM_NODE_COUNT_FAILED",
        "reader-preflight",
        error && error.message ? error.message : "Failed to count DOM nodes.",
        true
      ));
      return null;
    }
  }

  function extractReaderContent(documentRef, readabilityConstructor, maxDomNodes, maxTextChars, result, knownNodeCount) {
    if (typeof readabilityConstructor !== "function") {
      result.warnings.push(createIssue(
        "READABILITY_UNAVAILABLE",
        "reader-preflight",
        "Readability is not available in the extraction context.",
        true
      ));
      return null;
    }

    var nodeCount = knownNodeCount !== undefined ? knownNodeCount : countDomNodes(documentRef, result);
    if (nodeCount !== null && nodeCount > maxDomNodes) {
      result.warnings.push(createIssue(
        "READER_DOM_LIMIT_EXCEEDED",
        "reader-preflight",
        "Readability was skipped because the document contains " + nodeCount +
          " elements, exceeding the limit of " + maxDomNodes + ".",
        false
      ));
      return null;
    }

    try {
      var documentClone = documentRef.cloneNode(true);
      if (documentClone && typeof documentClone.querySelectorAll === "function") {
        Array.prototype.slice.call(
          documentClone.querySelectorAll("[data-g-extension-ui]")
        ).forEach(function (node) {
          if (typeof node.remove === "function") node.remove();
        });
      }
      var article = new readabilityConstructor(documentClone, {
        maxElemsToParse: maxDomNodes
      }).parse();

      if (!article || typeof article.textContent !== "string") {
        result.warnings.push(createIssue(
          "READABILITY_EMPTY",
          "reader",
          "Readability did not return article text.",
          true
        ));
        return null;
      }

      var structuredText = structuredTextFromArticleHtml(article.content, documentRef);
      var normalized = normalizeText(structuredText || article.textContent, maxTextChars);
      if (!normalized.text) {
        result.warnings.push(createIssue(
          "READABILITY_EMPTY",
          "reader",
          "Readability returned empty article text.",
          true
        ));
        return null;
      }

      if (normalized.truncated) {
        result.warnings.push(createIssue(
          "READER_TEXT_TRUNCATED",
          "normalize",
          "Reader text exceeded the configured character limit.",
          false
        ));
      }

      return {
        text: normalized.text,
        truncated: normalized.truncated,
        title: normalizeMetadataText(article.title, Math.min(maxTextChars, DEFAULT_MAX_METADATA_CHARS)),
        lang: normalizeMetadataText(article.lang, DEFAULT_MAX_METADATA_CHARS),
        dir: normalizeMetadataText(article.dir, DEFAULT_MAX_METADATA_CHARS),
        byline: normalizeMetadataText(article.byline, DEFAULT_MAX_METADATA_CHARS),
        siteName: normalizeMetadataText(article.siteName, DEFAULT_MAX_METADATA_CHARS),
        publishedTime: normalizeMetadataText(article.publishedTime, DEFAULT_MAX_METADATA_CHARS),
        excerpt: normalizeMetadataText(article.excerpt, DEFAULT_MAX_METADATA_CHARS)
      };
    } catch (error) {
      result.warnings.push(createIssue(
        "READABILITY_PARSE_FAILED",
        "reader",
        error && error.message ? error.message : "Readability failed to parse the document.",
        true
      ));
      return null;
    }
  }

  function applyReaderMetadata(result, readerContent) {
    if (!readerContent) {
      return;
    }

    if (readerContent.title) {
      result.source.title = readerContent.title;
    }
    if (readerContent.lang) {
      result.source.lang = readerContent.lang;
    }
    if (readerContent.dir) {
      result.source.dir = readerContent.dir;
    }

    result.metadata.byline = readerContent.byline;
    result.metadata.siteName = readerContent.siteName;
    result.metadata.publishedTime = readerContent.publishedTime;
    result.metadata.excerpt = readerContent.excerpt;
  }

  function finalizeResult(result, requestedMode, visibleContent, readerContent) {
    var fullText = visibleContent ? visibleContent.text : "";
    var readerText = readerContent ? readerContent.text : "";
    var primaryText = "";

    result.content.fullText = fullText;
    result.content.readerText = readerText;
    result.content.fullTextTruncated = Boolean(visibleContent && visibleContent.truncated);
    result.content.readerTruncated = Boolean(readerContent && readerContent.truncated);
    result.content.anyTruncated = Boolean(
      result.content.readerTruncated || result.content.fullTextTruncated
    );

    if (requestedMode === "visible") {
      primaryText = fullText;
      result.extraction.strategy = primaryText ? "visible" : "none";
      result.content.truncated = result.content.fullTextTruncated;
    } else if (requestedMode === "reader") {
      primaryText = readerText || fullText;
      result.extraction.strategy = readerText ? "readability" : fullText ? "visible" : "none";
      result.extraction.fallbackUsed = Boolean(!readerText && fullText);
      result.content.truncated = readerText
        ? result.content.readerTruncated
        : result.content.fullTextTruncated;
    } else {
      primaryText = readerText || fullText;
      if (readerText && fullText) {
        result.extraction.strategy = "readability+visible";
      } else if (readerText) {
        result.extraction.strategy = "readability";
      } else if (fullText) {
        result.extraction.strategy = "visible";
      }
      result.extraction.fallbackUsed = Boolean(!readerText && fullText);
      result.content.truncated = readerText
        ? result.content.readerTruncated
        : result.content.fullTextTruncated;
    }

    result.content.text = primaryText;
    result.content.charCount = primaryText.length;
    result.ok = Boolean(primaryText);

    if (!result.ok) {
      result.error = createIssue(
        "NO_TEXT_CONTENT",
        "extract",
        "No usable text could be extracted from the document.",
        true
      );
    }

    return result;
  }

  function extract(options) {
    var safeOptions = options && typeof options === "object" ? options : {};
    var requestedMode = typeof safeOptions.mode === "string"
      ? safeOptions.mode.trim().toLowerCase()
      : "visible";
    var maxDomNodes = normalizePositiveInteger(
      safeOptions.maxDomNodes,
      DEFAULT_MAX_DOM_NODES,
      DEFAULT_MAX_DOM_NODES
    );
    var maxTextChars = normalizePositiveInteger(
      safeOptions.maxTextChars,
      DEFAULT_MAX_TEXT_CHARS,
      DEFAULT_MAX_TEXT_CHARS
    );
    var documentRef = safeOptions.document || global.document || null;
    var result = createBaseResult(safeOptions, documentRef, requestedMode, maxTextChars);

    try {
      if (!SUPPORTED_MODES[requestedMode]) {
        result.error = createIssue(
          "INVALID_MODE",
          "setup",
          "Unsupported extraction mode: " + requestedMode,
          false
        );
        return result;
      }

      if (!documentRef || !documentRef.documentElement) {
        result.error = createIssue(
          "DOCUMENT_UNAVAILABLE",
          "setup",
          "No document is available in the extraction context.",
          false
        );
        return result;
      }

      var nodeCount = countDomNodes(documentRef, result);
      var visibleContent = null;
      var domLimitExceeded = nodeCount !== null && nodeCount > maxDomNodes;
      if (domLimitExceeded) {
        result.warnings.push(createIssue(
          "DOM_LIMIT_EXCEEDED",
          "extraction-preflight",
          "Page extraction was skipped because the document contains " + nodeCount +
            " elements, exceeding the limit of " + maxDomNodes + ".",
          false
        ));
      } else {
        visibleContent = extractVisibleText(documentRef, maxTextChars, result);
      }
      var readerContent = null;

      if (!domLimitExceeded && (requestedMode === "reader" || requestedMode === "both")) {
        var readabilityConstructor = safeOptions.Readability || global.Readability;
        readerContent = extractReaderContent(
          documentRef,
          readabilityConstructor,
          maxDomNodes,
          maxTextChars,
          result,
          nodeCount
        );
        applyReaderMetadata(result, readerContent);
      }

      return finalizeResult(result, requestedMode, visibleContent, readerContent);
    } catch (error) {
      result.ok = false;
      result.error = createIssue(
        "EXTRACTION_UNEXPECTED_ERROR",
        "extract",
        error && error.message ? error.message : "Unexpected extraction failure.",
        true
      );
      return result;
    }
  }

  global.GExtensionExtraction = {
    schemaVersion: SCHEMA_VERSION,
    extract: extract
  };
})(globalThis);
