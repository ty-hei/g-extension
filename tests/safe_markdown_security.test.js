'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SAFE_MARKDOWN_PATH = path.join(ROOT, 'libs', 'safe_markdown.js');
const SAFE_MARKDOWN_SOURCE = fs.readFileSync(SAFE_MARKDOWN_PATH, 'utf8');

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function escapeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}

class FakeTextNode {
  constructor(value) {
    this.nodeType = TEXT_NODE;
    this.textContent = String(value);
  }
}

class FakeContainerNode {
  constructor() {
    this.childNodes = [];
  }

  appendChild(child) {
    this.childNodes.push(child);
    return child;
  }
}

class FakeElement extends FakeContainerNode {
  constructor(tagName) {
    super();
    this.nodeType = ELEMENT_NODE;
    this.tagName = String(tagName).toUpperCase();
    this.attributes = new Map();
  }

  getAttribute(name) {
    const normalized = String(name).toLowerCase();
    return this.attributes.has(normalized) ? this.attributes.get(normalized) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(String(name).toLowerCase());
  }

  setAttribute(name, value) {
    this.attributes.set(String(name).toLowerCase(), String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(String(name).toLowerCase());
  }

  get textContent() {
    return this.childNodes.map(child => child.textContent || '').join('');
  }

  set textContent(value) {
    this.childNodes = [new FakeTextNode(value)];
  }

  get innerHTML() {
    return this.childNodes.map(serializeNode).join('');
  }
}

class FakeFragment extends FakeContainerNode {
  constructor() {
    super();
    this.nodeType = 11;
  }
}

class FakeTemplate extends FakeElement {
  constructor(parseFixture) {
    super('template');
    this.content = new FakeFragment();
    this.parseFixture = parseFixture;
  }

  set innerHTML(value) {
    this.content.childNodes = this.parseFixture(String(value));
  }

  get innerHTML() {
    return this.content.childNodes.map(serializeNode).join('');
  }
}

function serializeNode(node) {
  if (node.nodeType === TEXT_NODE) return escapeText(node.textContent);
  if (node.nodeType !== ELEMENT_NODE) return '';

  const attributes = Array.from(node.attributes.entries())
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
  const children = node.childNodes.map(serializeNode).join('');
  const voidTags = new Set(['br', 'hr']);
  const tagName = node.tagName.toLowerCase();
  return voidTags.has(tagName)
    ? `<${tagName}${attributes}>`
    : `<${tagName}${attributes}>${children}</${tagName}>`;
}

function text(value) {
  return new FakeTextNode(value);
}

function element(tagName, attributes = {}, children = []) {
  const node = new FakeElement(tagName);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
  children.forEach(child => node.appendChild(typeof child === 'string' ? text(child) : child));
  return node;
}

function createHarness(fixtures = {}, markedOverride) {
  const parseFixture = fixtureName => {
    const fixture = fixtures[fixtureName];
    if (!fixture) throw new Error(`Unknown HTML fixture: ${fixtureName}`);
    return fixture();
  };
  const documentRef = {
    createElement(tagName) {
      if (String(tagName).toLowerCase() === 'template') {
        return new FakeTemplate(parseFixture);
      }
      return new FakeElement(tagName);
    },
    createTextNode(value) {
      return new FakeTextNode(value);
    }
  };
  const loggedErrors = [];
  const context = vm.createContext({
    document: documentRef,
    Node: { TEXT_NODE, ELEMENT_NODE },
    URL,
    console: {
      error(...args) {
        loggedErrors.push(args);
      }
    }
  });
  if (markedOverride !== null) {
    context.marked = markedOverride || {
      parse(value) {
        return String(value);
      }
    };
  }
  vm.runInContext(SAFE_MARKDOWN_SOURCE, context, { filename: SAFE_MARKDOWN_PATH });
  return { render: context.renderSafeMarkdown, loggedErrors };
}

function openingAnchorByLabel(html) {
  return new Map(Array.from(html.matchAll(/<a([^>]*)>([^<]*)<\/a>/g), match => [
    match[2],
    match[1]
  ]));
}

test('sanitizer keeps only explicit safe URL schemes and rejects URL confusion cases', function () {
  const urls = {
    https: 'https://example.test/path?q=1#fragment',
    http: 'HTTP://EXAMPLE.TEST:80/a',
    mail: 'mailto:reader@example.test',
    hash: '#section-2',
    javascript: 'javascript:alert(1)',
    tabbedJavascript: 'java\tscript:alert(1)',
    data: 'data:text/html,<script>alert(1)</script>',
    file: 'file:///etc/passwd',
    blob: 'blob:https://example.test/id',
    protocolRelative: '//example.test/path',
    relative: '/local/path',
    username: 'https://user@example.test/private',
    password: 'https://user:secret@example.test/private',
    control: 'https://example.test/\u0000hidden'
  };
  const harness = createHarness({
    links() {
      return Object.entries(urls).map(([label, href]) => element('a', {
        href,
        id: 'open-options-link',
        onclick: 'alert(1)',
        style: 'color:red',
        target: '_blank'
      }, [label]));
    }
  });
  const html = harness.render('links');
  const anchors = openingAnchorByLabel(html);

  for (const label of ['https', 'http', 'mail', 'hash']) {
    assert.match(anchors.get(label), / href=/, `${label} should retain href`);
  }
  for (const label of [
    'javascript', 'tabbedJavascript', 'data', 'file', 'blob',
    'protocolRelative', 'relative', 'username', 'password', 'control'
  ]) {
    assert.doesNotMatch(anchors.get(label), / href=/, `${label} should lose href`);
  }
  for (const attributes of anchors.values()) {
    assert.match(attributes, / rel="noopener noreferrer"/);
    assert.doesNotMatch(attributes, /(?:onclick|style|target|id)=/);
  }
});

test('dangerous element subtrees are dropped while unknown wrappers are safely unwrapped', function () {
  const harness = createHarness({
    hostile() {
      return [
        element('p', { onclick: 'steal()', style: 'display:none', class: 'payload' }, [
          'visible ',
          element('strong', { onmouseover: 'steal()' }, ['bold'])
        ]),
        element('script', {}, ['SCRIPT_SECRET']),
        element('style', {}, ['STYLE_SECRET']),
        element('img', { src: 'x', onerror: 'steal()' }),
        element('svg', {}, [element('a', { href: 'https://evil.test/' }, ['SVG_SECRET'])]),
        element('form', {}, [element('button', {}, ['FORM_SECRET'])]),
        element('custom-widget', { onclick: 'steal()' }, [
          'unwrapped ',
          element('em', { style: 'color:red' }, ['content'])
        ])
      ];
    }
  });
  const html = harness.render('hostile');

  assert.equal(html, '<p>visible <strong>bold</strong></p>unwrapped <em>content</em>');
  assert.doesNotMatch(html, /SCRIPT_SECRET|STYLE_SECRET|SVG_SECRET|FORM_SECRET/);
  assert.doesNotMatch(html, /script|style|img|svg|form|onclick|onmouseover|class=/);
});

test('only narrow per-tag attributes survive sanitization', function () {
  const harness = createHarness({
    attributes() {
      return [
        element('code', {
          class: 'language-js evil language-c++ language-恶',
          id: 'code-id',
          onclick: 'steal()'
        }, ['const x = 1;']),
        element('table', {}, [
          element('tr', {}, [
            element('th', { align: 'CENTER', colspan: '9' }, ['head']),
            element('td', { align: 'justify', rowspan: '9' }, ['cell'])
          ])
        ]),
        element('ol', { start: '-3', reversed: '' }, [element('li', {}, ['item'])])
      ];
    }
  });
  const html = harness.render('attributes');

  assert.equal(
    html,
    '<code class="language-js language-c++">const x = 1;</code>' +
      '<table><tr><th align="center">head</th><td>cell</td></tr></table>' +
      '<ol start="-3"><li>item</li></ol>'
  );
});

test('the privileged options-link id requires an explicit boolean trust marker', function () {
  const harness = createHarness({
    options() {
      return [element('a', {
        id: 'open-options-link',
        href: '#options'
      }, ['open'])];
    }
  });

  assert.doesNotMatch(harness.render('options'), /id="open-options-link"/);
  assert.doesNotMatch(
    harness.render('options', { allowOptionsLink: 1 }),
    /id="open-options-link"/
  );
  assert.match(
    harness.render('options', { allowOptionsLink: true }),
    /id="open-options-link"/
  );
});

test('missing, throwing, and non-string Markdown parsers fall back to escaped plain text', function () {
  const rawText = '<img src=x onerror=steal()>\r\n& safe';
  const missing = createHarness({}, null);
  const throwing = createHarness({}, {
    parse() {
      throw new Error('parser failed');
    }
  });
  const nonString = createHarness({}, {
    parse() {
      return { unsafe: true };
    }
  });
  const expected = '&lt;img src=x onerror=steal()&gt;<br>&amp; safe';

  assert.equal(missing.render(rawText), expected);
  assert.equal(throwing.render(rawText), expected);
  assert.equal(nonString.render(rawText), expected);
  assert.equal(throwing.loggedErrors.length, 1);
});
