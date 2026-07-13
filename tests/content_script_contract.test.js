'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_SCRIPT_PATH = path.join(ROOT, 'content_script.js');
const CONTENT_SCRIPT_SOURCE = fs.readFileSync(CONTENT_SCRIPT_PATH, 'utf8');

function loadContentScript() {
  const listeners = new Map();
  const context = vm.createContext({
    chrome: {
      runtime: {
        async sendMessage() {
          return {};
        }
      }
    },
    document: {
      addEventListener(type, listener) {
        listeners.set(type, listener);
      }
    },
    window: {
      getSelection() {
        return null;
      }
    },
    Element: class Element {},
    URL,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(CONTENT_SCRIPT_SOURCE, context, { filename: CONTENT_SCRIPT_PATH });
  return {
    listeners,
    getBinding(name) {
      return vm.runInContext(name, context);
    }
  };
}

test('link preview markup and styles are isolated in a closed ShadowRoot', function () {
  assert.match(
    CONTENT_SCRIPT_SOURCE,
    /attachShadow\s*\(\s*\{\s*mode\s*:\s*['"]closed['"]\s*\}\s*\)/
  );
  assert.match(CONTENT_SCRIPT_SOURCE, /previewRoot\.appendChild\(style\)/);
  assert.match(CONTENT_SCRIPT_SOURCE, /previewRoot\.appendChild\(previewContent\)/);
  assert.doesNotMatch(CONTENT_SCRIPT_SOURCE, /document\.head\.appendChild\(style\)/);
  assert.doesNotMatch(CONTENT_SCRIPT_SOURCE, /previewBox\.innerHTML\s*=/);
});

test('dragged link normalization enforces raw and canonical URL limits', function () {
  const loaded = loadContentScript();
  const normalizeHttpUrl = loaded.getBinding('normalizeHttpUrl');

  assert.equal(loaded.getBinding('MAX_DRAG_DATA_CHARS'), 16384);
  assert.equal(loaded.getBinding('MAX_URL_CHARS'), 8192);
  assert.equal(
    normalizeHttpUrl('# ignored\nhttps://example.test/article'),
    'https://example.test/article'
  );
  assert.equal(normalizeHttpUrl('x'.repeat(16385)), null);
  assert.equal(normalizeHttpUrl('https://example.test/' + 'x'.repeat(8192)), null);
  assert.equal(normalizeHttpUrl('https://example.test/' + '😀'.repeat(3000)), null);
  assert.equal(normalizeHttpUrl('https://user@example.test/private'), null);
  assert.equal(normalizeHttpUrl('javascript:alert(1)'), null);
});

test('selection truncation uses a surrogate-safe prefix', function () {
  const loaded = loadContentScript();
  const takeSafePrefix = loaded.getBinding('takeSafePrefix');

  assert.equal(takeSafePrefix('A😀B', 2), 'A');
  assert.equal(takeSafePrefix('A😀B', 3), 'A😀');
});
