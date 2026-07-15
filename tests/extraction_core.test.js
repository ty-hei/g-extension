'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const EXTRACTION_CORE_PATH = path.join(ROOT, 'extraction_core.js');
const EXTRACTION_CORE_SOURCE = fs.readFileSync(EXTRACTION_CORE_PATH, 'utf8');

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createFakeDocument(options = {}) {
  const state = {
    cloneCalls: 0,
    cloneDeepValues: [],
    innerTextReads: 0,
    nodeCountReads: 0,
    queriedSelectors: []
  };
  const body = {};

  Object.defineProperty(body, 'innerText', {
    configurable: true,
    enumerable: true,
    get() {
      state.innerTextReads += 1;
      if (options.innerTextError) {
        throw options.innerTextError;
      }
      if (typeof options.innerText === 'function') {
        return options.innerText();
      }
      return options.innerText === undefined ? '' : options.innerText;
    }
  });

  const documentRef = {
    body,
    documentElement: {
      lang: options.lang || '',
      dir: options.dir || ''
    },
    title: options.title || '',
    characterSet: options.characterSet || 'UTF-8',
    location: {
      href: options.url || 'https://example.test/article'
    },
    querySelectorAll(selector) {
      state.queriedSelectors.push(selector);
      return options.extensionUiNodes || [];
    },
    getElementsByTagName(tagName) {
      assert.equal(tagName, '*');
      state.nodeCountReads += 1;
      if (options.nodeCountError) {
        throw options.nodeCountError;
      }
      return { length: options.nodeCount === undefined ? 10 : options.nodeCount };
    },
    cloneNode(deep) {
      state.cloneCalls += 1;
      state.cloneDeepValues.push(deep);
      if (options.cloneError) {
        throw options.cloneError;
      }
      return { clonedDocument: true };
    },
    createElement(tagName) {
      if (typeof options.createElement !== 'function') {
        throw new Error('Unexpected createElement call for ' + tagName);
      }
      return options.createElement(tagName);
    }
  };

  return { documentRef, state };
}

function loadExtractionCore(globals = {}) {
  const context = vm.createContext({ ...globals });
  vm.runInContext(EXTRACTION_CORE_SOURCE, context, {
    filename: EXTRACTION_CORE_PATH
  });
  return { context, api: context.GExtensionExtraction };
}

function createReadability(article, state, parseError) {
  return function FakeReadability(documentClone, options) {
    state.constructorCalls = (state.constructorCalls || 0) + 1;
    state.documentClone = documentClone;
    state.readabilityOptions = options;
    this.parse = function parse() {
      state.parseCalls = (state.parseCalls || 0) + 1;
      if (parseError) {
        throw parseError;
      }
      return article;
    };
  };
}

function createUiNodeForFailureTest(initialStyle, behavior = {}) {
  let styleAttribute = initialStyle;
  let hidden = false;
  const operations = [];

  return {
    operations,
    get hidden() {
      return hidden;
    },
    get styleAttribute() {
      return styleAttribute;
    },
    style: {
      setProperty(name, value, priority) {
        operations.push(['setProperty', name, value, priority]);
        if (behavior.hideError) throw behavior.hideError;
        hidden = true;
        styleAttribute = 'display: none !important;';
      }
    },
    getAttribute(name) {
      assert.equal(name, 'style');
      return styleAttribute;
    },
    setAttribute(name, value) {
      assert.equal(name, 'style');
      operations.push(['setAttribute', value]);
      if (behavior.setAttributeError) throw behavior.setAttributeError;
      styleAttribute = value;
      hidden = false;
    },
    removeAttribute(name) {
      assert.equal(name, 'style');
      operations.push(['removeAttribute']);
      if (behavior.removeAttributeError) throw behavior.removeAttributeError;
      styleAttribute = null;
      hidden = false;
    }
  };
}

test('visible mode normalizes rendered text and reports document source metadata', function () {
  const fake = createFakeDocument({
    innerText: '  First line\r\nSecond line\rThird line  ',
    title: 'Visible title',
    url: 'https://example.test/visible',
    characterSet: 'windows-1252',
    lang: 'en',
    dir: 'ltr'
  });
  const loaded = loadExtractionCore({ document: fake.documentRef });
  const result = toPlain(loaded.api.extract({
    mode: 'visible',
    requestId: ' visible-request '
  }));

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.requestId, 'visible-request');
  assert.equal(result.ok, true);
  assert.equal(result.extraction.requestedMode, 'visible');
  assert.equal(result.extraction.strategy, 'visible');
  assert.equal(result.extraction.fallbackUsed, false);
  assert.equal(result.content.text, 'First line\nSecond line\nThird line');
  assert.equal(result.content.fullText, result.content.text);
  assert.equal(result.content.readerText, '');
  assert.equal(result.content.charCount, result.content.text.length);
  assert.equal(result.content.truncated, false);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.error, null);
  assert.equal(result.source.url, 'https://example.test/visible');
  assert.equal(result.source.title, 'Visible title');
  assert.equal(result.source.charset, 'windows-1252');
  assert.equal(result.source.lang, 'en');
  assert.equal(result.source.dir, 'ltr');
  assert.match(result.source.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(fake.state.innerTextReads >= 1);
  assert.equal(fake.state.cloneCalls, 0);
});

test('reader mode uses Readability text, metadata, clone, and DOM budget option', function () {
  const fake = createFakeDocument({
    innerText: 'Navigation and visible page text',
    title: 'Document title',
    lang: 'en',
    nodeCount: 123
  });
  const readabilityState = {};
  const FakeReadability = createReadability({
    textContent: '  Reader article text  ',
    title: 'Reader title',
    lang: 'fr',
    dir: 'rtl',
    byline: 'Ada Author',
    siteName: 'Example News',
    publishedTime: '2026-07-13T10:00:00Z',
    excerpt: 'Reader excerpt'
  }, readabilityState);
  const loaded = loadExtractionCore();
  const result = toPlain(loaded.api.extract({
    mode: ' Reader ',
    requestId: 'reader-request',
    document: fake.documentRef,
    Readability: FakeReadability,
    maxDomNodes: 321
  }));

  assert.equal(result.ok, true);
  assert.equal(result.extraction.requestedMode, 'reader');
  assert.equal(result.extraction.strategy, 'readability');
  assert.equal(result.extraction.fallbackUsed, false);
  assert.equal(result.content.text, 'Reader article text');
  assert.equal(result.content.readerText, 'Reader article text');
  assert.equal(result.content.fullText, 'Navigation and visible page text');
  assert.equal(result.source.title, 'Reader title');
  assert.equal(result.source.lang, 'fr');
  assert.equal(result.source.dir, 'rtl');
  assert.deepEqual(result.metadata, {
    byline: 'Ada Author',
    siteName: 'Example News',
    publishedTime: '2026-07-13T10:00:00Z',
    excerpt: 'Reader excerpt'
  });
  assert.equal(fake.state.nodeCountReads, 1);
  assert.equal(fake.state.cloneCalls, 1);
  assert.deepEqual(fake.state.cloneDeepValues, [true]);
  assert.equal(readabilityState.constructorCalls, 1);
  assert.equal(readabilityState.parseCalls, 1);
  assert.equal(readabilityState.documentClone.clonedDocument, true);
  assert.deepEqual(toPlain(readabilityState.readabilityOptions), { maxElemsToParse: 321 });
});

test('reader parse failure falls back to visible text with a structured warning', function () {
  const fake = createFakeDocument({ innerText: 'Visible fallback text' });
  const readabilityState = {};
  const FakeReadability = createReadability(null, readabilityState, new Error('reader exploded'));
  const loaded = loadExtractionCore();
  const result = toPlain(loaded.api.extract({
    mode: 'reader',
    document: fake.documentRef,
    Readability: FakeReadability
  }));

  assert.equal(result.ok, true);
  assert.equal(result.content.text, 'Visible fallback text');
  assert.equal(result.content.readerText, '');
  assert.equal(result.extraction.strategy, 'visible');
  assert.equal(result.extraction.fallbackUsed, true);
  assert.equal(result.error, null);
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(result.warnings[0], {
    code: 'READABILITY_PARSE_FAILED',
    phase: 'reader',
    message: 'reader exploded',
    retryable: true
  });
  assert.equal(readabilityState.parseCalls, 1);
});

test('DOM budget stops visible text and Readability before either can traverse an oversized page', function () {
  const fake = createFakeDocument({
    innerText: 'Text that remains available',
    nodeCount: 101
  });
  const readabilityState = {};
  const FakeReadability = createReadability({ textContent: 'Must not be used' }, readabilityState);
  const loaded = loadExtractionCore();
  const result = toPlain(loaded.api.extract({
    mode: 'reader',
    document: fake.documentRef,
    Readability: FakeReadability,
    maxDomNodes: 100
  }));

  assert.equal(result.ok, false);
  assert.equal(result.extraction.strategy, 'none');
  assert.equal(result.content.text, '');
  assert.equal(fake.state.nodeCountReads, 1);
  assert.equal(fake.state.cloneCalls, 0);
  assert.equal(readabilityState.constructorCalls, undefined);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, 'DOM_LIMIT_EXCEEDED');
  assert.equal(result.warnings[0].phase, 'extraction-preflight');
  assert.match(result.warnings[0].message, /101 elements/);
  assert.match(result.warnings[0].message, /limit of 100/);
});

test('character budget independently limits visible and reader content', function () {
  const fake = createFakeDocument({
    innerText: '123456789',
    title: 'Document title exceeds budget'
  });
  const readabilityState = {};
  const FakeReadability = createReadability({
    textContent: 'abcdefghi',
    title: 'Reader title exceeds budget',
    byline: 'Long author name'
  }, readabilityState);
  const loaded = loadExtractionCore();
  const result = toPlain(loaded.api.extract({
    mode: 'both',
    document: fake.documentRef,
    Readability: FakeReadability,
    maxTextChars: 5
  }));

  assert.equal(result.ok, true);
  assert.equal(result.extraction.strategy, 'readability+visible');
  assert.equal(result.content.text, 'abcde');
  assert.equal(result.content.readerText, 'abcde');
  assert.equal(result.content.fullText, '12345');
  assert.equal(result.content.charCount, 5);
  assert.equal(result.content.truncated, true);
  assert.equal(result.content.readerTruncated, true);
  assert.equal(result.content.fullTextTruncated, true);
  assert.equal(result.source.title, 'Reade');
  assert.equal(result.metadata.byline, 'Long author name');
  assert.deepEqual(
    result.warnings.map(function (warning) { return warning.code; }).sort(),
    ['READER_TEXT_TRUNCATED', 'VISIBLE_TEXT_TRUNCATED']
  );
});

test('invalid extraction mode returns a setup error without reading page content', function () {
  const fake = createFakeDocument({ innerText: 'Must not be read' });
  const loaded = loadExtractionCore();
  const result = toPlain(loaded.api.extract({
    mode: 'shadow',
    document: fake.documentRef
  }));

  assert.equal(result.ok, false);
  assert.equal(result.extraction.requestedMode, 'shadow');
  assert.equal(result.extraction.strategy, 'none');
  assert.equal(result.content.text, '');
  assert.deepEqual(result.error, {
    code: 'INVALID_MODE',
    phase: 'setup',
    message: 'Unsupported extraction mode: shadow',
    retryable: false
  });
  assert.equal(fake.state.innerTextReads, 0);
  assert.equal(fake.state.cloneCalls, 0);
});

test('metadata and URL fields use independent bounded limits', function () {
  const longUrl = 'https://example.test/' + 'u'.repeat(9000);
  const longTitle = 'T'.repeat(2500);
  const longByline = 'B'.repeat(2500);
  const longSiteName = 'S'.repeat(2500);
  const longPublishedTime = 'P'.repeat(2500);
  const longExcerpt = 'E'.repeat(2500);
  const longLang = 'L'.repeat(2500);
  const longDir = 'D'.repeat(2500);
  const fake = createFakeDocument({
    innerText: 'Visible text',
    title: 'Document title',
    url: longUrl
  });
  const FakeReadability = createReadability({
    textContent: 'Reader text',
    title: longTitle,
    byline: longByline,
    siteName: longSiteName,
    publishedTime: longPublishedTime,
    excerpt: longExcerpt,
    lang: longLang,
    dir: longDir
  }, {});
  const loaded = loadExtractionCore();
  const result = toPlain(loaded.api.extract({
    mode: 'reader',
    document: fake.documentRef,
    Readability: FakeReadability
  }));

  assert.equal(result.source.url.length, 8192);
  assert.equal(result.source.url, longUrl.slice(0, 8192));
  assert.equal(result.source.title.length, 2000);
  assert.equal(result.source.title, longTitle.slice(0, 2000));
  assert.equal(result.source.lang.length, 2000);
  assert.equal(result.source.dir.length, 2000);
  assert.equal(result.metadata.byline.length, 2000);
  assert.equal(result.metadata.siteName.length, 2000);
  assert.equal(result.metadata.publishedTime.length, 2000);
  assert.equal(result.metadata.excerpt.length, 2000);
  assert.equal(result.metadata.byline, longByline.slice(0, 2000));
  assert.equal(result.metadata.siteName, longSiteName.slice(0, 2000));
  assert.equal(result.metadata.publishedTime, longPublishedTime.slice(0, 2000));
  assert.equal(result.metadata.excerpt, longExcerpt.slice(0, 2000));
});

test('visible extraction hides extension UI nodes only while innerText is read and restores styles', function () {
  function createUiNode(initialStyle) {
    let styleAttribute = initialStyle;
    let hidden = false;
    const operations = [];
    return {
      operations,
      get hidden() {
        return hidden;
      },
      style: {
        setProperty(name, value, priority) {
          operations.push(['setProperty', name, value, priority]);
          if (name === 'display' && value === 'none') hidden = true;
          styleAttribute = 'display: none !important;';
        }
      },
      getAttribute(name) {
        assert.equal(name, 'style');
        return styleAttribute;
      },
      setAttribute(name, value) {
        assert.equal(name, 'style');
        operations.push(['setAttribute', value]);
        styleAttribute = value;
        hidden = false;
      },
      removeAttribute(name) {
        assert.equal(name, 'style');
        operations.push(['removeAttribute']);
        styleAttribute = null;
        hidden = false;
      }
    };
  }

  const noOriginalStyle = createUiNode(null);
  const originalStyle = createUiNode('color: red; display: block;');
  const fake = createFakeDocument({
    extensionUiNodes: [noOriginalStyle, originalStyle],
    innerText() {
      assert.equal(noOriginalStyle.hidden, true);
      assert.equal(originalStyle.hidden, true);
      return 'Visible page text without extension chrome';
    }
  });
  const loaded = loadExtractionCore();
  const result = toPlain(loaded.api.extract({ mode: 'visible', document: fake.documentRef }));

  assert.equal(result.ok, true);
  assert.equal(result.content.text, 'Visible page text without extension chrome');
  assert.deepEqual(fake.state.queriedSelectors, ['[data-g-extension-ui]']);
  assert.equal(noOriginalStyle.hidden, false);
  assert.equal(noOriginalStyle.getAttribute('style'), null);
  assert.equal(originalStyle.hidden, false);
  assert.equal(originalStyle.getAttribute('style'), 'color: red; display: block;');
  assert.deepEqual(noOriginalStyle.operations, [
    ['setProperty', 'display', 'none', 'important'],
    ['removeAttribute']
  ]);
  assert.deepEqual(originalStyle.operations, [
    ['setProperty', 'display', 'none', 'important'],
    ['setAttribute', 'color: red; display: block;']
  ]);
});

test('reader article HTML preserves adjacent block and break boundaries as multiline text', function () {
  const articleHtml = '<p>First paragraph</p><div>Second block<br>Break line</div>';
  const textNode = value => ({ nodeType: 3, nodeValue: value });
  const elementNode = (tagName, childNodes = []) => ({ nodeType: 1, tagName, childNodes });
  const fake = createFakeDocument({
    innerText: 'Visible fallback',
    createElement(tagName) {
      assert.equal(tagName, 'template');
      return {
        nodeType: 1,
        tagName: 'DIV',
        childNodes: [],
        set innerHTML(value) {
          assert.equal(value, articleHtml);
          this.childNodes = [
            elementNode('P', [textNode('First paragraph')]),
            elementNode('DIV', [
              textNode('Second block'),
              elementNode('BR'),
              textNode('Break line')
            ])
          ];
        }
      };
    }
  });
  const FakeReadability = createReadability({
    content: articleHtml,
    textContent: 'First paragraphSecond blockBreak line'
  }, {});
  const result = toPlain(loadExtractionCore().api.extract({
    mode: 'reader',
    document: fake.documentRef,
    Readability: FakeReadability
  }));

  assert.equal(result.ok, true);
  assert.equal(result.extraction.strategy, 'readability');
  assert.equal(result.content.readerText, 'First paragraph\n\nSecond block\nBreak line');
  assert.equal(result.content.text, result.content.readerText);
});

test('a later UI hide failure still restores every earlier hidden node', function () {
  const first = createUiNodeForFailureTest('color: red;');
  const second = createUiNodeForFailureTest(null, {
    hideError: new Error('second hide failed')
  });
  const fake = createFakeDocument({
    innerText: 'Must not be read after hide failure',
    extensionUiNodes: [first, second]
  });
  const result = toPlain(loadExtractionCore().api.extract({
    mode: 'visible',
    document: fake.documentRef
  }));

  assert.equal(result.ok, false);
  assert.equal(fake.state.innerTextReads, 0);
  assert.equal(first.hidden, false);
  assert.equal(first.styleAttribute, 'color: red;');
  assert.equal(second.hidden, false);
  assert.equal(second.styleAttribute, null);
  assert.deepEqual(result.warnings.map(warning => warning.code), ['VISIBLE_EXTRACTION_FAILED']);
  assert.deepEqual(first.operations, [
    ['setProperty', 'display', 'none', 'important'],
    ['setAttribute', 'color: red;']
  ]);
  assert.deepEqual(second.operations, [
    ['setProperty', 'display', 'none', 'important'],
    ['removeAttribute']
  ]);
});

test('one UI restore failure is reported without preventing later restores', function () {
  const restoresNormally = createUiNodeForFailureTest(null);
  const restoreFails = createUiNodeForFailureTest('color: blue;', {
    setAttributeError: new Error('restore failed')
  });
  const fake = createFakeDocument({
    extensionUiNodes: [restoresNormally, restoreFails],
    innerText() {
      assert.equal(restoresNormally.hidden, true);
      assert.equal(restoreFails.hidden, true);
      return 'Visible text';
    }
  });
  const result = toPlain(loadExtractionCore().api.extract({
    mode: 'visible',
    document: fake.documentRef
  }));

  assert.equal(result.ok, true);
  assert.equal(result.content.text, 'Visible text');
  assert.equal(restoresNormally.hidden, false);
  assert.equal(restoresNormally.styleAttribute, null);
  assert.equal(restoreFails.hidden, true);
  assert.deepEqual(result.warnings.map(warning => warning.code), ['EXTENSION_UI_RESTORE_FAILED']);
  assert.deepEqual(restoresNormally.operations, [
    ['setProperty', 'display', 'none', 'important'],
    ['removeAttribute']
  ]);
});

test('caller-provided extraction budgets cannot exceed the hard DOM and text limits', function () {
  const oversizedDom = createFakeDocument({
    innerText: 'Visible fallback remains available',
    nodeCount: 50001
  });
  const readabilityState = {};
  const FakeReadability = createReadability({ textContent: 'Must not be parsed' }, readabilityState);
  const domResult = toPlain(loadExtractionCore().api.extract({
    mode: 'reader',
    document: oversizedDom.documentRef,
    Readability: FakeReadability,
    maxDomNodes: Number.MAX_SAFE_INTEGER
  }));

  assert.equal(domResult.extraction.strategy, 'none');
  assert.equal(oversizedDom.state.cloneCalls, 0);
  assert.equal(readabilityState.constructorCalls, undefined);
  assert.match(domResult.warnings[0].message, /limit of 50000/);

  const oversizedText = createFakeDocument({ innerText: 'x'.repeat(200001) });
  const textResult = toPlain(loadExtractionCore().api.extract({
    mode: 'visible',
    document: oversizedText.documentRef,
    maxTextChars: Number.MAX_SAFE_INTEGER
  }));

  assert.equal(textResult.content.text.length, 200000);
  assert.equal(textResult.content.fullTextTruncated, true);
  assert.equal(textResult.content.truncated, true);
  assert.equal(textResult.content.anyTruncated, true);
});

test('document charset, lang, and dir are capped independently at 2000 characters', function () {
  const fake = createFakeDocument({
    innerText: 'Visible text',
    characterSet: 'C'.repeat(2500),
    lang: 'L'.repeat(2500),
    dir: 'D'.repeat(2500)
  });
  const result = toPlain(loadExtractionCore().api.extract({
    mode: 'visible',
    document: fake.documentRef,
    maxTextChars: Number.MAX_SAFE_INTEGER
  }));

  assert.equal(result.source.charset, 'C'.repeat(2000));
  assert.equal(result.source.lang, 'L'.repeat(2000));
  assert.equal(result.source.dir, 'D'.repeat(2000));
});

test('text truncation never leaves a dangling UTF-16 surrogate', function () {
  const fake = createFakeDocument({ innerText: 'A😀B' });
  const result = toPlain(loadExtractionCore().api.extract({
    mode: 'visible',
    document: fake.documentRef,
    maxTextChars: 2
  }));

  assert.equal(result.content.text, 'A');
  assert.equal(result.content.charCount, 1);
  assert.equal(result.content.truncated, true);
  assert.equal(result.content.anyTruncated, true);
  assert.doesNotMatch(result.content.text, /[\uD800-\uDBFF]$/);
});

test('both mode reports primary truncation separately from any representation truncation', function () {
  const fake = createFakeDocument({ innerText: '123456789' });
  const FakeReadability = createReadability({ textContent: 'abc' }, {});
  const result = toPlain(loadExtractionCore().api.extract({
    mode: 'both',
    document: fake.documentRef,
    Readability: FakeReadability,
    maxTextChars: 5
  }));

  assert.equal(result.content.text, 'abc');
  assert.equal(result.content.readerTruncated, false);
  assert.equal(result.content.fullTextTruncated, true);
  assert.equal(result.content.truncated, false);
  assert.equal(result.content.anyTruncated, true);
});

test('injecting extraction_core.js repeatedly in one page context remains functional', function () {
  const fake = createFakeDocument({ innerText: 'Repeated injection text' });
  const context = vm.createContext({ document: fake.documentRef });

  assert.doesNotThrow(function () {
    vm.runInContext(EXTRACTION_CORE_SOURCE, context, { filename: EXTRACTION_CORE_PATH });
  });
  const firstApi = context.GExtensionExtraction;
  const firstResult = toPlain(firstApi.extract({ mode: 'visible' }));

  assert.doesNotThrow(function () {
    vm.runInContext(EXTRACTION_CORE_SOURCE, context, { filename: EXTRACTION_CORE_PATH });
  });
  const secondApi = context.GExtensionExtraction;
  const secondResult = toPlain(secondApi.extract({ mode: 'visible' }));

  assert.equal(firstApi.schemaVersion, 1);
  assert.equal(secondApi.schemaVersion, 1);
  assert.equal(firstResult.content.text, 'Repeated injection text');
  assert.equal(secondResult.content.text, 'Repeated injection text');
  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
});
