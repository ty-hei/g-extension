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

function textNode(value) {
  return { nodeType: 3, nodeValue: String(value) };
}

function elementNode(tagName, children = []) {
  return { nodeType: 1, tagName: String(tagName).toUpperCase(), childNodes: children };
}

function createDocument(options = {}) {
  const state = {
    cloneCalls: 0,
    cloneUiRemovals: 0,
    readerCalls: 0
  };
  const cloneUiNodes = Array.from({ length: options.cloneUiCount || 0 }, () => ({
    remove() {
      state.cloneUiRemovals += 1;
    }
  }));
  const clone = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-g-extension-ui]');
      return cloneUiNodes;
    }
  };
  const documentRef = {
    body: { innerText: options.innerText ?? '' },
    documentElement: {
      lang: options.lang || '',
      dir: options.dir || ''
    },
    title: options.title || '',
    characterSet: options.characterSet || 'UTF-8',
    location: { href: options.url || 'https://example.test/article' },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-g-extension-ui]');
      return [];
    },
    getElementsByTagName(tagName) {
      assert.equal(tagName, '*');
      if (options.nodeCountError) throw options.nodeCountError;
      return { length: options.nodeCount ?? 10 };
    },
    cloneNode(deep) {
      assert.equal(deep, true);
      state.cloneCalls += 1;
      return clone;
    },
    createElement(tagName) {
      assert.equal(tagName, 'template');
      const template = {
        content: { nodeType: 11, childNodes: [] },
        set innerHTML(value) {
          if (options.articleHtml !== undefined) {
            assert.equal(value, options.articleHtml);
          }
          this.content.childNodes = options.articleNodes || [];
        }
      };
      return template;
    }
  };
  return { documentRef, clone, state };
}

function createReadability(article, state, onConstruct) {
  return function FakeReadability(documentClone, options) {
    state.readerCalls += 1;
    if (onConstruct) onConstruct(documentClone, options);
    this.parse = function parse() {
      return article;
    };
  };
}

function loadExtractionCore() {
  const context = vm.createContext({});
  vm.runInContext(EXTRACTION_CORE_SOURCE, context, { filename: EXTRACTION_CORE_PATH });
  return context.GExtensionExtraction;
}

test('reader HTML preserves nested block, break, preformatted, and table boundaries without executable text', function () {
  const articleHtml = '<article>structured fixture</article>';
  const fixture = createDocument({
    innerText: 'Visible fallback',
    articleHtml,
    articleNodes: [
      elementNode('p', [
        textNode('First'),
        elementNode('script', [textNode('SCRIPT_SECRET')]),
        elementNode('br'),
        textNode('Second')
      ]),
      elementNode('ul', [
        elementNode('li', [textNode('Alpha')]),
        elementNode('li', [textNode('Beta')])
      ]),
      elementNode('table', [
        elementNode('tr', [
          elementNode('th', [textNode('Head')]),
          elementNode('td', [textNode('Cell')])
        ])
      ]),
      elementNode('style', [textNode('STYLE_SECRET')]),
      elementNode('noscript', [textNode('NOSCRIPT_SECRET')]),
      elementNode('template', [textNode('TEMPLATE_SECRET')]),
      elementNode('pre', [textNode('code line 1\ncode line 2')])
    ]
  });
  const Readability = createReadability({
    content: articleHtml,
    textContent: 'Flattened fallback should not win'
  }, fixture.state);
  const result = toPlain(loadExtractionCore().extract({
    mode: 'reader',
    document: fixture.documentRef,
    Readability
  }));

  assert.equal(result.ok, true);
  assert.match(result.content.readerText, /^First\nSecond/);
  assert.match(result.content.readerText, /Alpha\n\nBeta/);
  assert.match(result.content.readerText, /Head\tCell\t/);
  assert.match(result.content.readerText, /code line 1\ncode line 2$/);
  assert.doesNotMatch(
    result.content.readerText,
    /SCRIPT_SECRET|STYLE_SECRET|NOSCRIPT_SECRET|TEMPLATE_SECRET|Flattened fallback/
  );
});

test('extension UI is removed from the cloned document before Readability sees it', function () {
  const fixture = createDocument({
    innerText: 'Visible text',
    cloneUiCount: 3
  });
  const Readability = createReadability({ textContent: 'Reader text' }, fixture.state, function (clone) {
    assert.equal(clone, fixture.clone);
    assert.equal(fixture.state.cloneUiRemovals, 3);
  });
  const result = toPlain(loadExtractionCore().extract({
    mode: 'reader',
    document: fixture.documentRef,
    Readability
  }));

  assert.equal(result.ok, true);
  assert.equal(result.content.text, 'Reader text');
  assert.equal(fixture.state.cloneCalls, 1);
  assert.equal(fixture.state.cloneUiRemovals, 3);
  assert.equal(fixture.state.readerCalls, 1);
});

test('all bounded identifiers and metadata avoid dangling UTF-16 surrogates', function () {
  const fixture = createDocument({
    innerText: 'Visible text',
    url: 'U'.repeat(8191) + '😀Z',
    title: 'T'.repeat(1999) + '😀Z',
    characterSet: 'C'.repeat(1999) + '😀Z',
    lang: 'L'.repeat(1999) + '😀Z',
    dir: 'D'.repeat(1999) + '😀Z'
  });
  const result = toPlain(loadExtractionCore().extract({
    mode: 'visible',
    requestId: 'R'.repeat(199) + '😀Z',
    document: fixture.documentRef
  }));

  assert.equal(result.requestId, 'R'.repeat(199));
  assert.equal(result.source.url, 'U'.repeat(8191));
  assert.equal(result.source.title, 'T'.repeat(1999));
  assert.equal(result.source.charset, 'C'.repeat(1999));
  assert.equal(result.source.lang, 'L'.repeat(1999));
  assert.equal(result.source.dir, 'D'.repeat(1999));
  for (const value of [
    result.requestId,
    result.source.url,
    result.source.title,
    result.source.charset,
    result.source.lang,
    result.source.dir
  ]) {
    assert.doesNotMatch(value, /[\uD800-\uDBFF]$/);
  }
});

test('invalid and sub-unit text budgets fall back, while valid fractions floor to an integer', function () {
  const api = loadExtractionCore();
  const invalidBudgets = [0, -1, Number.NaN, Infinity, -Infinity, 'not-a-number', 0.5, '0.9'];

  for (const maxTextChars of invalidBudgets) {
    const fixture = createDocument({ innerText: 'abcdef' });
    const result = toPlain(api.extract({
      mode: 'visible',
      document: fixture.documentRef,
      maxTextChars
    }));
    assert.equal(result.content.text, 'abcdef', String(maxTextChars));
    assert.equal(result.content.truncated, false, String(maxTextChars));
  }

  for (const [maxTextChars, expected] of [[3.9, 'abc'], ['4.9', 'abcd']]) {
    const fixture = createDocument({ innerText: 'abcdef' });
    const result = toPlain(api.extract({
      mode: 'visible',
      document: fixture.documentRef,
      maxTextChars
    }));
    assert.equal(result.content.text, expected);
    assert.equal(result.content.truncated, true);
  }
});

test('invalid and sub-unit DOM budgets fall back, while valid fractions floor before preflight', function () {
  const api = loadExtractionCore();
  const invalidBudgets = [0, -1, Number.NaN, Infinity, -Infinity, 'not-a-number', 0.5, '0.9'];

  for (const maxDomNodes of invalidBudgets) {
    const fixture = createDocument({ innerText: 'Visible', nodeCount: 3 });
    const Readability = createReadability({ textContent: 'Reader' }, fixture.state);
    const result = toPlain(api.extract({
      mode: 'reader',
      document: fixture.documentRef,
      Readability,
      maxDomNodes
    }));
    assert.equal(result.extraction.strategy, 'readability', String(maxDomNodes));
    assert.equal(fixture.state.readerCalls, 1, String(maxDomNodes));
  }

  const fixture = createDocument({ innerText: 'Visible', nodeCount: 3 });
  const Readability = createReadability({ textContent: 'Reader' }, fixture.state);
  const result = toPlain(api.extract({
    mode: 'reader',
    document: fixture.documentRef,
    Readability,
    maxDomNodes: 2.9
  }));
  assert.equal(result.extraction.strategy, 'visible');
  assert.equal(fixture.state.readerCalls, 0);
  assert.match(result.warnings[0].message, /limit of 2/);
});

test('a DOM-count failure is reported but does not discard otherwise valid reader content', function () {
  const fixture = createDocument({
    innerText: 'Visible',
    nodeCountError: new Error('count unavailable')
  });
  const Readability = createReadability({ textContent: 'Reader survives' }, fixture.state);
  const result = toPlain(loadExtractionCore().extract({
    mode: 'reader',
    document: fixture.documentRef,
    Readability
  }));

  assert.equal(result.ok, true);
  assert.equal(result.content.text, 'Reader survives');
  assert.equal(fixture.state.readerCalls, 1);
  assert.deepEqual(result.warnings, [{
    code: 'DOM_NODE_COUNT_FAILED',
    phase: 'reader-preflight',
    message: 'count unavailable',
    retryable: true
  }]);
});
